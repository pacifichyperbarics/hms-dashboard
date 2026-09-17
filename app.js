(() => {
  const data=window.HMS_HOME_DATA;
  let currentView='today';
  let workFilter='All';
  let appFilter='All';
  const chatMessages=[{role:'assistant',text:'Good morning. Ask about priorities, people, clinics, applications, or current signals. This preview reads representative V4 data and does not make changes.'}];

  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.HMSHome={escape};
  const titleCase=value=>String(value).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const badge=(value,label)=>'<span class="badge '+escape(value)+'">'+escape(label||titleCase(value))+'</span>';
  const initials=name=>name.split(' ').map(x=>x[0]).join('').slice(0,2);

  function taskRow(task){
    return '<article class="task-row"><div class="priority-bar '+escape(task.priority)+'"></div><div class="task-copy"><strong>'+escape(task.title)+'</strong><span>'+escape(task.clinic)+' · '+escape(task.source)+'</span></div><div class="task-owner"><b>'+escape(task.owner)+'</b><span>'+escape(task.collaborator?'+ '+task.collaborator:'')+'</span></div><div class="task-due">'+escape(task.due)+'</div>'+badge(task.status)+'</article>';
  }
  function personCard(person){
    return '<article class="person-card"><div class="avatar" style="--avatar:'+escape(person.color)+'">'+escape(initials(person.name))+'</div><div class="person-copy"><strong>'+escape(person.name)+'</strong><span>'+escape(person.role)+'</span><p>'+escape(person.lane)+'</p></div><div class="person-count"><b>'+person.open+'</b><span>open</span></div></article>';
  }
  function appCard(app){
    const action=app.url?'<a class="app-action" href="'+escape(app.url)+'" target="_blank" rel="noopener">'+escape(app.label)+' <span>↗</span></a>':'<span class="app-action disabled">'+escape(app.label)+'</span>';
    return '<article class="app-card"><div class="app-head"><div class="app-symbol">'+escape(app.name[0])+'</div>'+badge(app.status)+'</div><h3>'+escape(app.name)+'</h3><p>'+escape(app.purpose)+'</p><dl><div><dt>Audience</dt><dd>'+escape(app.audience)+'</dd></div><div><dt>Owner</dt><dd>'+escape(app.owner)+'</dd></div><div><dt>Version</dt><dd>'+escape(app.version)+'</dd></div><div><dt>Last checked</dt><dd>'+escape(app.tested)+'</dd></div></dl>'+action+'</article>';
  }
  function eventItem(event){
    return '<article class="event-item"><span class="event-mark '+escape(event.tone)+'"></span><div><div class="event-meta">'+escape(event.source)+' · '+escape(event.time)+'</div><strong>'+escape(event.title)+'</strong><p>'+escape(event.detail)+'</p></div></article>';
  }
  function signalCard(signal){
    return '<article class="signal-card '+escape(signal.severity)+'"><div>'+badge(signal.severity)+'</div><h3>'+escape(signal.title)+'</h3><p><b>'+escape(signal.confidence)+':</b> '+escape(signal.why)+'</p><span>'+escape(signal.action)+'</span></article>';
  }

  function todayView(){
    const michael=data.tasks.filter(t=>t.status==='needs_michael');
    return '<div class="today-grid">'+
      '<section class="panel attention-panel"><div class="section-head"><div><p class="kicker">Start here</p><h2>Needs Executive</h2></div><span class="count">'+michael.length+'</span></div><div class="task-list">'+michael.map(taskRow).join('')+'</div></section>'+
      '<section class="panel snapshot-panel"><div class="section-head"><div><p class="kicker">Network</p><h2>At a glance</h2></div></div><div class="snapshot-grid"><div><b>'+data.clinics.length+'</b><span>clinics</span></div><div><b>'+data.tasks.filter(t=>t.status==='blocked').length+'</b><span>blocked</span></div><div><b>'+data.apps.filter(a=>a.status==='released').length+'</b><span>released apps</span></div><div><b>'+data.signals.filter(s=>s.severity==='high').length+'</b><span>high signal</span></div></div></section>'+
      '<section class="panel events-panel"><div class="section-head"><div><p class="kicker">Across HMS</p><h2>What changed</h2></div><button class="text-button" data-view-jump="work">Open work</button></div><div class="event-list">'+data.events.map(eventItem).join('')+'</div></section>'+
      '<section class="panel signals-panel"><div class="section-head"><div><p class="kicker">Early warning</p><h2>Signals and predictions</h2></div><span class="preview-label">Experimental</span></div><div class="signal-grid">'+data.signals.map(signalCard).join('')+'</div></section>'+
      '<section class="panel team-panel"><div class="section-head"><div><p class="kicker">Accountability</p><h2>Who is doing what</h2></div><button class="text-button" data-view-jump="work">View all</button></div><div class="people-grid">'+data.people.map(personCard).join('')+'</div></section>'+
      '<section class="panel launch-panel"><div class="section-head"><div><p class="kicker">Fast access</p><h2>Released for use</h2></div><button class="text-button" data-view-jump="apps">App library</button></div><div class="quick-apps">'+data.apps.filter(a=>a.status==='released').map(app=>'<a href="'+escape(app.url||'#')+'" target="'+(app.url?'_blank':'_self')+'" rel="noopener"><span class="quick-icon">'+escape(app.name[0])+'</span><div><strong>'+escape(app.name)+'</strong><small>'+escape(app.audience)+'</small></div><b>↗</b></a>').join('')+'</div></section>'+
    '</div>';
  }

  function workView(){
    const owners=['All','Needs Executive','Operations Lead','Development Lead','Marketing Lead','Partner'];
    const rows=data.tasks.filter(t=>workFilter==='All'||(workFilter==='Needs Executive'&&t.status==='needs_michael')||t.owner===workFilter||t.collaborator===workFilter);
    return '<section class="panel"><div class="section-head wide"><div><p class="kicker">Linear remains authoritative</p><h2>Accountable work</h2><p class="section-note">This preview demonstrates the V4 view; live two-way synchronization comes after interface validation.</p></div></div><div class="filter-row">'+owners.map(owner=>'<button class="'+(owner===workFilter?'active':'')+'" data-work-filter="'+escape(owner)+'">'+escape(owner)+'</button>').join('')+'</div><div class="task-list full">'+rows.map(taskRow).join('')+'</div></section>';
  }

  function clinicCard(clinic){
    return '<article class="clinic-card" tabindex="0" data-clinic="'+escape(clinic.name)+'"><div class="clinic-title"><div><h3>'+escape(clinic.name)+'</h3><span>'+escape(clinic.city)+'</span></div>'+badge(clinic.indicator)+'</div><p>'+escape(clinic.summary)+'</p><div class="clinic-stats"><span><b>'+clinic.actions+'</b>actions</span><span><b>'+clinic.risks+'</b>risks</span><span><b>'+clinic.ready+'%</b>ready</span></div><div class="progress"><i style="width:'+clinic.ready+'%"></i></div><small><b>Next:</b> '+escape(clinic.next)+'</small></article>';
  }
  function clinicsView(){
    return '<div class="clinic-layout"><section class="panel"><div class="section-head"><div><p class="kicker">Portfolio</p><h2>Clinic status</h2></div></div><div class="clinic-grid">'+data.clinics.map(clinicCard).join('')+'</div></section><section class="panel map-panel"><div class="section-head"><div><p class="kicker">Network</p><h2>Clinic map</h2></div><button class="text-button" id="fitMap">Fit all</button></div><div id="clinicMap" class="map"></div></section></div>';
  }

  function appsView(){
    const filters=['All','Released','Pilot','Development','Experiment'];
    const apps=data.apps.filter(app=>appFilter==='All'||app.status===appFilter.toLowerCase());
    return '<section class="panel"><div class="section-head wide"><div><p class="kicker">Authoritative catalog</p><h2>HMS App Library</h2><p class="section-note">One place to find the approved link, audience, owner, version and release state.</p></div></div><div class="filter-row">'+filters.map(f=>'<button class="'+(f===appFilter?'active':'')+'" data-app-filter="'+escape(f)+'">'+escape(f)+'</button>').join('')+'</div><div class="app-grid">'+apps.map(appCard).join('')+'</div></section>';
  }

  function chatView(){
    const prompts=['What needs my attention?','What is Operations working on?','Which apps are released?','What are the main risks?'];
    return '<div class="chat-layout"><section class="chat-panel"><div class="chat-head"><div><p class="kicker">Simple, HMS-specific conversation</p><h2>Ask HMS</h2></div><span class="preview-label">Read-only preview</span></div><div class="prompt-row">'+prompts.map(p=>'<button data-prompt="'+escape(p)+'">'+escape(p)+'</button>').join('')+'</div><div class="messages" id="messages">'+chatMessages.map(m=>'<div class="message '+escape(m.role)+'"><span>'+escape(m.role==='assistant'?'H':'M')+'</span><p>'+escape(m.text)+'</p></div>').join('')+'</div><form id="chatForm" class="chat-form"><label class="sr-only" for="chatInput">Ask HMS</label><input id="chatInput" autocomplete="off" placeholder="Ask about priorities, people, clinics or apps…"><button type="submit">Send</button></form></section><aside class="panel chat-notes"><p class="kicker">V4 rule</p><h2>Chat explains first</h2><ul><li>One HMS conversation surface</li><li>No model selector or IDE choices</li><li>Sources shown with every live answer</li><li>Confirmation before writes or approvals</li><li>Clinical and financial access follows user role</li></ul></aside></div>';
  }

  function answer(question){
    const q=question.toLowerCase();
    if(q.includes('operations')||q.includes('regional')) return 'The operations lead’s preview queue includes inspection follow-up, billing access, operating responsibilities, and growth work across the clinics.';
    if(q.includes('app')||q.includes('released')) return 'Released in this catalog: HMS Clinic Dashboard v3, the Partner P&L Display, and the Expansion Funding Planner. Expense Mapper and Referral Portal v5 are marked as pilots.';
    if(q.includes('risk')||q.includes('signal')||q.includes('predict')) return 'The strongest current signal is a possible opening delay because equipment scope and build sequence are unresolved. A billing-access issue is also an active collection risk.';
    if(q.includes('executive')||q.includes('attention')||q.includes('today')) return 'Three items need executive attention in this demonstration: equipment scope, planning assumptions, and operating responsibilities.';
    if(q.includes('clinic')) return 'The demonstration portfolio shows five clinics: three operating and two in buildout. One new site has the lowest readiness; another is further along but still has inspection, equipment, and staffing work.';
    if(q.includes('slack')||q.includes('discord')||q.includes('conversation')) return 'The recommended first multiplayer layer is HMS Home plus Linear, not another chat network. Slack can be added later as a notification channel if team conversation volume justifies it.';
    return 'I can answer from the current V4 preview about priorities, owners, clinics, released applications and signals. Live connected answers and actions come after this interface is approved.';
  }

  function wire(){
    document.querySelectorAll('[data-view-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.viewJump)));
    document.querySelectorAll('[data-work-filter]').forEach(b=>b.addEventListener('click',()=>{workFilter=b.dataset.workFilter;render();}));
    document.querySelectorAll('[data-app-filter]').forEach(b=>b.addEventListener('click',()=>{appFilter=b.dataset.appFilter;render();}));
    document.querySelectorAll('.clinic-card').forEach(card=>{const choose=()=>{const clinic=data.clinics.find(c=>c.name===card.dataset.clinic);window.HMSHomeMap.focus(clinic.name,clinic);};card.addEventListener('click',choose);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});});
    if(currentView==='clinics'){setTimeout(()=>{const el=document.querySelector('#clinicMap');window.HMSHomeMap.init(el,data.clinics,()=>{});const fit=document.querySelector('#fitMap');if(fit)fit.addEventListener('click',()=>window.HMSHomeMap.fit(data.clinics));},0);}
    if(currentView==='chat'){
      document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>submitChat(b.dataset.prompt)));
      const form=document.querySelector('#chatForm'); if(form)form.addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#chatInput');const value=input.value.trim();if(value){input.value='';submitChat(value);}});
      setTimeout(()=>{const messages=document.querySelector('#messages');if(messages)messages.scrollTop=messages.scrollHeight;},0);
    }
  }
  function submitChat(text){chatMessages.push({role:'user',text},{role:'assistant',text:answer(text)});render();}
  function navigate(view){currentView=view;render();window.scrollTo({top:0,behavior:'smooth'});}
  function render(){
    const titles={
      today:['Good morning','Start with decisions, exceptions, and accountable next actions.'],
      work:['Work and accountability','See owners, deadlines, blockers, and decisions in one view.'],
      clinics:['Clinic portfolio','Operating health, launch readiness, and next actions by location.'],
      apps:['HMS App Library','Find the current approved application and know who should use it.'],
      chat:['Ask HMS','A clean conversation with HMS data, work, applications, and signals.']
    };
    document.querySelector('#pageTitle').textContent=titles[currentView][0];
    document.querySelector('#pageSubtitle').textContent=titles[currentView][1];
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
    const root=document.querySelector('#viewRoot');
    root.innerHTML=currentView==='today'?todayView():currentView==='work'?workView():currentView==='clinics'?clinicsView():currentView==='apps'?appsView():chatView();
    wire();
  }

  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
  document.querySelectorAll('[data-open-chat]').forEach(button=>button.addEventListener('click',()=>navigate('chat')));
  document.querySelector('#attentionCount').textContent=data.tasks.filter(t=>t.status==='needs_michael').length;
  render();
})();
