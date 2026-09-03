(() => {
  const API=window.HMSFinanceAPI;
  const SYNC='/.netlify/functions/payables-finance-sync';
  const $=id=>document.getElementById(id);
  const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const fmtDate=value=>{if(!value)return 'Never';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()};

  async function syncRequest(method='GET'){
    const headers={'Content-Type':'application/json'};
    const token=API.token();
    if(token)headers['x-hms-device-token']=token;
    const response=await fetch(SYNC,{method,headers});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(body.error||'migration_request_failed');error.code=body.error;error.status=response.status;throw error;}
    return body;
  }

  function render(result){
    const source=result.source||{};
    const db=result.database||{};
    const parity=db.parity||{};
    set('sourceItems',source.items??0);set('sourceRuns',source.runs??0);set('sourceInstances',source.instances??0);set('sourceUpdated',source.updatedAt?fmtDate(source.updatedAt):'Unknown');
    set('dbVendors',db.vendors??0);set('dbRules',db.recurringRules??0);set('dbPayables',db.payables??0);set('dbAuth',db.activeAuthorizations??0);
    set('parityCounts',parity.expected==null?'Not run':`${parity.expected} expected / ${parity.actual} actual`);
    set('parityMissing',parity.missing??'—');set('parityExtra',parity.extra??'—');set('parityAmount',parity.amountMismatch??'—');set('parityStatus',parity.statusMismatch??'—');set('lastSuccess',fmtDate(db.sync?.last_success_at));
    const gate=$('gateStatus');
    if(db.passed){gate.textContent='Parity passed — not cut over';gate.className='gate-status good';set('statusDetail','The current legacy source and Postgres shadow match on migration parity checks. Legacy Payables is still the authority until a separate controlled cutover.');}
    else if(db.sync){gate.textContent=db.sync.status==='partial'?'Parity mismatch':'Parity not passed';gate.className='gate-status bad';set('statusDetail',db.sync.error_text||'Review the mismatch counts below and rerun after correction.');}
    else{gate.textContent='Parity not yet run';gate.className='gate-status warn';set('statusDetail','No successful legacy Payables parity run has been recorded yet.');}
  }

  async function load(){
    set('statusDetail','Loading migration status…');
    try{render(await syncRequest('GET'));}
    catch(error){
      if(error.status===403){set('gateStatus','Admin browser required');$('gateStatus').className='gate-status bad';set('statusDetail','This migration gate can only be viewed or run from an enrolled HMS admin browser.');$('runSync').disabled=true;}
      else{set('gateStatus','Status unavailable');$('gateStatus').className='gate-status bad';set('statusDetail','Could not read migration status.');}
    }
  }

  async function showWorkspace(device){
    $('loginPanel').hidden=true;$('workspace').hidden=false;
    set('deviceState',`${device?.displayName||'Authorized browser'}${device?.isAdmin?' · Admin':' · Not admin'}`);
    $('runSync').disabled=!device?.isAdmin;
    await load();
  }

  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;set('loginStatus','Checking…');
    try{const device=await API.login($('password').value);$('password').value='';set('loginStatus','');await showWorkspace(device);}
    catch(error){set('loginStatus',error.code==='invalid_password'?'Incorrect password.':error.code==='device_blocked'?'This browser has been blocked.':'Access unavailable.');}
    finally{button.disabled=false;}
  });

  $('refresh').addEventListener('click',load);
  $('runSync').addEventListener('click',async()=>{
    const button=$('runSync');button.disabled=true;set('gateStatus','Running parity sync…');$('gateStatus').className='gate-status warn';set('statusDetail','Copying the legacy Blob state into the Postgres shadow and comparing records. No authority change or payment occurs.');
    try{const result=await syncRequest('POST');render({source:result.database?.sync?.stats?.source?result.database.sync.stats.source:undefined,database:result.database});await load();}
    catch(error){set('gateStatus','Parity sync failed');$('gateStatus').className='gate-status bad';set('statusDetail',error.code||'The migration sync failed. Legacy Payables remains authoritative.');}
    finally{button.disabled=false;}
  });

  API.validate().then(device=>{
    if(device)showWorkspace(device);else $('loginPanel').hidden=false;
  }).catch(()=>{$('loginPanel').hidden=false;set('loginStatus','Access unavailable.');});
})();
