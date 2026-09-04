(() => {
  const config = window.HMS_RUNTIME_CONFIG || {};
  const sessionState = document.getElementById('session-state');
  const locked = document.getElementById('locked');
  const summary = document.getElementById('summary');
  const sections = document.getElementById('sections');
  const briefMeta = document.getElementById('brief-meta');
  let client = null;

  function showLocked(message) {
    window.HMSAuth.showSignIn({
      client,
      container: locked,
      sessionState,
      message,
      hide: [summary, sections],
    });
  }

  function groupItems(items) {
    return items.reduce((groups, item) => {
      const key = item.section || 'Needs Attention';
      (groups[key] ||= []).push(item);
      return groups;
    }, {});
  }

  function renderBrief(payload) {
    const brief = payload.brief;
    if (!brief) {
      sessionState.textContent = `Signed in · ${payload.role}`;
      locked.hidden = true;
      summary.hidden = true;
      sections.hidden = false;
      sections.innerHTML = '<section class="panel"><h2>Today</h2><p>No Daily Brief is available yet.</p></section>';
      return;
    }

    locked.hidden = true;
    sessionState.textContent = `Signed in · ${payload.role}`;
    briefMeta.textContent = `${brief.headline} · ${new Date(brief.generated_at).toLocaleString()}`;
    document.getElementById('priority-count').textContent = brief.priority_count ?? 0;
    document.getElementById('email-count').textContent = brief.email_candidate_count ?? 0;
    document.getElementById('calendar-count').textContent = brief.calendar_event_count ?? 0;
    summary.hidden = false;
    sections.hidden = false;
    sections.innerHTML = '';

    const desiredOrder = ['Today', 'Important Messages', 'Tasks', 'Calendar', 'Needs Attention'];
    const grouped = groupItems(payload.items || []);
    for (const name of desiredOrder) grouped[name] ||= [];

    for (const name of desiredOrder) {
      const panel = document.createElement('section');
      panel.className = 'panel';
      const heading = document.createElement('h2');
      heading.textContent = name;
      panel.appendChild(heading);

      if (!grouped[name].length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Nothing currently listed.';
        panel.appendChild(empty);
      } else {
        for (const item of grouped[name]) {
          const row = document.createElement('article');
          row.className = 'brief-item';
          const title = document.createElement('h3');
          title.textContent = item.title;
          const detail = document.createElement('p');
          detail.textContent = item.detail || '';
          const meta = document.createElement('div');
          meta.className = 'item-meta';
          meta.textContent = `${item.priority || 'normal'} · ${item.status || 'open'}`;
          row.append(title, detail, meta);
          panel.appendChild(row);
        }
      }
      sections.appendChild(panel);
    }
  }

  async function loadBrief(session) {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/hms-daily-brief`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      showLocked('HMS access not authorized');
      return;
    }
    if (!response.ok) throw new Error(`Daily Brief returned ${response.status}`);
    renderBrief(await response.json());
  }

  async function init() {
    if (!config.supabaseUrl || !config.publishableKey) {
      sessionState.textContent = 'Runtime authentication config not installed';
      locked.hidden = false;
      return;
    }

    client = window.HMSAuth.createClient(config);
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      showLocked('Sign-in required');
      return;
    }
    await loadBrief(session);

    client.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.access_token) loadBrief(nextSession).catch(console.error);
      else showLocked('Sign-in required');
    });
  }

  init().catch((error) => {
    console.error(error);
    showLocked('Daily Brief unavailable');
  });
})();
