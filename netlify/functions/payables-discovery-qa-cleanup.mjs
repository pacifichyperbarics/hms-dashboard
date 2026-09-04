import { authenticatedDevice, rest } from './lib/hms-device-session.mjs';

const BUCKET = 'hms-finance-evidence';
function json(body,status=200){return Response.json(body,{status,headers:{'cache-control':'no-store'}})}
function encodePath(path){return String(path||'').split('/').map(encodeURIComponent).join('/')}
async function removeObject(config,path){
  const response=await fetch(`${config.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`,{
    method:'DELETE',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`}
  });
  if(!response.ok&&response.status!==404){const detail=await response.text().catch(()=> '');throw new Error(`storage_cleanup_${response.status}:${detail.slice(0,200)}`)}
}
export default async(req)=>{
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  const device=await authenticatedDevice(req,{requireAdmin:true});
  if(!device)return json({error:'admin_device_required'},403);
  const body=await req.json().catch(()=>({}));
  const intakeId=String(body.intakeId||'').trim();
  if(!intakeId)return json({error:'intake_id_required'},400);
  const query=new URLSearchParams({select:'id,review_status,matched_payable_id,candidate_payee,candidate_invoice_number,ingestion_run_id,metadata',id:`eq.${intakeId}`,limit:'1'});
  const item=(await rest(device.config,`hms_finance_intake_items?${query}`))?.[0];
  if(!item)return json({ok:true,alreadyRemoved:true});
  const qa=item.candidate_payee==='QA Exact Upload Vendor'&&item.candidate_invoice_number==='QA-UPLOAD-20260903';
  if(!qa||item.matched_payable_id||!['needs_review','duplicate','rejected','held'].includes(item.review_status))return json({error:'qa_cleanup_not_allowed'},409);
  const eq=new URLSearchParams({select:'storage_path',intake_id:`eq.${intakeId}`});
  const evidence=await rest(device.config,`hms_finance_intake_evidence?${eq}`);
  for(const row of evidence)if(row.storage_path)await removeObject(device.config,row.storage_path);
  await rest(device.config,`hms_finance_intake_items?id=eq.${encodeURIComponent(intakeId)}`,{method:'DELETE',prefer:'return=minimal'});
  if(item.ingestion_run_id)await rest(device.config,`hms_finance_ingestion_runs?id=eq.${encodeURIComponent(item.ingestion_run_id)}`,{method:'DELETE',prefer:'return=minimal'});
  return json({ok:true,removed:true,files:evidence.length});
};
