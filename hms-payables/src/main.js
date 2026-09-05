import { api } from './api.js';
import { APP_CONFIG } from './config.js';
import { router } from './router.js';
import { store } from './store.js';
import { byId, clear, node, setGlobalStatus } from './ui.js';
import { mountOverview } from './screens/overview.js';
import { mountInbox } from './screens/inbox.js';
import { mountPayables } from './screens/payables.js';
import { mountCash } from './screens/cash.js';
import { mountSystem } from './screens/system.js';

const screens = Object.freeze({
  overview: mountOverview,
  inbox: mountInbox,
  payables: mountPayables,
  cash: mountCash,
  system: mountSystem,
});

let started = false;

function showLogin(message = '') {
  byId('loginPanel').hidden = false;
  byId('appShell').hidden = true;
  byId('logoutButton').hidden = true;
  byId('deviceLabel').textContent = 'Not signed in';
  byId('loginStatus').textContent = message;
}

function showApp(device) {
  store.update({ device });
  byId('loginPanel').hidden = true;
  byId('appShell').hidden = false;
  byId('logoutButton').hidden = false;
  byId('deviceLabel').textContent = `${device.displayName || 'Authorized browser'}${device.isAdmin ? ' / Administrator' : ' / Read only'}`;
  byId('buildLabel').textContent = `Build ${APP_CONFIG.version}`;
  if (!started) {
    started = true;
    router.start();
  } else {
    router.go(router.screenFromHash());
  }
}

async function mountScreen(screen) {
  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === screen);
  });
  const root = byId('screenRoot');
  const mount = screens[screen] || screens.overview;
  clear(root);
  try {
    await mount(root);
  } catch (error) {
    console.error(`Screen ${screen} failed`, error);
    root.append(node('section', { className: 'panel' }, [
      node('h2', { text: 'This section could not load' }),
      node('p', { text: error?.message || 'Unknown error' }),
      node('button', { type: 'button', className: 'button', text: 'Open System status', onClick: () => router.go('system') }),
    ]));
    setGlobalStatus('A section failed, but the rest of the Payables app remains available.', 'danger');
  }
}

function bindShell() {
  byId('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = byId('loginButton');
    const password = byId('password');
    submit.disabled = true;
    byId('loginStatus').textContent = 'Checking access...';
    try {
      const device = await api.login(password.value);
      password.value = '';
      showApp(device);
    } catch (error) {
      byId('loginStatus').textContent = error.code === 'invalid_password'
        ? 'Incorrect password.'
        : error.code === 'device_blocked'
          ? 'This browser has been blocked.'
          : `Access unavailable: ${error.detail || error.message || error.code || 'connection error'}.`;
    } finally {
      submit.disabled = false;
    }
  });

  byId('logoutButton').addEventListener('click', async () => {
    await api.logout();
    location.hash = '';
    showLogin('Access was forgotten on this browser.');
  });

  document.querySelector('.app-nav').addEventListener('click', (event) => {
    const target = event.target.closest('[data-screen]');
    if (target) router.go(target.dataset.screen);
  });

  window.addEventListener('hms:route', (event) => mountScreen(event.detail.screen));
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Payables error', event.reason);
    setGlobalStatus('An unexpected error occurred. Open System for service details.', 'danger');
  });
  window.addEventListener('error', (event) => {
    console.error('Payables browser error', event.error || event.message);
    setGlobalStatus('A browser error occurred. Open System for service details.', 'danger');
  });
}

async function init() {
  bindShell();
  byId('buildLabel').textContent = `Build ${APP_CONFIG.version}`;
  const device = await api.validateSession();
  if (device) showApp(device);
  else showLogin();
}

init().catch((error) => {
  console.error('HMS Payables initialization failed', error);
  showLogin(`The app could not initialize: ${error?.message || 'unknown error'}.`);
});
