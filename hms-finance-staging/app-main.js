import { $, currentMonth, navigate, setText, state, API } from './app-core.js';
import { bindPrimary, loadCash, loadInbox, loadOverview, loadPayables } from './app-primary.js';
import { bindSecondary, loadPayments, loadReports, loadSavings, loadSettings } from './app-secondary.js';

const loaders = {
  overview: loadOverview,
  inbox: loadInbox,
  payables: loadPayables,
  cash: loadCash,
  payments: loadPayments,
  savings: loadSavings,
  reports: loadReports,
  settings: loadSettings,
};

function showWorkspace() {
  $('loginPanel').hidden = true;
  $('workspace').hidden = false;
  $('logout').hidden = false;
  setText('deviceState', `${state.device?.displayName || 'Authorized browser'}${state.device?.isAdmin ? ' · Administrator' : ''}`);
  $('payablesMonth').value = currentMonth();
  $('pnlMonth').value = currentMonth();
  const selected = location.hash.slice(1) || 'overview';
  navigate(selected);
}

async function loadSelected(tab) {
  const loader = loaders[tab];
  if (!loader) return;
  try {
    await loader();
  } catch (error) {
    console.error(`Failed to load ${tab}`, error);
  }
}

function bindShell() {
  document.querySelector('.nav').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) navigate(button.dataset.tab);
  });

  window.addEventListener('hms-tab-selected', (event) => loadSelected(event.detail.tab));
  window.addEventListener('hashchange', () => {
    if (state.device) navigate(location.hash.slice(1));
  });

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    setText('loginStatus', 'Checking…');
    try {
      state.device = await API.login($('password').value);
      $('password').value = '';
      setText('loginStatus', '');
      showWorkspace();
    } catch (error) {
      setText('loginStatus', error.code === 'invalid_password' ? 'Incorrect password.' : error.code === 'device_blocked' ? 'This browser has been blocked.' : 'Access unavailable.');
    } finally {
      button.disabled = false;
    }
  });

  $('logout').addEventListener('click', async () => {
    await API.logout();
    location.reload();
  });
}

async function init() {
  bindShell();
  bindPrimary();
  bindSecondary();
  state.device = await API.validate();
  if (state.device) showWorkspace();
  else $('loginPanel').hidden = false;
}

init().catch((error) => {
  console.error('HMS Payables failed to initialize', error);
  $('loginPanel').hidden = false;
  setText('loginStatus', 'The app could not initialize. Refresh to retry.');
});
