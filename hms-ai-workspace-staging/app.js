(() => {
  const grid = document.getElementById('capability-grid');
  const roleSelect = document.getElementById('role-select');
  const search = document.getElementById('search');
  let capabilities = [];
  function modeLabel(mode) { return mode === 'program' ? 'Program' : 'Subscription chat'; }
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
      const button = document.createElement('button'); button.type = 'button'; button.disabled = true; button.textContent = 'Connector pending';
      footer.append(badge, button); card.append(category, heading, description, footer); grid.appendChild(card);
    });
  }
  async function init() {
    try {
      const response = await fetch('./capabilities.json', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      capabilities = (await response.json()).capabilities || [];
      render();
    } catch (error) {
      grid.innerHTML = '<div class="panel">Capability registry could not be loaded.</div>';
    }
  }
  roleSelect.addEventListener('change', render);
  search.addEventListener('input', render);
  init();
})();