import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://sojtoyybfolcxezkppxc.supabase.co';
const supabaseKey = 'sb_publishable__xkoicVrQz-6MCiyIPGQRQ_5HHDMxdP';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = {
  session: null,
  profile: null,
  clinics: [],
  actionItems: [],
  risks: [],
  launchItems: [],
  documents: [],
  snapshots: [],
  events: [],
  activity: []
};

const els = Object.fromEntries([
  'auth-screen','login-form','login-email','login-password','login-status','app','last-refresh','refresh-btn','signout-btn',
  'search-input','category-filter','indicator-filter','metrics','clinic-grid','events-list','activity-list','clinic-dialog',
  'event-dialog','event-form','event-clinic','event-title','event-type','event-owner','event-start','event-end','event-description','event-status','add-event-btn'
].map(id => [id, document.getElementById(id)]));

function esc(value='') {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function formatDate(value, includeTime = true) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', includeTime ? {
    month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'
  } : { month:'short', day:'numeric', year:'numeric' }).format(date);
}

function setStatus(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('error', isError);
}

function groupByClinic(rows = []) {
  return rows.reduce((map, row) => {
    const key = row.clinic_id || 'global';
    (map[key] ||= []).push(row);
    return map;
  }, {});
}

async function signIn(event) {
  event.preventDefault();
  setStatus(els['login-status'], 'Signing in…');
  const { error } = await supabase.auth.signInWithPassword({
    email: els['login-email'].value.trim(),
    password: els['login-password'].value
  });
  if (error) return setStatus(els['login-status'], error.message, true);
  setStatus(els['login-status'], '');
}

async function signOut() {
  await supabase.auth.signOut();
}

async function loadProfile() {
  const { data, error } = await supabase.from('ops_profiles').select('*').eq('id', state.session.user.id).single();
  if (error) throw new Error(`Profile unavailable: ${error.message}`);
  if (!data.active) throw new Error('This user profile is inactive.');
  state.profile = data;
}

async function loadData() {
  els['last-refresh'].textContent = 'Refreshing operational data…';
  const queries = await Promise.all([
    supabase.from('ops_clinics').select('*').eq('archived', false).order('sort_order'),
    supabase.from('ops_action_items').select('*').order('updated_at', { ascending: false }),
    supabase.from('ops_risks').select('*').order('updated_at', { ascending: false }),
    supabase.from('ops_launch_items').select('*').order('sort_order'),
    supabase.from('ops_documents').select('*').order('updated_at', { ascending: false }),
    supabase.from('ops_pipeline_snapshots').select('*').order('snapshot_date', { ascending: false }),
    supabase.from('ops_events').select('*').order('starts_at'),
    supabase.from('ops_activity_log').select('*').order('created_at', { ascending: false }).limit(30)
  ]);
  const names = ['clinics','actionItems','risks','launchItems','documents','snapshots','events','activity'];
  queries.forEach((result, index) => {
    if (result.error) throw new Error(`${names[index]}: ${result.error.message}`);
    state[names[index]] = result.data || [];
  });
  renderAll();
  els['last-refresh'].textContent = `Updated ${formatDate(new Date().toISOString())} · ${state.profile.display_name || state.profile.email} · ${state.profile.role.replaceAll('_',' ')}`;
}

function filteredClinics() {
  const query = els['search-input'].value.trim().toLowerCase();
  const category = els['category-filter'].value;
  const indicator = els['indicator-filter'].value;
  return state.clinics.filter(clinic => {
    const haystack = [clinic.name, clinic.status, clinic.ownership_summary, clinic.summary, clinic.next_action, clinic.city, clinic.state].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (category === 'all' || clinic.category === category) && (indicator === 'all' || clinic.indicator === indicator);
  });
}

function renderMetrics() {
  const openActions = state.actionItems.filter(x => !['complete','cancelled'].includes(x.status)).length;
  const highRisks = state.risks.filter(x => x.severity === 'high' && !['closed','mitigated'].includes(x.status)).length;
  const buildouts = state.clinics.filter(x => x.category === 'buildout').length;
  const upcoming = state.events.filter(x => new Date(x.starts_at) >= new Date() && x.status !== 'cancelled').length;
  const metrics = [
    [state.clinics.length,'Active clinics'],
    [openActions,'Open action items'],
    [highRisks,'High risks'],
    [buildouts,'Buildout clinics'],
    [upcoming,'Upcoming events']
  ];
  els.metrics.innerHTML = metrics.map(([value,label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function renderClinics() {
  const actionMap = groupByClinic(state.actionItems);
  const riskMap = groupByClinic(state.risks);
  const cards = filteredClinics();
  els['clinic-grid'].innerHTML = cards.length ? cards.map(clinic => {
    const actions = (actionMap[clinic.id] || []).filter(x => !['complete','cancelled'].includes(x.status));
    const risks = (riskMap[clinic.id] || []).filter(x => !['closed','mitigated'].includes(x.status));
    return `<article class="clinic-card" data-clinic-id="${clinic.id}" tabindex="0">
      <div class="clinic-card-head"><div><h3>${esc(clinic.name)}</h3><div class="clinic-location">${esc([clinic.city,clinic.state].filter(Boolean).join(', '))}</div></div><span class="indicator ${esc(clinic.indicator)}"></span></div>
      <div class="badges"><span class="badge ${esc(clinic.indicator)}">${esc(clinic.status)}</span><span class="badge">${esc(clinic.category)}</span></div>
      <div class="summary">${esc(clinic.summary || 'No summary entered.')}</div>
      <div class="next-action"><strong>Next:</strong> ${esc(clinic.next_action || 'No next action assigned.')}</div>
      <div class="card-footer"><span>${actions.length} open actions</span><span>${risks.length} active risks</span><span>${esc(clinic.ownership_summary || '')}</span></div>
    </article>`;
  }).join('') : '<div class="empty">No clinics match the current filters.</div>';
  document.querySelectorAll('.clinic-card').forEach(card => {
    const open = () => openClinic(card.dataset.clinicId);
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
  });
}

function renderEvents() {
  const clinicById = Object.fromEntries(state.clinics.map(x => [x.id, x]));
  const events = state.events.filter(x => x.status !== 'cancelled').slice(0, 12);
  els['events-list'].innerHTML = events.length ? events.map(event => `<div class="list-item"><strong>${esc(event.title)}</strong><div class="list-meta">${esc(clinicById[event.clinic_id]?.name || 'Portfolio')} · ${formatDate(event.starts_at)} · ${esc(event.event_type)}</div></div>`).join('') : '<div class="empty">No events scheduled yet.</div>';
}

function renderActivity() {
  const clinicById = Object.fromEntries(state.clinics.map(x => [x.id, x]));
  els['activity-list'].innerHTML = state.activity.length ? state.activity.slice(0, 12).map(item => `<div class="list-item"><strong>${esc(item.summary)}</strong><div class="list-meta">${esc(clinicById[item.clinic_id]?.name || 'Portfolio')} · ${esc(item.actor_email || 'System')} · ${formatDate(item.created_at)}</div></div>`).join('') : '<div class="empty">No activity has been recorded.</div>';
}

function latestSnapshot(clinicId) {
  return state.snapshots.find(x => x.clinic_id === clinicId);
}

function openClinic(clinicId) {
  const clinic = state.clinics.find(x => x.id === clinicId);
  if (!clinic) return;
  const actions = state.actionItems.filter(x => x.clinic_id === clinicId);
  const risks = state.risks.filter(x => x.clinic_id === clinicId);
  const launch = state.launchItems.filter(x => x.clinic_id === clinicId);
  const docs = state.documents.filter(x => x.clinic_id === clinicId);
  const snapshot = latestSnapshot(clinicId);
  const list = rows => rows.length ? `<ul>${rows.map(x => `<li><strong>${esc(x.title || x.name)}</strong>${x.status ? ` · ${esc(x.status.replaceAll('_',' '))}` : ''}${x.owner_name ? ` · ${esc(x.owner_name)}` : ''}</li>`).join('')}</ul>` : '<div class="empty">None recorded.</div>';
  els['clinic-dialog'].innerHTML = `<div class="modal-content"><div class="modal-head"><div><span class="eyebrow">${esc(clinic.category)}</span><h2>${esc(clinic.name)}</h2><div class="list-meta">${esc(clinic.status)} · ${esc(clinic.ownership_summary || '')}</div></div><button type="button" class="icon-button" data-close="clinic-dialog">×</button></div>
    <div class="detail-grid">
      <section class="detail-card wide"><h3>Operating summary</h3><div>${esc(clinic.summary || '')}</div><div class="next-action"><strong>Next:</strong> ${esc(clinic.next_action || '')}</div></section>
      <section class="detail-card"><h3>Action items</h3>${list(actions)}</section>
      <section class="detail-card"><h3>Risks</h3>${list(risks)}</section>
      <section class="detail-card"><h3>Launch checklist</h3>${list(launch)}</section>
      <section class="detail-card"><h3>Documents</h3>${list(docs)}</section>
      <section class="detail-card wide"><h3>Latest pipeline snapshot</h3>${snapshot ? `<div>${snapshot.active_patients} active patients · ${snapshot.pending_referrals} referrals · ${snapshot.pending_authorizations} authorizations · ${snapshot.treatments_per_day} treatments/day · ${snapshot.chambers_available} chambers</div><div class="list-meta">${formatDate(snapshot.snapshot_date, false)}</div>` : '<div class="empty">No pipeline snapshot recorded.</div>'}</section>
    </div></div>`;
  els['clinic-dialog'].showModal();
  els['clinic-dialog'].querySelector('[data-close]').addEventListener('click', () => els['clinic-dialog'].close());
}

function openEventDialog() {
  els['event-clinic'].innerHTML = `<option value="">Portfolio-wide</option>${state.clinics.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}`;
  const local = new Date(Date.now() + 60 * 60 * 1000);
  local.setMinutes(0,0,0);
  els['event-start'].value = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  setStatus(els['event-status'], '');
  els['event-dialog'].showModal();
}

async function saveEvent(event) {
  event.preventDefault();
  setStatus(els['event-status'], 'Saving…');
  const payload = {
    clinic_id: els['event-clinic'].value || null,
    title: els['event-title'].value.trim(),
    description: els['event-description'].value.trim() || null,
    event_type: els['event-type'].value,
    starts_at: new Date(els['event-start'].value).toISOString(),
    ends_at: els['event-end'].value ? new Date(els['event-end'].value).toISOString() : null,
    owner_name: els['event-owner'].value.trim() || null,
    created_by: state.session.user.id,
    updated_by: state.session.user.id
  };
  const { error } = await supabase.from('ops_events').insert(payload);
  if (error) return setStatus(els['event-status'], error.message, true);
  els['event-form'].reset();
  els['event-dialog'].close();
  await loadData();
}

function renderAll() {
  renderMetrics();
  renderClinics();
  renderEvents();
  renderActivity();
}

async function showApp(session) {
  state.session = session;
  els['auth-screen'].classList.add('hidden');
  els.app.classList.remove('hidden');
  try {
    await loadProfile();
    await loadData();
  } catch (error) {
    els['last-refresh'].textContent = error.message;
  }
}

function showLogin() {
  state.session = null;
  state.profile = null;
  els.app.classList.add('hidden');
  els['auth-screen'].classList.remove('hidden');
}

els['login-form'].addEventListener('submit', signIn);
els['signout-btn'].addEventListener('click', signOut);
els['refresh-btn'].addEventListener('click', loadData);
els['search-input'].addEventListener('input', renderClinics);
els['category-filter'].addEventListener('change', renderClinics);
els['indicator-filter'].addEventListener('change', renderClinics);
els['add-event-btn'].addEventListener('click', openEventDialog);
els['event-form'].addEventListener('submit', saveEvent);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));

supabase.auth.onAuthStateChange((_event, session) => session ? showApp(session) : showLogin());
const { data: { session } } = await supabase.auth.getSession();
session ? await showApp(session) : showLogin();
