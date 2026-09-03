(() => {
  const API=window.HMSFinanceAPI;
  const $=id=>document.getElementById(id);
  const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(c)||0)/100);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pretty=s=>String(s||'').replaceAll('_',' ');
  const todayMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const state={device:null,inbox:[],payables:[],rules:[],recipes:[],payments:[],matches:[],adapters:[],bankTransactions:[],cash:null,subscriptions:[],opportunities:[],runs:[]};

  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function activeAuthorization(p){return (p.hms_finance_authorizations||[]).find(a=>a.status==='authorized')||null}
  async function request(url,method='GET',body){try{return await API.request(url,method,body)}catch(e){if(e.status===401){API.clearSession?.();location.reload()}throw e}}

  function selectTab(name){
    const valid=['inbox','payables','cash','payments','savings','pnl'];
    if(!valid.includes(name))name='inbox';
    document.querySelectorAll('.tab-section').forEach(el=>el.classList.toggle('active',el.id===`tab-${name}`));
    document.querySelectorAll('.nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    if(location.hash!==`#${name}`)history.replaceState(null,'',`#${name}`);
    loadTab(name);
  }

  async function loadTab(name){
    if(name==='inbox')return loadInbox();
    if(name==='payables')return loadPayables();
    if(name==='cash')return loadCash();
    if(name==='payments')return loadPayments();
    if(name==='savings')return loadSavings();
    if(name==='pnl')return loadPnl();
  }

  async function loadInbox(){
    setText('inboxStatus','Loading…');
    try{
      const r=await request(`${API.endpoints.intake}?status=all&limit=200`);state.inbox=r.items||[];
      setText('inboxNeeds',state.inbox.filter(x=>x.review_status==='needs_review').length);
      setText('inboxDup',state.inbox.filter(x=>x.review_status==='duplicate').length);
      setText('inboxPromoted',state.inbox.filter(x=>x.review_status==='promoted').length);
      setText('inboxTotal',state.inbox.length);
      $('inboxRows').innerHTML=state.inbox.map(x=>`<tr data-id="${esc(x.id)}"><td><div class="payee">${esc(x.candidate_payee||x.subject||'Unidentified item')}</div><div class="meta">${esc(x.source_type)}${x.candidate_invoice_number?' · '+esc(x.candidate_invoice_number):''}</div></td><td>${esc(x.candidate_due_date||'—')}</td><td class="num">${x.candidate_amount_cents==null?'—':money(x.candidate_amount_cents)}</td><td><span class="pill ${x.review_status==='duplicate'?'bad':x.review_status==='promoted'?'good':'warn'}">${esc(pretty(x.review_status))}</span></td><td><div class="actions">${x.review_status==='needs_review'||x.review_status==='ready'?`<button class="smallbtn inbox-promote" type="button">Promote</button><button class="smallbtn inbox-reject" type="button">Reject</button>`:x.review_status==='duplicate'?'<span class="meta">Duplicate — review source</span>':'—'}</div></td></tr>`).join('');
      $('inboxEmpty').hidden=state.inbox.length>0;setText('inboxStatus',`${state.inbox.length} items.`);
    }catch{setText('inboxStatus','Could not load Inbox.');}
  }

  async function loadPayables(){
    setText('payablesStatus','Loading…');
    try{
      const r=await request(API.endpoints.payables);state.payables=r.payables||[];state.rules=r.rules||[];state.recipes=r.recipes||[];
      setText('payableCount',state.payables.length);setText('payableAuthorized',state.payables.filter(p=>activeAuthorization(p)).length);setText('payableReview',state.payables.filter(p=>p.review_required).length);setText('ruleCount',state.rules.length);
      $('payableRows').innerHTML=state.payables.map(p=>{const a=activeAuthorization(p);return `<tr data-id="${esc(p.id)}"><td><input class="payable-check" type="checkbox" ${a?'checked':''} aria-label="Authorize ${esc(p.payee_name)}"></td><td><div class="payee">${esc(p.payee_name)}</div><div class="meta">${esc(p.invoice_number||p.source_type||'')}</div></td><td>${esc(p.due_date||'—')}</td><td>${esc(pretty(p.payable_kind))}</td><td class="num">${money(a?.authorized_amount_cents??p.amount_cents)}</td><td><span class="pill ${a?'good':p.review_required?'warn':''}">${esc(pretty(p.status))}</span></td><td><button class="smallbtn auto-eval" type="button">Run auto rule</button></td></tr>`}).join('');
      renderRules();
      $('recipeRule').innerHTML='<option value="">Choose recurring payable</option>'+state.rules.filter(r=>r.vendor_id).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
      setText('payablesStatus',`${state.payables.length} open payables.`);
    }catch{setText('payablesStatus','Could not load payables.');}
  }

  function renderRules(){
    $('ruleCards').innerHTML=state.rules.length?state.rules.map(r=>{
      const vendorRecipes=state.recipes.filter(x=>x.vendor_id===r.vendor_id);
      const recipe=state.recipes.find(x=>x.id===r.payment_recipe_id);
      return `<div class="rule-card" data-id="${esc(r.id)}"><div class="rule-head"><div><strong>${esc(r.name)}</strong><div class="meta">${esc(pretty(r.payable_kind))} · expected ${money(r.expected_amount_cents)}</div></div><span class="pill ${r.authorization_mode==='automatic'?'good':''}">${esc(r.authorization_mode)}</span></div><div class="row3" style="margin-top:10px"><div class="field"><label>Authorization</label><select class="rule-mode"><option value="manual" ${r.authorization_mode==='manual'?'selected':''}>Manual</option><option value="automatic" ${r.authorization_mode==='automatic'?'selected':''}>Automatic</option></select></div><div class="field"><label>Max automatic $</label><input class="rule-max" type="number" min="0" step="0.01" value="${r.max_auto_amount_cents==null?'':Number(r.max_auto_amount_cents)/100}"></div><div class="field"><label>Tolerance %</label><input class="rule-tol" type="number" min="0" step="0.1" value="${Number(r.tolerance_percent)||0}"></div></div><div class="field"><label>Payment recipe</label><select class="rule-recipe"><option value="">None</option>${vendorRecipes.map(x=>`<option value="${esc(x.id)}" ${x.id===r.payment_recipe_id?'selected':''}>${esc(x.label)} (${esc(x.status)})</option>`).join('')}</select></div><div class="actions"><button class="smallbtn rule-save" type="button">Save rule</button>${recipe&&recipe.status==='review'?`<button class="smallbtn recipe-activate" data-recipe="${esc(recipe.id)}" type="button">Activate recipe</button>`:''}</div></div>`;
    }).join(''):'<div class="empty">No recurring finance rules yet.</div>';
  }

  async function loadCash(){
    setText('cashStatus','Loading…');
    try{const days=$('cashDays').value;const r=await request(`${API.endpoints.reporting}?report=cash&days=${days}`);state.cash=r;setText('cashOnHand',money(r.cashOnHandCents));setText('cashRequired',money(r.requiredCents));setText('cashForecastNet',money(Number(r.plannedInflowsCents)-Number(r.plannedOutflowsCents)));setText('cashProjected',money(r.projectedCashCents));$('cashRows').innerHTML=(r.requirements||[]).map(x=>`<tr><td>${esc(x.due_date||'Unscheduled')}</td><td>${esc(x.payee_name)}</td><td>${esc(x.clinic_name||'—')}</td><td><span class="pill ${x.cash_requirement_state==='authorized'?'good':'warn'}">${esc(pretty(x.cash_requirement_state))}</span></td><td class="num">${money(x.authorization_type?x.authorized_amount_cents:x.amount_cents)}</td></tr>`).join('');$('forecastRows').innerHTML=(r.forecastItems||[]).map(x=>`<tr><td>${esc(x.forecast_date)}</td><td>${esc(x.label)}</td><td class="num">${x.direction==='inflow'?'+':'−'}${money(x.amount_cents)}</td></tr>`).join('');setText('cashStatus',`Through ${r.through}. ${r.cashAccounts?.length||0} cash accounts configured.`);}catch{setText('cashStatus','Could not load cash requirements.');}
  }

  async function loadPayments(){
    try{
      if(!state.payables.length)await loadPayables();
      const r=await request(API.endpoints.payments);state.payments=r.payments||[];state.matches=r.matches||[];state.adapters=r.adapters||[];state.bankTransactions=r.bankTransactions||[];
      setText('paymentCount',state.payments.length);setText('bankUnmatched',state.bankTransactions.filter(x=>x.match_status==='unmatched').length);setText('matchSuggested',state.matches.filter(x=>x.status==='suggested').length);setText('matchConfirmed',state.matches.filter(x=>x.status==='confirmed').length);
      $('paymentRows').innerHTML=state.payments.map(p=>{const pp=Array.isArray(p.hms_finance_payables)?p.hms_finance_payables[0]:p.hms_finance_payables;return `<tr data-id="${esc(p.id)}"><td>${esc(pp?.payee_name||'—')}</td><td><span class="pill ${p.status==='succeeded'?'good':p.status==='failed'?'bad':'warn'}">${esc(p.status)}</span></td><td>${esc(pretty(p.method))}</td><td class="num">${money(p.amount_cents)}</td><td>${['queued','scheduled','initiated'].includes(p.status)?'<button class="smallbtn confirm-external" type="button">Confirm paid externally</button>':'—'}</td></tr>`}).join('');
      $('matchRows').innerHTML=state.matches.map(m=>{const bt=Array.isArray(m.hms_finance_bank_transactions)?m.hms_finance_bank_transactions[0]:m.hms_finance_bank_transactions;const pp=Array.isArray(m.hms_finance_payables)?m.hms_finance_payables[0]:m.hms_finance_payables;return `<tr data-id="${esc(m.id)}"><td><div>${esc(bt?.description||'Bank transaction')}</div><div class="meta">${esc(bt?.posted_date||bt?.transaction_date||'')} · ${bt?money(Math.abs(bt.amount_cents)):''}</div></td><td>${esc(pp?.payee_name||'—')}</td><td>${Math.round(Number(m.confidence||0)*100)}%</td><td>${m.status==='suggested'?'<button class="smallbtn match-confirm" type="button">Confirm</button> <button class="smallbtn match-reject" type="button">Reject</button>':'Confirmed'}</td></tr>`}).join('');
      const ready=state.payables.filter(p=>activeAuthorization(p)&&p.status==='authorized');
      $('paymentReadyRows').innerHTML=ready.map(p=>`<tr data-id="${esc(p.id)}"><td>${esc(p.payee_name)}</td><td>${esc(p.due_date||'—')}</td><td class="num">${money(activeAuthorization(p).authorized_amount_cents)}</td><td><select class="payment-adapter">${state.adapters.map(a=>`<option value="${esc(a.adapter_key)}">${esc(a.label)}</option>`).join('')}</select></td><td><button class="smallbtn payment-intent" type="button">Prepare payment record</button></td></tr>`).join('');
    }catch{setText('paymentCount','—');}
  }

  async function loadSavings(){
    setText('savingsStatus','Loading…');
    try{const r=await request(API.endpoints.optimization);state.subscriptions=r.subscriptions||[];state.opportunities=r.opportunities||[];state.runs=r.runs||[];setText('subscriptionCount',state.subscriptions.length);const open=state.opportunities.filter(x=>['proposed','accepted','in_progress'].includes(x.status));setText('opportunityCount',open.length);setText('potentialSavings',money(r.activeEstimatedAnnualSavingsCents));setText('lastScan',state.runs[0]?.completed_at?new Date(state.runs[0].completed_at).toLocaleDateString():'Never');$('opportunityCards').innerHTML=open.length?open.map(o=>`<div class="rule-card" data-id="${esc(o.id)}"><div class="rule-head"><div><strong>${esc(o.title)}</strong><div class="meta">${esc(o.rationale||'')}</div></div><div class="savings-amount">${money(o.estimated_annual_savings_cents)}/yr</div></div><div class="meta" style="margin-top:8px">Confidence: ${esc(o.confidence)} · status: ${esc(pretty(o.status))}</div><div class="actions" style="margin-top:8px">${o.status==='proposed'?'<button class="smallbtn opp-accept" type="button">Accept for action</button>':''}<button class="smallbtn opp-dismiss" type="button">Dismiss</button>${o.status==='accepted'||o.status==='in_progress'?'<button class="smallbtn opp-realized" type="button">Mark realized</button>':''}</div></div>`).join(''):'<div class="empty">No open savings opportunities. Add subscriptions and run a scan.</div>';setText('savingsStatus',`${state.subscriptions.length} subscriptions tracked.`);}catch{setText('savingsStatus','Could not load savings review.');}
  }

  async function loadPnl(){
    const month=$('pnlMonth').value||todayMonth();$('pnlMonth').value=month;setText('pnlStatus','Loading…');
    try{const r=await request(`${API.endpoints.reporting}?report=pnl&month=${month}`);const accounts=Object.entries(r.byAccount||{}),clinics=Object.entries(r.byClinic||{});setText('pnlLineCount',(r.lines||[]).length);setText('pnlAccountCount',accounts.length);setText('pnlClinicCount',clinics.length);setText('pnlTotal',money(r.totalPnlCents));$('pnlAccountRows').innerHTML=accounts.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${money(v)}</td></tr>`).join('');$('pnlClinicRows').innerHTML=clinics.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${money(v)}</td></tr>`).join('');setText('pnlStatus',(r.lines||[]).length?'Posted journal activity loaded.':'No posted journal activity for this month yet.');}catch{setText('pnlStatus','Could not load P&L.');}
  }

  document.querySelector('.nav').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(!b)return;selectTab(b.dataset.tab)});
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;setText('loginStatus','Checking…');try{state.device=await API.login($('password').value);$('password').value='';showWorkspace()}catch(err){setText('loginStatus',err.code==='invalid_password'?'Incorrect password.':err.code==='device_blocked'?'This browser has been blocked.':'Access unavailable.')}finally{b.disabled=false}});
  $('logout').addEventListener('click',async()=>{await API.logout();location.reload()});

  $('inboxAddForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;setText('inboxAddStatus','Adding…');try{await request(API.endpoints.intake,'POST',{action:'add',item:{sourceType:'manual',payee:$('inboxPayee').value,amount:$('inboxAmount').value,dueDate:$('inboxDue').value,invoiceNumber:$('inboxInvoice').value,note:$('inboxNote').value}});e.target.reset();setText('inboxAddStatus','Added to Inbox.');await loadInbox()}catch{setText('inboxAddStatus','Could not add item.')}finally{b.disabled=false}});
  $('inboxRows').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.closest('tr')?.dataset.id;if(!id)return;b.disabled=true;try{if(b.classList.contains('inbox-promote'))await request(API.endpoints.intake,'POST',{action:'promote',id,fields:{}});if(b.classList.contains('inbox-reject'))await request(API.endpoints.intake,'POST',{action:'reject',id});await loadInbox()}catch(err){setText('inboxStatus',err.code==='duplicate_requires_resolution'?'Duplicate must be resolved before promotion.':'Action failed.')}finally{b.disabled=false}});
  $('inboxRefresh').addEventListener('click',loadInbox);

  $('payableRows').addEventListener('change',async e=>{const c=e.target.closest('.payable-check');if(!c)return;const tr=c.closest('tr'),p=state.payables.find(x=>x.id===tr.dataset.id);if(!p)return;c.disabled=true;try{if(c.checked)await request(API.endpoints.payables,'POST',{action:'authorize',id:p.id,amount:Number(p.amount_cents)/100});else await request(API.endpoints.payables,'POST',{action:'revoke-authorization',id:p.id});await loadPayables()}catch{c.checked=!c.checked;setText('payablesStatus','Authorization update failed.')}finally{c.disabled=false}});
  $('payableRows').addEventListener('click',async e=>{const b=e.target.closest('.auto-eval');if(!b)return;const id=b.closest('tr').dataset.id;b.disabled=true;try{const evalResult=await request(API.endpoints.payables,'POST',{action:'evaluate-auto',id});const ev=evalResult.evaluation;if(ev?.eligible){const apply=await request(API.endpoints.payables,'POST',{action:'apply-auto',id});setText('payablesStatus',apply.result?.applied?'Automatic authorization applied.':'Automatic rule did not apply.')}else setText('payablesStatus',`Auto blocked: ${(ev?.reasons||[]).map(pretty).join(', ')||'not eligible'}`);await loadPayables()}catch{setText('payablesStatus','Automatic-rule check failed.')}finally{b.disabled=false}});
  $('ruleCards').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('recipe-activate')){b.disabled=true;try{await request(API.endpoints.payables,'POST',{action:'activate-recipe',id:b.dataset.recipe});await loadPayables()}finally{b.disabled=false}return}if(!b.classList.contains('rule-save'))return;const card=b.closest('.rule-card');b.disabled=true;try{await request(API.endpoints.payables,'POST',{action:'set-rule',id:card.dataset.id,fields:{authorizationMode:card.querySelector('.rule-mode').value,maxAutoAmount:card.querySelector('.rule-max').value||null,tolerancePercent:card.querySelector('.rule-tol').value,paymentRecipeId:card.querySelector('.rule-recipe').value||null,requireSameDestination:true}});await loadPayables()}catch{setText('payablesStatus','Rule update failed.')}finally{b.disabled=false}});
  $('recipeForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');const rule=state.rules.find(x=>x.id===$('recipeRule').value);if(!rule?.vendor_id){setText('recipeStatus','Choose a recurring vendor item.');return}b.disabled=true;try{await request(API.endpoints.payables,'POST',{action:'add-recipe',recipe:{vendorId:rule.vendor_id,label:$('recipeLabel').value,method:$('recipeMethod').value,maskedDestination:$('recipeDestination').value,instructions:$('recipeInstructions').value}});e.target.reset();setText('recipeStatus','Recipe saved for review.');await loadPayables()}catch{setText('recipeStatus','Could not save recipe.')}finally{b.disabled=false}});
  $('payablesRefresh').addEventListener('click',loadPayables);

  $('cashDays').addEventListener('change',loadCash);$('cashRefresh').addEventListener('click',loadCash);
  $('forecastForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await request(API.endpoints.reporting,'POST',{action:'add-forecast',item:{direction:$('forecastDirection').value,date:$('forecastDate').value,amount:$('forecastAmount').value,label:$('forecastLabel').value}});e.target.reset();setText('forecastStatus','Added.');await loadCash()}catch{setText('forecastStatus','Could not add assumption.')}finally{b.disabled=false}});

  $('paymentReadyRows').addEventListener('click',async e=>{const b=e.target.closest('.payment-intent');if(!b)return;const tr=b.closest('tr');const adapter=tr.querySelector('.payment-adapter').value;b.disabled=true;try{await request(API.endpoints.payments,'POST',{action:'create-payment-intent',payableId:tr.dataset.id,adapterKey:adapter});await loadPayables();await loadPayments()}catch(err){setText('paymentCount',err.code==='active_authorization_required'?'Authorization required.':'Payment record failed.')}finally{b.disabled=false}});
  $('paymentRows').addEventListener('click',async e=>{const b=e.target.closest('.confirm-external');if(!b)return;const ref=prompt('Optional external confirmation/reference number:','')??'';b.disabled=true;try{await request(API.endpoints.payments,'POST',{action:'confirm-external-payment',paymentId:b.closest('tr').dataset.id,externalReference:ref});await loadPayments()}finally{b.disabled=false}});
  $('matchRows').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.closest('tr').dataset.id;b.disabled=true;try{if(b.classList.contains('match-confirm'))await request(API.endpoints.payments,'POST',{action:'confirm-reconciliation',matchId:id});if(b.classList.contains('match-reject'))await request(API.endpoints.payments,'POST',{action:'reject-reconciliation',matchId:id});await loadPayments()}finally{b.disabled=false}});

  $('subscriptionForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await request(API.endpoints.optimization,'POST',{action:'add-subscription',item:{serviceName:$('subName').value,amount:$('subAmount').value,billingFrequency:$('subFrequency').value,renewalDate:$('subRenewal').value,seatsPurchased:$('subSeats').value||null,seatsUsed:$('subUsed').value||null,annualPrice:$('subAnnual').value||null}});e.target.reset();setText('subscriptionStatus','Added.');await loadSavings()}catch{setText('subscriptionStatus','Could not add subscription.')}finally{b.disabled=false}});
  $('runSavingsScan').addEventListener('click',async e=>{e.target.disabled=true;setText('savingsStatus','Scanning…');try{const r=await request(API.endpoints.optimization,'POST',{action:'scan'});setText('savingsStatus',`Scan complete: ${r.run?.opportunities_created||0} new opportunities.`);await loadSavings()}catch{setText('savingsStatus','Scan failed.')}finally{e.target.disabled=false}});
  $('opportunityCards').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=b.closest('.rule-card').dataset.id;let status;if(b.classList.contains('opp-accept'))status='accepted';if(b.classList.contains('opp-dismiss'))status='dismissed';if(b.classList.contains('opp-realized'))status='realized';if(!status)return;b.disabled=true;try{await request(API.endpoints.optimization,'POST',{action:'set-opportunity-status',id,status});await loadSavings()}finally{b.disabled=false}});

  $('pnlRefresh').addEventListener('click',loadPnl);$('pnlMonth').addEventListener('change',loadPnl);

  function showWorkspace(){
    $('loginPanel').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;setText('deviceState',state.device?.displayName||'Authorized browser');$('pnlMonth').value=todayMonth();selectTab(location.hash.slice(1)||'inbox');
  }

  async function init(){state.device=await API.validate();if(state.device)showWorkspace();else $('loginPanel').hidden=false}
  window.addEventListener('hashchange',()=>{if(state.device)selectTab(location.hash.slice(1))});
  init();
})();
