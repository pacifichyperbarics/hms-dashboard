import { currentMonth } from './domain.js';

const state = {
  device: null,
  month: currentMonth(),
  currentPayables: [],
  financePayables: [],
  payables: [],
  inbox: [],
  reference: { vendors: [], clinics: [], accounts: [], rules: [], recipes: [] },
  sourceStatus: { current: 'idle', finance: 'idle', inbox: 'idle' },
  sourceErrors: {},
  lastLoadedAt: null,
};

const listeners = new Set();

function getState() {
  return state;
}

function update(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
  return state;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const store = Object.freeze({ getState, update, subscribe });
