import { authenticatedDevice, audit, rest } from './lib/hms-device-session.mjs';
import { decryptSecret, encryptSecret, encryptionConfigured, pkceChallenge, randomOpaqueToken, stateHash } from './lib/hms-oauth-crypto.mjs';
import { buildAuthorizationUrl, revokeGoogleToken } from './lib/payables-gmail-client-v2.mjs';
import { defaultGoogleRedirectUri, googleOAuthPurpose, publicGoogleOAuthStatus, resolveGoogleOAuthConfig } from './lib/payables-gmail-oauth-config.mjs';

const EXPECTED_ACCOUNT='hms@healtho2.com';
const STATE_TTL_MINUTES=10;
function json(body,status=200){return Response.json(body,{status,headers:{'cache-control':'no-store'}})}
function clean(value,max=500){return String(value??'').trim().slice(0,max)}
function validClientId(value){return /^[A-Za-z0-9._-]{8,}\.apps\.googleusercontent\.com$/.test(value)}
function validRedirect(value){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='hms-dashboard-v2.netlify.app'&&url.pathname==='/.netlify/functions/payables-gmail-callback-v2'}catch{return false}}

async function connectionStatus(config,expectedAccount=EXPECTED_ACCOUNT){
  const sourceQuery=new URLSearchParams({select:'id,source_key,source_type,display_name,account_identifier,status,last_sync_cursor,last_sync_at,last_success_at,last_error,config,metadata,updated_at',source_key:`eq.gmail:${expectedAccount}`,limit:'1'});
  const credentialQuery=new URLSearchParams({select:'id,provider,account_identifier,ingestion_source_id,scopes,status,last_refresh_at,last_error,revoked_at,metadata,created_at,updated_at',provider:'eq.google',account_identifier:`eq.${expectedAccount}`,limit:'1'});
  const [sources,credentials]=await Promise.all([rest(config,`hms_finance_ingestion_sources?${sourceQuery}`),rest(config,`hms_finance_oauth_credentials?${credentialQuery}`)]);
  const source=sources?.[0]||null;const credential=credentials?.[0]||null;
  return{expectedAccount,connected:Boolean(source?.status==='connected'&&credential?.status==='active'),source,credential};
}

export default async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok');
  if(!['GET','POST'].includes(req.method))return json({error:'method_not_allowed'},405);
  let device;
  try{device=await authenticatedDevice(req,{requireAdmin:req.method==='POST'});if(!device)return json({error:req.method==='POST'?'admin_device_required':'device_session_required'},req.method==='POST'?403:401)}catch(error){return json({error:'gmail_connection_status_unavailable',detail:error instanceof Error?error.message:String(error)},503)}
  try{
    const resolved=await resolveGoogleOAuthConfig(device.config);
    if(req.method==='GET')return json({ok:true,oauth:publicGoogleOAuthStatus(resolved),connection:await connectionStatus(device.config),device:{id:device.id,isAdmin:device.isAdmin}});
    const body=await req.json().catch(()=>({}));const action=clean(body.action,50);const expectedAccount=clean(body.account||EXPECTED_ACCOUNT,300).toLowerCase();
    if(expectedAccount!==EXPECTED_ACCOUNT)return json({error:'unsupported_gmail_account',expectedAccount:EXPECTED_ACCOUNT},400);

    if(action==='configure-client'){
      if(!encryptionConfigured())return json({error:'token_encryption_not_configured'},503);
      const clientId=clean(body.clientId,500);const clientSecret=clean(body.clientSecret,1000);
      const redirectUri=clean(body.redirectUri||defaultGoogleRedirectUri().replace('payables-gmail-callback','payables-gmail-callback-v2'),1000);
      if(!validClientId(clientId))return json({error:'invalid_google_client_id'},400);
      if(clientSecret.length<12)return json({error:'invalid_google_client_secret'},400);
      if(!validRedirect(redirectUri))return json({error:'invalid_google_redirect_uri',requiredRedirectUri:'https://hms-dashboard-v2.netlify.app/.netlify/functions/payables-gmail-callback-v2'},400);
      const purpose=googleOAuthPurpose();const encrypted=encryptSecret(clientSecret,`integration-config:google:${purpose}`);
      const rows=await rest(device.config,'hms_finance_integration_configs?on_conflict=provider%2Cpurpose',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',body:{provider:'google',purpose,client_id:clientId,client_secret_ciphertext:encrypted.ciphertext,client_secret_iv:encrypted.iv,redirect_uri:redirectUri,status:'active',configured_by_device_id:device.id,last_error:null,metadata:{secret_encrypted:true,configured_via:'payables_admin_ui'},updated_at:new Date().toISOString()}});
      const saved=rows?.[0];if(!saved)throw new Error('google_client_config_save_failed');
      await audit(device.config,'gmail_oauth_client_configured','integration_config',saved.id,device.id,null,{provider:'google',purpose,client_id:clientId,redirect_uri:redirectUri,status:'active'},{secretPlaintextStored:false});
      const after=await resolveGoogleOAuthConfig(device.config);
      return json({ok:true,oauth:publicGoogleOAuthStatus(after)});
    }

    if(action==='remove-client-config'){
      const purpose=googleOAuthPurpose();const query=new URLSearchParams({select:'id,provider,purpose,client_id,redirect_uri,status',provider:'eq.google',purpose:`eq.${purpose}`,limit:'1'});const before=(await rest(device.config,`hms_finance_integration_configs?${query}`))?.[0];
      if(!before)return json({ok:true,alreadyRemoved:true});
      const connection=await connectionStatus(device.config,expectedAccount);if(connection.connected)return json({error:'disconnect_gmail_before_removing_client_config'},409);
      await rest(device.config,`hms_finance_integration_configs?id=eq.${encodeURIComponent(before.id)}`,{method:'DELETE',prefer:'return=minimal'});
      await audit(device.config,'gmail_oauth_client_removed','integration_config',before.id,device.id,before,null,{secretPlaintextReturned:false});
      return json({ok:true,removed:true});
    }

    if(action==='start'){
      const oauth=await resolveGoogleOAuthConfig(device.config);if(!oauth.configured)return json({error:'google_oauth_setup_required',missing:oauth.missing,redirectUri:oauth.redirectUri},503);
      await rest(device.config,'rpc/hms_finance_cleanup_oauth_states',{method:'POST',body:{}}).catch(()=>undefined);
      const state=randomOpaqueToken(32);const digest=stateHash(state);const verifier=randomOpaqueToken(64);const encryptedVerifier=encryptSecret(verifier,`oauth-state:${digest}`);const expiresAt=new Date(Date.now()+STATE_TTL_MINUTES*60000).toISOString();
      await rest(device.config,'hms_finance_oauth_states',{method:'POST',prefer:'return=minimal',body:{provider:'google',state_hash:digest,expected_account:expectedAccount,redirect_uri:oauth.redirectUri,pkce_ciphertext:encryptedVerifier.ciphertext,pkce_iv:encryptedVerifier.iv,requested_scopes:['https://www.googleapis.com/auth/gmail.readonly'],requested_by_device_id:device.id,expires_at:expiresAt,metadata:{pkce_method:'S256',purpose:'hms_payables_discovery_v2'}}});
      const authorizationUrl=buildAuthorizationUrl({oauthConfig:oauth,state,codeChallenge:pkceChallenge(verifier),expectedAccount,redirectUri:oauth.redirectUri});
      await audit(device.config,'gmail_oauth_started','ingestion_source',`gmail:${expectedAccount}`,device.id,null,null,{expiresAt,scope:'gmail.readonly',configSource:oauth.source});
      return json({ok:true,authorizationUrl,expiresAt,expectedAccount});
    }

    if(action==='disconnect'){
      const connection=await connectionStatus(device.config,expectedAccount);const credential=connection.credential;if(!credential)return json({ok:true,alreadyDisconnected:true});
      const fullQuery=new URLSearchParams({select:'*',id:`eq.${credential.id}`,limit:'1'});const full=(await rest(device.config,`hms_finance_oauth_credentials?${fullQuery}`))?.[0];let providerRevoked=false;
      if(full?.refresh_token_ciphertext&&full?.refresh_token_iv&&encryptionConfigured()){try{const token=decryptSecret(full.refresh_token_ciphertext,full.refresh_token_iv,`oauth-credential:google:${expectedAccount}`);providerRevoked=await revokeGoogleToken(token)}catch{providerRevoked=false}}
      const now=new Date().toISOString();await rest(device.config,`hms_finance_oauth_credentials?id=eq.${encodeURIComponent(credential.id)}`,{method:'PATCH',prefer:'return=minimal',body:{status:'revoked',revoked_at:now,updated_at:now,last_error:null}});
      if(connection.source?.id)await rest(device.config,`hms_finance_ingestion_sources?id=eq.${encodeURIComponent(connection.source.id)}`,{method:'PATCH',prefer:'return=minimal',body:{status:'not_connected',credential_reference:null,updated_at:now}});
      await audit(device.config,'gmail_oauth_disconnected','ingestion_source',`gmail:${expectedAccount}`,device.id,connection,null,{providerRevoked});return json({ok:true,disconnected:true,providerRevoked});
    }
    return json({error:'unknown_action'},400);
  }catch(error){console.error('payables-gmail-auth-v2 failed',error instanceof Error?error.message:String(error));return json({error:'gmail_connection_error',detail:error instanceof Error?error.message.slice(0,400):'unknown'},500)}
};
