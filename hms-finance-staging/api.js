(() => {
  const base='https://sojtoyybfolcxezkppxc.supabase.co/functions/v1';
  const endpoints={auth:`${base}/hms-device-auth`,intake:`${base}/hms-finance-intake`,reporting:`${base}/hms-finance-reporting`,payables:`${base}/hms-finance-payables`,payments:`${base}/hms-finance-payments`,optimization:`${base}/hms-finance-optimization`};
  const TOKEN_KEY='hms.device.token.v1',DEVICE_KEY='hms.device.id.v1';
  function token(){try{return localStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function deviceId(){try{return localStorage.getItem(DEVICE_KEY)||''}catch{return''}}
  function saveSession(result){localStorage.setItem(TOKEN_KEY,result.token);localStorage.setItem(DEVICE_KEY,result.device.id)}
  function clearSession(){try{localStorage.removeItem(TOKEN_KEY)}catch{}}
  async function request(url,method='GET',body){const headers={'Content-Type':'application/json'};if(token())headers['x-hms-device-token']=token();const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.error||'request_failed');error.code=data.error;error.status=response.status;throw error}return data}
  async function validate(){if(!token())return null;try{const r=await request(endpoints.auth);return r.authenticated?r.device:null}catch(e){if(e.status===401||e.status===403)clearSession();return null}}
  async function login(password){const r=await request(endpoints.auth,'POST',{action:'login',password,deviceId:deviceId()||null,displayName:'',metadata:{userAgent:navigator.userAgent||'',platform:navigator.userAgentData?.platform||navigator.platform||'',language:navigator.language||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||''}});saveSession(r);return r.device}
  async function logout(){try{await request(endpoints.auth,'POST',{action:'logout'})}catch{}clearSession()}
  window.HMSFinanceAPI={endpoints,request,validate,login,logout,token,deviceId};
})();
