(() => {
  const config = window.HMS_RUNTIME_CONFIG || {};
  const sessionState = document.getElementById('session-state');
  const locked = document.getElementById('locked');
  const summary = document.getElementById('summary');
  const sections = document.getElementById('sections');
  const briefMeta = document.getElementById('brief-meta');
  let client = null;

  function installLoginForm() {
    locked.innerHTML = '';
    const heading = document.createElement('h2'); heading.textContent = 'HMS sign-in';
    const explanation = document.createElement('p'); explanation.textContent = 'Use an approved HMS email address. New accounts cannot be created from this page.';
    const form = document.createElement('form'); form.className = 'login-form';
    const label = document.createElement('label'); label.htmlFor = 'login-email'; label.textContent = 'Email';
    const row = document.createElement('div'); row.className = 'login-row';
    const input = document.createElement('input'); input.id = 'login-email'; input.name = 'email'; input.type = 'email'; input.autocomplete = 'email'; input.required = true; input.placeholder = 'hms@healtho2.com';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Email sign-in link';
    const status = document.createElement('p'); status.className = 'muted'; status.setAttribute('aria-live', 'polite');
    row.append(input, submit); form.append(label, row, status); locked.append(heading, explanation, form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = input.value.trim().toLowerCase();
      if (!email || !client) return;
      submit.disabled = true; status.textContent = 'Requesting secure sign-in link…';
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split('#')[0] } });
      submit.disabled = false;
      status.textContent = error ? 'This address is not authorized or sign-in could not be sent.' : 'Sign-in link sent. Open the email on this device to continue.';
    });
  }

  function showLocked(message) { sessionState.textContent = message; locked.hidden = false; summary.hidden = true; sections.hidden = true; if (client && !locked.querySelector('form')) installLoginForm(); }
  function groupItems(items) { return items.reduce((groups, item) => { const key = item.section || 'Needs Attention'; (groups[key] ||= []).push(item); return groups; }, {}); }

  function renderBrief(payload) {
    const brief = payload.brief;
    if (!brief) { sessionState.textContent = `Signed in · ${payload.role}`; locked.hidden = true; summary.hidden = true; sections.hidden = false; sections.innerHTML = '<section class="panel"><h2>Today</h2><p>No Daily Brief is available yet.</p></section>'; return; }
    locked.hidden = true; sessionState.textContent = `Signed in · ${payload.role}`; briefMeta.textContent = `${brief.headline} · ${new Date(brief.generated_at).toLocaleString()}`;
    document.getElementById('priority-count').textContent = brief.priority_count ?? 0; document.getElementById('email-count').textContent = brief.email_candidate_count ?? 0; document.getElementById('calendar-count').textContent = brief.calendar_event_count ?? 0; summary.hidden = false; sections.hidden = false; sections.innerHTML = '';
    const desiredOrder = ['Today', 'Important Messages', 'Tasks', 'Calendar', 'Needs Attention']; const grouped = groupItems(payload.items || []); for (const name of desiredOrder) grouped[name] ||= [];
    for (const name of desiredOrder) { const panel = document.createElement('section'); panel.className = 'panel'; const heading = document.createElement('h2'); heading.textContent = name; panel.appendChild(heading); if (!grouped[name].length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Nothing currently listed.'; panel.appendChild(empty); } else { for (const item of grouped[name]) { const row = document.createElement('article'); row.className = 'brief-item'; const title = document.createElement('h3'); title.textContent = item.title; const detail = document.createElement('p'); detail.textContent = item.detail || ''; const meta = document.createElement('div'); meta.className = 'item-meta'; meta.textContent = `${item.priority || 'normal'} · ${item.status || 'open'}`; row.append(title, detail, meta); panel.appendChild(row); } } sections.appendChild(panel); }
  }

  async function loadBrief(session) { const response = await fetch(`${config.supabaseUrl}/functions/v1/hms-daily-brief`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }); if (response.status === 401 || response.status === 403) { showLocked('HMS access not authorized'); return; } if (!response.ok) throw new Error(`Daily Brief returned ${response.status}`); renderBrief(await response.json()); }

  async function init() { if (!config.supabaseUrl || !config.publishableKey) { sessionState.textContent = 'Runtime authentication config not installed'; locked.hidden = false; return; } client = window.supabase.createClient(config.supabaseUrl, config.publishableKey); const { data: { session } } = await client.auth.getSession(); if (!session?.access_token) { installLoginForm(); showLocked('Sign-in required'); return; } await loadBrief(session); client.auth.onAuthStateChange((_event, nextSession) => { if (nextSession?.access_token) loadBrief(nextSession).catch(console.error); else showLocked('Sign-in required'); }); }
  init().catch((error) => { console.error(error); showLocked('Daily Brief unavailable'); });
})();
