import { APP_CONFIG } from './config.js';

function screenFromHash() {
  const requested = location.hash.replace(/^#/, '').trim();
  return APP_CONFIG.screens.includes(requested) ? requested : 'overview';
}

function go(screen) {
  const selected = APP_CONFIG.screens.includes(screen) ? screen : 'overview';
  if (location.hash === `#${selected}`) {
    window.dispatchEvent(new CustomEvent('hms:route', { detail: { screen: selected } }));
  } else {
    location.hash = selected;
  }
}

function start() {
  const emit = () => window.dispatchEvent(new CustomEvent('hms:route', {
    detail: { screen: screenFromHash() },
  }));
  window.addEventListener('hashchange', emit);
  emit();
}

export const router = Object.freeze({ go, start, screenFromHash });
