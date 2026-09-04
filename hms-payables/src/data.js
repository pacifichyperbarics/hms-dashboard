import { api } from './api.js';
import { mergePayableSources, validMonth } from './domain.js';
import { store } from './store.js';

function errorText(error) {
  return error?.detail || error?.message || error?.code || 'Connection error';
}

export async function refreshPayables(month = store.getState().month) {
  if (!validMonth(month)) throw new Error('Invalid month');
  const [currentResult, financeResult] = await Promise.allSettled([
    api.getCurrentPayables(month),
    api.getFinancePayables(),
  ]);

  const currentAvailable = currentResult.status === 'fulfilled';
  const financeAvailable = financeResult.status === 'fulfilled';
  const currentRows = currentAvailable ? currentResult.value.items || [] : [];
  const financePayload = financeAvailable ? financeResult.value : {};
  const financeRows = financePayload.payables || [];
  const reference = {
    vendors: financePayload.vendors || [],
    clinics: financePayload.clinics || [],
    accounts: financePayload.accounts || [],
    rules: financePayload.rules || [],
    recipes: financePayload.recipes || [],
  };

  const payables = mergePayableSources({
    currentRows,
    financeRows,
    currentAvailable,
    reference,
  });

  store.update({
    month,
    currentPayables: currentRows,
    financePayables: financeRows,
    payables,
    reference,
    sourceStatus: {
      ...store.getState().sourceStatus,
      current: currentAvailable ? 'ok' : 'error',
      finance: financeAvailable ? 'ok' : 'error',
    },
    sourceErrors: {
      ...store.getState().sourceErrors,
      current: currentAvailable ? null : errorText(currentResult.reason),
      finance: financeAvailable ? null : errorText(financeResult.reason),
    },
    lastLoadedAt: new Date().toISOString(),
  });

  if (!currentAvailable && !financeAvailable) {
    const error = new Error('Both payable sources are unavailable.');
    error.code = 'all_payable_sources_unavailable';
    throw error;
  }
  return store.getState();
}

export async function refreshInbox() {
  try {
    const result = await api.getInbox();
    store.update({
      inbox: result.items || [],
      sourceStatus: { ...store.getState().sourceStatus, inbox: 'ok' },
      sourceErrors: { ...store.getState().sourceErrors, inbox: null },
      lastLoadedAt: new Date().toISOString(),
    });
  } catch (error) {
    store.update({
      inbox: [],
      sourceStatus: { ...store.getState().sourceStatus, inbox: 'error' },
      sourceErrors: { ...store.getState().sourceErrors, inbox: errorText(error) },
    });
    throw error;
  }
  return store.getState();
}

export async function refreshAll() {
  const results = await Promise.allSettled([
    refreshPayables(store.getState().month),
    refreshInbox(),
  ]);
  return { state: store.getState(), results };
}

export async function systemChecks() {
  const month = store.getState().month;
  const checks = [
    ['Current monthly list', () => api.getCurrentPayables(month)],
    ['Finance payables API', () => api.getFinancePayables()],
    ['Finance Inbox API', () => api.getInbox()],
    ['Gmail discovery status', () => api.getGmailStatus()],
  ];
  return Promise.all(checks.map(async ([name, run]) => {
    const started = performance.now();
    try {
      const value = await run();
      return { name, ok: true, durationMs: Math.round(performance.now() - started), value };
    } catch (error) {
      return {
        name,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        error: errorText(error),
        code: error?.code || 'request_failed',
      };
    }
  }));
}
