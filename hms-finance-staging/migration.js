(() => {
  const API=window.HMSFinanceAPI;
  const SETUP='/.netlify/functions/payables-finance-sync';
  const $=id=>document.getElementById(id);
  const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const fmtDate=value=>{if(!value)return 'Never';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()};
  const monthLabel=value=>{
    if(!/^\d{4}-\d{2}$/.test(String(value||'')))return value||'Current';
    const [year,month]=value.split('-').map(Number);
    return new Date(Date.UTC(year,month-1,1)).toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
  };
  let isAdmin=false;
  let copyLocked=false;
  let sourceReady=false;

  function styleStep(id,state,text){
    const el=$(id);
    if(!el)return;
    el.classList.remove('good','warn');
    if(state)el.classList.add(state);
    if(text)set(`${id}Text`,text);
  }

  async function setupRequest(method='GET',payload){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),method==='GET'?15000:35000);
    const headers={'Content-Type':'application/json'};
    const token=API.token();
    if(token)headers['x-hms-device-token']=token;
    try{
      const response=await fetch(SETUP,{
        method,
        headers,
        body:method==='POST'?JSON.stringify(payload||{}):undefined,
        signal:controller.signal
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const error=new Error(body.error||'setup_request_failed');
        error.code=body.error;
        error.status=response.status;
        error.detail=body.detail;
        throw error;
      }
      return body;
    }catch(error){
      if(error?.name==='AbortError'){
        const timeoutError=new Error('setup_request_timeout');
        timeoutError.code='setup_request_timeout';
        throw timeoutError;
      }
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  function renderComparison(parity,db){
    set('parityCounts',parity?.expected==null?'Not run':`${parity.expected} expected / ${parity.actual} copied`);
    set('parityTotal',parity?.mismatchTotal??'—');
    set('parityRows',parity?.expected==null?'—':`${parity.missing||0} missing / ${parity.extra||0} extra`);
    set('parityMoneyStatus',parity?.expected==null?'—':`${parity.amountMismatch||0} amount / ${parity.statusMismatch||0} status`);
    const classification=(parity?.kindMismatch||0)+(parity?.accountMismatch||0)+(parity?.clinicMismatch||0)+(parity?.recurringRuleMismatch||0)+(parity?.reviewFlagMismatch||0);
    set('parityClassification',parity?.expected==null?'—':`${classification} differences`);
    const approvals=(parity?.authorizationMissing||0)+(parity?.authorizationUnexpected||0)+(parity?.authorizationAmountMismatch||0);
    set('parityApproval',parity?.expected==null?'—':`${approvals} differences`);
    const vendors=parity?.vendors||{},rules=parity?.recurringRules||{};
    set('parityMasterData',parity?.expected==null?'—':`vendors ${vendors.expected??0}/${vendors.actual??0}; rules ${rules.expected??0}/${rules.actual??0}`);
    set('lastSuccess',fmtDate(db?.sync?.last_success_at));
  }

  function renderSetup(result){
    const source=result?.source||{};
    const db=result?.database||{};
    const parity=db.parity||null;
    copyLocked=Boolean(db.syncLocked);
    sourceReady=Boolean(source.readable&&source.ready);

    set('sourceMonth',monthLabel(source.selectedMonth));
    set('sourceRecurring',source.readable?source.recurringItems??0:'—');
    set('sourceOneTime',source.readable?source.oneTimeItems??0:'—');
    set('sourceTotal',source.readable?source.totalItemsToCompare??source.selectedItems??0:'—');
    renderComparison(parity,db);

    if(source.readable){
      set('sourceStatus','Existing Payables found');
      $('sourceStatus').className='setup-status good';
      set('sourceDetail',`${source.selectedItems||0} item(s) are ready for ${monthLabel(source.selectedMonth)}. The setup copy is created without changing the current Payables list.`);
    }else{
      set('sourceStatus','Existing Payables could not be read');
      $('sourceStatus').className='setup-status bad';
      set('sourceDetail',source.error?`Source check failed: ${source.error}. Refresh after the service recovers.`:'The current Payables list is temporarily unavailable.');
    }

    const gate=$('gateStatus');
    if(db.error){
      gate.textContent='New Finance database could not be checked';
      gate.className='setup-status bad';
      set('statusDetail',`Database check failed: ${db.error}. No copy or system switch occurred.`);
      styleStep('stepCopy','warn','Database check unavailable');
    }else if(copyLocked){
      gate.textContent='Copy locked after Finance activity';
      gate.className='setup-status warn';
      set('statusDetail','Copied records have entered the payment or accounting workflow. The copy cannot be overwritten. The current authority has not changed automatically.');
      styleStep('stepCopy','warn','Locked against overwrite');
    }else if(db.passed){
      gate.textContent='Copy is exact — system not switched';
      gate.className='setup-status good';
      set('statusDetail','The copied records match the existing Payables list. The current Payables page remains authoritative until a separate switch is approved.');
      styleStep('stepCopy','good','Exact copy confirmed');
      styleStep('stepSwitch','warn','Ready for separate review');
    }else if(db.sync){
      gate.textContent=db.sync.status==='partial'?'Copy needs correction':'Copy not verified';
      gate.className='setup-status bad';
      set('statusDetail',db.sync.error_text||'The copy does not yet match the current list. Review the technical comparison before trying again.');
      styleStep('stepCopy','warn','Differences found');
    }else if(sourceReady){
      gate.textContent='Ready to copy and compare';
      gate.className='setup-status warn';
      set('statusDetail','Click “Copy and compare.” This does not pay anything and does not switch systems.');
      styleStep('stepCopy','warn','Ready');
    }else{
      gate.textContent='Waiting for existing Payables';
      gate.className='setup-status bad';
      set('statusDetail','The source list must be readable before it can be copied.');
      styleStep('stepCopy','warn','Source unavailable');
    }

    $('runSync').disabled=!isAdmin||copyLocked||!sourceReady||Boolean(db.error);
  }

  function renderQc(payload){
    const latest=payload?.latest||null;
    const result=payload?.result||latest?.after_state||null;
    $('runQc').disabled=!isAdmin;

    if(!result){
      set('qcStatus','Ready to run');
      $('qcStatus').className='setup-status warn';
      set('qcDetail','The check uses temporary test records and rolls them back automatically.');
      styleStep('stepQc','warn','Ready');
      return;
    }

    const tests=result.core?.tests||{};
    const passed=Object.values(tests).filter(test=>test?.passed===true).length;
    const total=Object.values(tests).length;
    if(result.passed){
      set('qcStatus','System check passed');
      $('qcStatus').className='setup-status good';
      set('qcDetail',`${passed}/${total} core workflow tests and the ledger-protection tests passed. Test records were rolled back.`);
      styleStep('stepQc','good','Passed');
    }else{
      set('qcStatus','System check needs attention');
      $('qcStatus').className='setup-status bad';
      set('qcDetail','One or more rollback-safe tests failed. Do not switch systems until corrected.');
      styleStep('stepQc','warn','Needs attention');
    }
  }

  async function loadSetup(){
    set('sourceStatus','Reading existing Payables…');
    $('sourceStatus').className='setup-status warn';
    try{
      renderSetup(await setupRequest('GET'));
    }catch(error){
      set('sourceStatus','Setup status unavailable');
      $('sourceStatus').className='setup-status bad';
      set('sourceDetail',error.code==='setup_request_timeout'?'The status check timed out. The page is no longer stuck; use Refresh to retry.':error.detail||error.code||'The setup service could not be reached.');
      set('gateStatus','Nothing was copied');
      $('gateStatus').className='setup-status bad';
      set('statusDetail','The current Payables page is still active and unchanged.');
      $('runSync').disabled=true;
      styleStep('stepCopy','warn','Status unavailable');
    }
  }

  async function loadQc(){
    try{renderQc(await API.request(API.endpoints.qc));}
    catch(error){
      set('qcStatus',error.status===403?'Admin browser required':'System-check status unavailable');
      $('qcStatus').className='setup-status bad';
      set('qcDetail',error.status===403?'Only an administrator browser can run this check.':'The check service could not be reached.');
      styleStep('stepQc','warn','Status unavailable');
    }
  }

  async function loadAll(){await Promise.all([loadSetup(),loadQc()]);}

  async function showWorkspace(device){
    $('loginPanel').hidden=true;
    $('workspace').hidden=false;
    isAdmin=Boolean(device?.isAdmin);
    set('deviceState',`${device?.displayName||'This browser'}${isAdmin?' · Administrator':' · Read only'}`);
    styleStep('stepAccess','good',isAdmin?'Administrator connected':'Connected, read only');
    $('runQc').disabled=!isAdmin;
    $('runSync').disabled=true;
    await loadAll();
  }

  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=event.target.querySelector('button');
    button.disabled=true;
    set('loginStatus','Checking…');
    try{
      const device=await API.login($('password').value);
      $('password').value='';
      set('loginStatus','');
      await showWorkspace(device);
    }catch(error){
      set('loginStatus',error.code==='invalid_password'?'Incorrect password.':error.code==='device_blocked'?'This browser has been blocked.':'Access unavailable.');
    }finally{button.disabled=false;}
  });

  $('refresh').addEventListener('click',loadAll);

  $('runQc').addEventListener('click',async()=>{
    const button=$('runQc');
    button.disabled=true;
    set('qcStatus','Running system check…');
    $('qcStatus').className='setup-status warn';
    set('qcDetail','Testing the workflow with temporary records that will be rolled back.');
    try{
      const response=await API.request(API.endpoints.qc,'POST',{});
      renderQc({result:response.result,latest:{occurred_at:response.result?.ran_at,after_state:response.result}});
    }catch(error){
      set('qcStatus','System check could not run');
      $('qcStatus').className='setup-status bad';
      set('qcDetail',error.code||'The system-check service was unavailable.');
      styleStep('stepQc','warn','Could not run');
    }finally{button.disabled=!isAdmin;}
  });

  $('runSync').addEventListener('click',async()=>{
    const button=$('runSync');
    button.disabled=true;
    set('gateStatus','Copying and comparing…');
    $('gateStatus').className='setup-status warn';
    set('statusDetail','Copying the existing list into the new database and checking amounts, clinics, categories, types, rules, and approvals. No payment or system switch is occurring.');
    try{
      const result=await setupRequest('POST',{action:'copy-and-compare'});
      renderSetup(result);
    }catch(error){
      set('gateStatus','Copy was not completed');
      $('gateStatus').className='setup-status bad';
      set('statusDetail',error.code==='setup_request_timeout'?'The comparison timed out. The current Payables page remains active and unchanged.':error.detail||error.code||'The setup copy failed. The current Payables page remains active.');
      styleStep('stepCopy','warn','Not completed');
    }finally{button.disabled=!isAdmin||copyLocked||!sourceReady;}
  });

  API.validate().then(device=>{
    if(device)showWorkspace(device);
    else $('loginPanel').hidden=false;
  }).catch(()=>{
    $('loginPanel').hidden=false;
    set('loginStatus','Access unavailable.');
  });
})();
