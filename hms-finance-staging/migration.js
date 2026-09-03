(() => {
  const API=window.HMSFinanceAPI;
  const SYNC='/.netlify/functions/payables-finance-sync';
  const $=id=>document.getElementById(id);
  const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const fmtDate=value=>{if(!value)return 'Never';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()};
  let isAdmin=false;
  let syncLocked=false;
  let sourceReady=false;

  $('sourceMonth').value=new Date().toISOString().slice(0,7);

  async function syncRequest(method='GET',payload){
    const headers={'Content-Type':'application/json'};
    const token=API.token();
    if(token)headers['x-hms-device-token']=token;
    const response=await fetch(SYNC,{method,headers,body:method==='POST'?JSON.stringify(payload||{}):undefined});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(body.error||'migration_request_failed');
      error.code=body.error;
      error.status=response.status;
      error.detail=body.detail;
      error.source=body.source;
      throw error;
    }
    return body;
  }

  function render(result){
    const source=result.source||{};
    const db=result.database||{};
    const parity=db.parity||{};
    syncLocked=Boolean(db.syncLocked);
    sourceReady=Boolean(source.readyForParity);
    $('runSync').disabled=!isAdmin||syncLocked||!sourceReady;
    $('initializeMonth').disabled=!isAdmin||syncLocked;

    set('sourceItems',source.items??0);
    set('sourceRuns',source.runs??0);
    set('sourceInstances',source.instances??0);
    set('sourceUpdated',source.updatedAt?fmtDate(source.updatedAt):'Unknown');
    const months=Array.isArray(source.months)?source.months:[];
    set('sourceMonths',months.length
      ? `Persisted months: ${months.map(row=>`${row.month} (${row.instances} items, ${row.approvals} approvals recorded)`).join(' · ')}`
      : 'Persisted months: none');

    set('dbVendors',db.vendors??0);
    set('dbRules',db.recurringRules??0);
    set('dbPayables',db.payables??0);
    set('dbAuth',db.activeAuthorizations??0);
    set('parityCounts',parity.expected==null?'Not run':`${parity.expected} expected / ${parity.actual} actual`);
    set('parityTotal',parity.mismatchTotal??'—');
    set('parityRows',parity.expected==null?'—':`${parity.missing||0} missing / ${parity.extra||0} extra`);
    set('parityMoneyStatus',parity.expected==null?'—':`${parity.amountMismatch||0} amount / ${parity.statusMismatch||0} status`);
    const classTotal=(parity.kindMismatch||0)+(parity.accountMismatch||0)+(parity.clinicMismatch||0)+(parity.recurringRuleMismatch||0)+(parity.reviewFlagMismatch||0);
    set('parityClassification',parity.expected==null?'—':`${classTotal} total · kind ${parity.kindMismatch||0}, clinic ${parity.clinicMismatch||0}, account ${parity.accountMismatch||0}, rule ${parity.recurringRuleMismatch||0}, review ${parity.reviewFlagMismatch||0}`);
    const approvalTotal=(parity.authorizationMissing||0)+(parity.authorizationUnexpected||0)+(parity.authorizationAmountMismatch||0);
    set('parityApproval',parity.expected==null?'—':`${approvalTotal} total · missing ${parity.authorizationMissing||0}, extra ${parity.authorizationUnexpected||0}, amount ${parity.authorizationAmountMismatch||0}`);
    const vendors=parity.vendors||{},rules=parity.recurringRules||{};
    set('parityMasterData',parity.expected==null?'—':`vendors ${vendors.expected??0}/${vendors.actual??0} (−${vendors.missing||0}/+${vendors.extra||0}); rules ${rules.expected??0}/${rules.actual??0} (−${rules.missing||0}/+${rules.extra||0})`);
    set('lastSuccess',fmtDate(db.sync?.last_success_at));

    const gate=$('gateStatus');
    if(syncLocked){
      gate.textContent='Parity sync locked after finance activity';
      gate.className='gate-status warn';
      set('statusDetail',`${db.operationalLegacyCount||0} migrated legacy payable(s) have entered payment/reconciliation/posting state. The mapper is locked to prevent status regression.`);
    }else if(!sourceReady){
      gate.textContent='Initialize the intended legacy month';
      gate.className='gate-status warn';
      set('statusDetail','The legacy Blob has payable definitions but no persisted monthly instances. Choose the month above and initialize it before running parity. This creates only the month work area; it does not approve or pay anything.');
    }else if(db.passed){
      gate.textContent='Parity passed — not cut over';
      gate.className='gate-status good';
      set('statusDetail','Finance-grade parity passed: records, amounts, statuses, coding, location/rule linkage, review flags, master data, and approval state agree. Legacy Payables is still the authority until a separate controlled cutover.');
    }else if(db.sync){
      gate.textContent=db.sync.status==='partial'?'Parity mismatch':'Parity not passed';
      gate.className='gate-status bad';
      set('statusDetail',db.sync.error_text||'Review the mismatch counts below and rerun after correction.');
    }else{
      gate.textContent='Parity not yet run';
      gate.className='gate-status warn';
      set('statusDetail','The legacy month is available, but no successful finance-grade parity run has been recorded yet.');
    }
  }

  function renderQc(payload){
    const latest=payload?.latest||null;
    const result=payload?.result||latest?.after_state||null;
    const status=$('qcStatus');
    $('runQc').disabled=!isAdmin;

    if(!result){
      status.textContent='Not yet run from this interface';
      status.className='gate-status warn';
      set('qcDetail','An admin can run the rollback-safe checks before parity. No payable, payment, bank, or journal test records will remain.');
      set('qcCore','Not recorded');
      set('qcLedger','Not recorded');
      set('qcLastRun','Never');
      return;
    }

    const tests=result.core?.tests||{};
    const values=Object.values(tests);
    const passed=values.filter(test=>test?.passed===true).length;
    const total=values.length;
    set('qcCore',`${passed}/${total} passed`);
    set('qcLedger',result.ledger_headers?.passed?'Passed':'Failed');
    set('qcLastRun',fmtDate(latest?.occurred_at||result.ran_at));

    if(result.passed){
      status.textContent='System QC passed';
      status.className='gate-status good';
      set('qcDetail','Core workflows and posted-ledger safeguards passed. The test transaction rolled back; only this result was added to the audit trail.');
    }else{
      status.textContent='System QC failed';
      status.className='gate-status bad';
      const failures=Object.entries(tests).filter(([,test])=>!test?.passed).map(([name])=>name.replaceAll('_',' '));
      if(result.ledger_headers?.passed===false)failures.push('posted ledger protection');
      set('qcDetail',failures.length?`Failed: ${failures.join(', ')}.`:'Review the recorded QC result before parity.');
    }
  }

  async function loadMigration(){
    set('statusDetail','Loading migration status…');
    try{render(await syncRequest('GET'));}
    catch(error){
      if(error.status===403){
        set('gateStatus','Admin browser required');
        $('gateStatus').className='gate-status bad';
        set('statusDetail','This migration gate can only be viewed or run from an enrolled HMS admin browser.');
        $('runSync').disabled=true;
        $('initializeMonth').disabled=true;
      }else{
        set('gateStatus','Status unavailable');
        $('gateStatus').className='gate-status bad';
        set('statusDetail','Could not read migration status.');
      }
    }
  }

  async function loadQc(){
    try{renderQc(await API.request(API.endpoints.qc));}
    catch(error){
      $('runQc').disabled=!isAdmin;
      set('qcStatus',error.status===403?'Admin browser required':'QC status unavailable');
      $('qcStatus').className='gate-status bad';
      set('qcDetail',error.status===403?'Only an admin browser can run Finance QC.':'Could not read the latest QC result.');
    }
  }

  async function loadAll(){
    await Promise.all([loadMigration(),loadQc()]);
  }

  async function showWorkspace(device){
    $('loginPanel').hidden=true;
    $('workspace').hidden=false;
    isAdmin=Boolean(device?.isAdmin);
    set('deviceState',`${device?.displayName||'Authorized browser'}${isAdmin?' · Admin':' · Not admin'}`);
    $('runSync').disabled=true;
    $('initializeMonth').disabled=!isAdmin;
    $('runQc').disabled=!isAdmin;
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
    set('qcStatus','Running rollback-safe QC…');
    $('qcStatus').className='gate-status warn';
    set('qcDetail','Testing core workflows and ledger safeguards. All QA records are contained in rollback transactions.');
    try{
      const response=await API.request(API.endpoints.qc,'POST',{});
      renderQc({result:response.result,latest:{occurred_at:response.result?.ran_at,after_state:response.result}});
    }catch(error){
      set('qcStatus','System QC failed to run');
      $('qcStatus').className='gate-status bad';
      set('qcDetail',error.code||'The QC service was unavailable.');
    }finally{
      button.disabled=!isAdmin;
    }
  });

  $('initializeMonth').addEventListener('click',async()=>{
    const button=$('initializeMonth');
    const month=$('sourceMonth').value;
    button.disabled=true;
    $('runSync').disabled=true;
    set('gateStatus','Initializing legacy month…');
    $('gateStatus').className='gate-status warn';
    set('statusDetail','Creating the selected monthly work area in Legacy Payables. No approval, payment, cutover, or Postgres copy is occurring.');
    try{
      await syncRequest('POST',{action:'initialize-month',month});
      await loadMigration();
    }catch(error){
      set('gateStatus','Month initialization failed');
      $('gateStatus').className='gate-status bad';
      set('statusDetail',error.detail||error.code||'Could not initialize the selected legacy month.');
    }finally{
      button.disabled=!isAdmin||syncLocked;
      $('runSync').disabled=!isAdmin||syncLocked||!sourceReady;
    }
  });

  $('runSync').addEventListener('click',async()=>{
    const button=$('runSync');
    button.disabled=true;
    set('gateStatus','Running finance-grade parity sync…');
    $('gateStatus').className='gate-status warn';
    set('statusDetail','Copying the persisted legacy monthly instances into the Postgres shadow and checking records, coding, location, rules, review flags, and approval state. No authority change or payment occurs.');
    try{
      await syncRequest('POST',{action:'sync'});
      await loadMigration();
    }catch(error){
      const noMonth=error.code==='legacy_payables_no_persisted_month_runs';
      set('gateStatus',error.code==='migration_locked_after_finance_activity'?'Parity sync locked':noMonth?'Initialize a legacy month':'Parity sync failed');
      $('gateStatus').className='gate-status bad';
      set('statusDetail',error.detail||error.code||'The migration sync failed. Legacy Payables remains authoritative.');
    }finally{
      button.disabled=!isAdmin||syncLocked||!sourceReady;
    }
  });

  API.validate().then(device=>{
    if(device)showWorkspace(device);
    else $('loginPanel').hidden=false;
  }).catch(()=>{
    $('loginPanel').hidden=false;
    set('loginStatus','Access unavailable.');
  });
})();
