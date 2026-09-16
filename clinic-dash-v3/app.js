(() => {
  const data = window.HMS_DATA;
  let view = 'dashboard';
  let selectedClinic = null;
  let mapFilter = 'all';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.HMSUI = {escape};

  const badge = value => `<span class="badge ${escape(value)}">${escape(String(value).replaceAll('_',' '))}</span>`;
  const clinicCard = clinic => `<article class="clinic ${selectedClinic===clinic.name?'selected':''}" data-clinic="${escape(clinic.name)}" tabindex="0" role="button" aria-label="Select ${escape(clinic.name)}"><div class="clinic-head"><div><h3>${escape(clinic.name)}</h3><small>${escape(clinic.category)} · ${escape(clinic.city)}</small></div>${badge(clinic.indicator)}</div><p>${escape(clinic.summary)}</p><div class="stats"><span><b>${clinic.actions}</b>Actions</span><span><b>${clinic.risks}</b>Risks</span><span><b>${clinic.ready}%</b>Ready</span></div><div class="progress"><i style="width:${clinic.ready}%"></i></div><small>${escape(clinic.next)}</small></article>`;
  const queueItem = (item,type='action') => `<div class="queue-item"><div><b>${escape(item.title)}</b><small>${escape(item.clinic)} · ${escape(type==='risk'?item.detail:item.owner)}</small></div>${badge(type==='risk'?item.severity:item.status)}</div>`;
  const metrics = () => `<section class="metrics"><article class="metric"><b>${data.clinics.length}</b><span>Clinics</span></article><article class="metric"><b>${data.actions.length}</b><span>Open actions</span></article><article class="metric"><b>${data.actions.filter(x=>x.status==='overdue').length}</b><span>Overdue</span></article><article class="metric"><b>${data.risks.filter(x=>x.severity==='high').length}</b><span>High risks</span></article><article class="metric"><b>${data.clinics.filter(x=>x.category==='Operations').length}</b><span>Operating clinics</span></article></section>`;
  const visibleClinics = () => data.clinics.filter(c => mapFilter==='all' || c.category===mapFilter);

  function mapPanel(){return `<section class="panel map-panel"><div class="panel-head"><div><h2>Clinic map</h2><p>Drag, zoom, filter, or click a clinic.</p></div><div class="map-tools"><button type="button" data-map-filter="all" class="${mapFilter==='all'?'active':''}">All</button><button type="button" data-map-filter="Operations" class="${mapFilter==='Operations'?'active':''}">Operating</button><button type="button" data-map-filter="Buildout" class="${mapFilter==='Buildout'?'active':''}">Buildout</button><button type="button" id="fitMap">Fit all</button></div></div><div id="clinicMap" class="map-wrap" aria-label="Interactive map of HMS clinics"></div><div class="legend"><span class="op">Operating</span><span class="build">Startup / buildout</span><span class="dev">Development risk</span></div></section>`}

  function actionsTable(rows){return `<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Action</th><th>Clinic</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${badge(x.priority)}</td><td><b>${escape(x.title)}</b></td><td>${escape(x.clinic)}</td><td>${escape(x.owner)}</td><td>${escape(x.due)}</td><td>${badge(x.status)}</td></tr>`).join('')}</tbody></table></div>`}

  function dashboard(){const urgent=[...data.actions.filter(x=>x.status==='overdue'||x.priority==='high').slice(0,4).map(x=>queueItem(x)),...data.risks.filter(x=>x.severity==='high').slice(0,3).map(x=>queueItem(x,'risk'))].join('');return `${metrics()}<section class="grid"><div class="panel"><div class="panel-head"><div><h2>Clinic portfolio</h2><p>Operating status, accountability and launch readiness.</p></div></div><div class="clinic-grid">${data.clinics.map(clinicCard).join('')}</div></div><div>${mapPanel()}<section class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Immediate attention</h2><p>Items requiring leadership focus.</p></div></div><div class="queue">${urgent}</div></section></div></section><section class="panel"><div class="panel-head"><div><h2>Operating priorities</h2><p>The most important accountable work across the network.</p></div></div>${actionsTable(data.actions)}</section>`}

  function selectClinic(name, pan=true){selectedClinic=name;document.querySelectorAll('.clinic').forEach(el=>el.classList.toggle('selected',el.dataset.clinic===name));if(pan)window.HMSMap.focus(data.clinics.find(c=>c.name===name));}
  function wireClinicCards(){document.querySelectorAll('.clinic[data-clinic]').forEach(el=>{const choose=()=>selectClinic(el.dataset.clinic,true);el.addEventListener('click',choose);el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});});}
  function initMap(){const element=document.querySelector('#clinicMap');if(!element)return;const clinics=visibleClinics();window.HMSMap.init({element,clinics,onSelect:selectClinic});document.querySelectorAll('[data-map-filter]').forEach(button=>button.addEventListener('click',()=>{mapFilter=button.dataset.mapFilter;render();}));const fit=document.querySelector('#fitMap');if(fit)fit.addEventListener('click',()=>window.HMSMap.fit(clinics));}

  function render(){
    const titles={dashboard:['Executive Dashboard','Current priorities, clinic health and accountable next actions.'],clinics:['Clinic Portfolio','Operating status and readiness across every HMS location.'],actions:['Actions','Accountable work, owners and deadlines.'],risks:['Operating Risks','Current exposures and mitigation priorities.'],launch:['Launch Tracker','Readiness for clinics moving toward opening.'],performance:['Performance','Operational signals by clinic.']};
    document.querySelector('#title').textContent=titles[view][0];document.querySelector('#subtitle').textContent=titles[view][1];document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    let html='';
    if(view==='dashboard')html=dashboard();
    if(view==='clinics')html=`${mapPanel()}<section class="panel"><div class="panel-head"><div><h2>All clinics</h2><p>${data.clinics.length} locations in the current portfolio.</p></div></div><div class="clinic-grid">${data.clinics.map(clinicCard).join('')}</div></section>`;
    if(view==='actions')html=actionsTable(data.actions);
    if(view==='risks')html=`<section class="panel"><div class="panel-head"><div><h2>Risk register</h2><p>Open risks requiring monitoring or mitigation.</p></div></div><div class="queue">${data.risks.map(x=>queueItem(x,'risk')).join('')}</div></section>`;
    if(view==='launch')html=`<section class="panel"><div class="panel-head"><div><h2>Buildout clinics</h2><p>Weighted readiness and next opening milestones.</p></div></div><div class="clinic-grid">${data.clinics.filter(c=>c.category==='Buildout').map(clinicCard).join('')}</div></section>`;
    if(view==='performance')html=`${metrics()}<section class="panel"><div class="panel-head"><div><h2>Performance overview</h2><p>Latest available operational signals.</p></div></div><div class="clinic-grid">${data.clinics.map(clinicCard).join('')}</div></section>`;
    document.querySelector('#views').innerHTML=`<div class="view">${html}</div>`;
    wireClinicCards();
    setTimeout(initMap,0);
  }

  document.querySelectorAll('.nav button').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;render();}));
  render();
})();
