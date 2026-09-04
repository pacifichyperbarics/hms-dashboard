(() => {
  const API=window.HMSFinanceAPI;
  const $=id=>document.getElementById(id);
  let device=null;
  let connection=null;
  let oauth=null;

  function set(id,value){const element=$(id);if(element)element.textContent=value;}
  function formatDate(value){
    if(!value)return 'Never';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString();
  }
  function showResult(message,kind='info'){
    const box=$('actionResult');
    box.hidden=false;
    box.textContent=message;
    box.style.borderLeftColor=kind==='good'?'var(--green)':kind==='bad'?'var(--red)':'var(--blue)';
    box.style.background=kind==='good'?'var(--greenbg)':kind==='bad'?'var(--redbg)':'var(--soft)';
  }
  function clearResult(){$('actionResult').hidden=true;$('actionResult').textContent='';}

  function render(status){
    oauth=status.oauth||{};
    connection=status.connection||{};
    const connected=Boolean(connection.connected);
    const source=connection.source||{};
    set('mailbox',connection.expectedAccount||'hms@healtho2.com');
    set('lastScan',formatDate(source.last_success_at));
    $('connect').hidden=connected;
    $('scan').hidden=!connected;
    $('disconnect').hidden=!connected;
    $('connect').disabled=!device?.isAdmin||!oauth.configured;
    $('scan').disabled=!device?.isAdmin;
    $('disconnect').disabled=!device?.isAdmin;

    const dot=$('stateDot');
    dot.className='state-dot';
    if(connected){
      dot.classList.add('good');
      set('connectionState','Connected');
      set('connectionMessage',source.last_error?`Connected, but the last scan reported: ${source.last_error}`:'Read-only Gmail discovery is connected. New mail will be checked automatically.');
    }else if(!oauth.configured){
      dot.classList.add('bad');
      set('connectionState','Google setup required');
      const missing=(oauth.missing||[]).join(', ');
      set('connectionMessage',missing?`The app is ready, but the Google OAuth client has not been installed on Netlify. Missing configuration: ${missing}.`:'The Google OAuth client has not been installed on Netlify.');
    }else if(source.status==='error'){
      dot.classList.add('bad');
      set('connectionState','Reconnect required');
      set('connectionMessage',source.last_error||'The Gmail authorization is no longer valid. Reconnect the mailbox.');
    }else{
      set('connectionState','Not connected');
      set('connectionMessage',device?.isAdmin?'Click Connect Gmail and choose hms@healtho2.com. Google will ask for read-only mailbox permission once.':'An administrator must connect the mailbox.');
    }
  }

  async function load(){
    set('connectionMessage','Loading connection status…');
    try{
      const status=await API.request(API.endpoints.gmailAuth,'GET',undefined,{timeoutMs:20000});
      render(status);
    }catch(error){
      set('connectionState','Status unavailable');
      set('connectionMessage',error.code==='request_timeout'?'The connection check timed out. No mailbox or payment data changed.':error.detail||error.code||'Could not read Gmail connection status.');
      $('stateDot').className='state-dot bad';
      $('connect').disabled=true;
      $('scan').hidden=true;
      $('disconnect').hidden=true;
    }
  }

  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=event.target.querySelector('button');
    button.disabled=true;
    set('loginStatus','Checking…');
    try{
      device=await API.login($('password').value);
      $('password').value='';
      $('loginPanel').hidden=true;
      $('workspace').hidden=false;
      set('deviceState',device?.isAdmin?'Administrator browser':'Read-only browser');
      set('loginStatus','');
      await load();
    }catch(error){
      set('loginStatus',error.code==='invalid_password'?'Incorrect password.':error.code==='device_blocked'?'This browser has been blocked.':'Access unavailable.');
    }finally{button.disabled=false;}
  });

  $('refresh').addEventListener('click',async()=>{clearResult();await load();});

  $('connect').addEventListener('click',async()=>{
    const button=$('connect');
    button.disabled=true;
    showResult('Preparing the secure Google connection…');
    try{
      const result=await API.request(API.endpoints.gmailAuth,'POST',{action:'start',account:'hms@healtho2.com'},{timeoutMs:20000});
      if(!result.authorizationUrl)throw new Error('authorization_url_missing');
      location.assign(result.authorizationUrl);
    }catch(error){
      if(error.code==='google_oauth_setup_required'){
        showResult(`Google connection setup is incomplete${error.missing?.length?`: ${error.missing.join(', ')}`:''}. No mailbox access was attempted.`,'bad');
      }else{
        showResult(error.code==='request_timeout'?'The connection request timed out. No mailbox access was granted.':error.detail||error.code||'Could not start Gmail connection.','bad');
      }
      button.disabled=!device?.isAdmin||!oauth?.configured;
    }
  });

  $('scan').addEventListener('click',async()=>{
    const button=$('scan');
    button.disabled=true;
    showResult('Scanning new Gmail activity for possible bills. Nothing will be authorized or paid.');
    try{
      const result=await API.request(API.endpoints.gmailScan,'POST',{action:'scan'},{timeoutMs:180000});
      if(result.skipped){
        showResult(`Scan did not run: ${String(result.reason||'not available').replaceAll('_',' ')}.`,'bad');
      }else{
        const stats=result.stats||{};
        showResult(`Scan complete: ${stats.candidates||0} new candidate(s), ${stats.duplicates||0} duplicate(s), ${stats.ignored||0} ignored, ${stats.errors||0} error(s).`,'good');
      }
      await load();
    }catch(error){
      showResult(error.code==='request_timeout'?'The browser timed out while the server continued safely. Refresh status before starting another scan.':error.detail||error.code||'Gmail scan failed.','bad');
    }finally{button.disabled=!device?.isAdmin;}
  });

  $('disconnect').addEventListener('click',async()=>{
    if(!confirm('Disconnect Gmail discovery? Existing Inbox evidence will remain, but automatic email scanning will stop.'))return;
    const button=$('disconnect');
    button.disabled=true;
    showResult('Disconnecting Gmail discovery…');
    try{
      await API.request(API.endpoints.gmailAuth,'POST',{action:'disconnect',account:'hms@healtho2.com'},{timeoutMs:30000});
      showResult('Gmail discovery disconnected. Existing evidence was retained.','good');
      await load();
    }catch(error){
      showResult(error.detail||error.code||'Could not disconnect Gmail discovery.','bad');
    }finally{button.disabled=!device?.isAdmin;}
  });

  async function init(){
    const params=new URLSearchParams(location.search);
    const gmailResult=params.get('gmail');
    if(gmailResult){
      const detail=params.get('gmail_detail')||'';
      const messages={
        connected:`Gmail discovery connected${detail?` for ${detail}`:''}. Run Scan Now or return to the Payables Inbox.`,
        wrong_account:detail||'The wrong Google account was selected. Use hms@healtho2.com.',
        cancelled:'Google authorization was cancelled. No mailbox access was stored.',
        failed:`Google connection failed${detail?`: ${detail}`:''}.`,
      };
      showResult(messages[gmailResult]||`Google connection result: ${gmailResult}.`,gmailResult==='connected'?'good':'bad');
      history.replaceState(null,'',`${location.pathname}#settings`);
    }
    device=await API.validate();
    if(device){
      $('loginPanel').hidden=true;
      $('workspace').hidden=false;
      set('deviceState',device?.isAdmin?'Administrator browser':'Read-only browser');
      await load();
    }else $('loginPanel').hidden=false;
  }
  init();
})();
