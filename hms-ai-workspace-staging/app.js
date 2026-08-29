(() => {
  const grid = document.getElementById('capability-grid');
  const roleSelect = document.getElementById('role-select');
  const search = document.getElementById('search');
  const backendDot = document.getElementById('backend-dot');
  const backendStatus = document.getElementById('backend-status');
  const syncStatus = document.getElementById('sync-status');
  const versionStatus = document.getElementById('version-status');
  const healthUrl = 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-health';

  let capabilities = [];
  let healthState = null;

  function modeLabel(mode) {
    return mode === 'program' ? 'Program' : 'Subscription chat';
  }

  function capabilityButtonLabel(item) {
    if (item.id === 'hms-daily-brief' || item.id === 'daily-brief') {
      const brief = healthState?.dailyBrief;
      return brief?.ready ? `Ready · ${brief.priorityCount ?? 0} priorities` : 'Brief initializing';
    }
    return item.id === 'corporate-knowledge' ? 'Knowledge index next' : 'Connector pending';
  }

  function render() {
    const role = roleSelect.value;
    const q = search.value.trim().toLowerCase();
    const visible = capabilities.filter((item) => item.roles.includes(role) && (!q || `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(q)));
    grid.innerHTML = '';

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'panel';
      empty.textContent = 'No work areas are available for this role and search.';
      grid.appendChild(empty);
      return;
    }

    visible.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'card';
      const category = document.createElement('div'); category.className = 'category'; category.textContent = item.category.replaceAll('_', ' ');
      const heading = document.createElement('h3'); heading.textContent = item.label;
      const description = document.createElement('p'); description.textContent = item.description;
      const footer = document.createElement('footer');
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = modeLabel(item.mode);
      const button = document.createElement('button'); button.type = 'button'; button.disabled = true;
      button.textContent = capabilityButtonLabel(item);
      footer.append(badge, button);
      card.append(category, heading, description, footer);
      grid.appendChild(card);
    });
  }

  async function loadCapabilities() {
    const response = await fetch('./capabilities.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Capability registry returned ${response.status}`);
    capabilities = (await response.json()).capabilities || [];
    render();
  }

  async function loadHealth() {
    try {
      const response = await fetch(healthUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      const health = await response.json();
      healthState = health;
      backendDot.classList.add('ok');
      backendStatus.textContent = `Backend healthy · ${health.capabilityCount ?? 0} capabilities`;

      const gmail = health.sync?.gmail;
      const calendar = health.sync?.google_calendar;
      const parts = [];
      if (gmail) parts.push(`Gmail ${gmail.status}`);
      if (calendar) parts.push(`Calendar ${calendar.status}`);
      if (health.dailyBrief?.ready) parts.push(`Daily Brief ready (${health.dailyBrief.priorityCount ?? 0} priorities)`);
      syncStatus.textContent = parts.length ? parts.join(' · ') : 'Gmail/Calendar incremental sync not configured yet';

      const identity = (health.versions || []).find((item) => item.component === 'identity_permissions');
      const briefVersion = (health.versions || []).find((item) => item.component === 'daily_brief');
      const versions = [];
      if (identity) versions.push(`identity/permissions ${identity.version}`);
      if (briefVersion) versions.push(`Daily Brief ${briefVersion.version}`);
      versionStatus.textContent = `${versions.length ? `Backend ${versions.join(' · ')} deployed. ` : 'Backend healthy. '}Health checked ${new Date(health.checkedAt).toLocaleString()}.`;
      render();
    } catch (error) {
      backendDot.classList.remove('ok');
      backendStatus.textContent = 'Backend status unavailable';
      versionStatus.textContent = 'Could not reach the HMS health endpoint.';
      console.error(error);
    }
  }

  async function init() {
    try {
      await loadCapabilities();
    } catch (error) {
      grid.innerHTML = '<div class="panel">Capability registry could not be loaded.</div>';
      console.error(error);
    }
    await loadHealth();
  }

  roleSelect.addEventListener('change', render);
  search.addEventListener('input', render);
  init();
})();