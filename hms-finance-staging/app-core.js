export const API = window.HMSFinanceAPI;

export const state = {
  device: null,
  month: currentMonth(),
  currentPayables: [],
  financePayables: [],
  payables: [],
  rules: [],
  recipes: [],
  vendors: [],
  clinics: [],
  accounts: [],
  sourceStatus: { current: 'idle', finance: 'idle' },
  inbox: [],
  cash: null,
  payments: [],
  matches: [],
  adapters: [],
  bankTransactions: [],
  subscriptions: [],
  opportunities: [],
  optimizationRuns: [],
};

export const $ = (id) => document.getElementById(id);

export function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

export function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format((Number(cents) || 0) / 100);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export function pretty(value) {
  return String(value || '').replaceAll('_', ' ');
}

export function currentMonth() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || 'Current month';
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function formatDate(value, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(`${value}${/^\d{4}-\d{2}-\d{2}$/.test(value) ? 'T12:00:00' : ''}`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

export function activeAuthorization(payable) {
  return (payable.hms_finance_authorizations || []).find((authorization) => authorization.status === 'authorized') || null;
}

export async function request(url, method = 'GET', body) {
  try {
    return await API.request(url, method, body);
  } catch (error) {
    if (error.status === 401) {
      API.clearSession?.();
      location.reload();
    }
    throw error;
  }
}

function mapById(rows) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

function normalizeFinancePayable(payable) {
  const authorization = activeAuthorization(payable);
  const vendors = mapById(state.vendors);
  const clinics = mapById(state.clinics);
  const accounts = mapById(state.accounts);
  const rules = mapById(state.rules);
  const recipes = mapById(state.recipes);
  const vendor = vendors.get(payable.vendor_id);
  const clinic = clinics.get(payable.clinic_id);
  const account = accounts.get(payable.account_id);
  const rule = rules.get(payable.recurring_rule_id);
  const recipe = recipes.get(rule?.payment_recipe_id);

  return {
    key: `finance:${payable.id}`,
    id: payable.id,
    source: 'finance',
    month: state.month,
    name: payable.payee_name || vendor?.display_name || 'Unnamed payable',
    category: account?.name || account?.code || 'Unclassified',
    clinic: clinic?.name || 'Unassigned',
    kind: payable.payable_kind || 'vendor_bill',
    amountCents: Number(authorization?.authorized_amount_cents ?? payable.amount_cents) || 0,
    expectedAmountCents: Number(payable.amount_cents) || 0,
    approvedAmountCents: authorization ? Number(authorization.authorized_amount_cents) || 0 : null,
    approved: Boolean(authorization),
    status: authorization ? 'authorized' : payable.status,
    reviewRequired: Boolean(payable.review_required),
    variable: Boolean(payable.metadata?.variable),
    dueDate: payable.due_date || null,
    recurring: Boolean(payable.recurring_rule_id),
    howPaid: recipe?.label || vendor?.default_payment_method || 'Not recorded',
    invoiceNumber: payable.invoice_number || null,
    description: payable.description || null,
    sourceDescription: payable.source_type || 'Finance database',
    raw: payable,
  };
}

function normalizeCurrentPayable(payable) {
  return {
    key: `current:${payable.month}:${payable.id}`,
    ...payable,
    howPaid: 'Not recorded',
    raw: payable,
  };
}

function mergePayableSources() {
  const currentAvailable = state.sourceStatus.current === 'ok';
  const financeRows = currentAvailable
    ? state.financePayables.filter((payable) => payable.source_type !== 'legacy_payables_blob')
    : state.financePayables;

  state.payables = [
    ...state.currentPayables.map(normalizeCurrentPayable),
    ...financeRows.map(normalizeFinancePayable),
  ].sort((left, right) => {
    const priority = (item) => item.reviewRequired && !item.approved ? 0 : item.approved ? 1 : 2;
    const priorityDiff = priority(left) - priority(right);
    if (priorityDiff) return priorityDiff;
    if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return right.amountCents - left.amountCents;
  });
}

export function payableSummary(rows = state.payables) {
  const open = rows.filter((item) => !['paid', 'reconciled', 'posted', 'cancelled'].includes(item.status));
  const review = open.filter((item) => item.reviewRequired && !item.approved);
  const authorized = open.filter((item) => item.approved);
  return {
    count: open.length,
    totalCents: open.reduce((sum, item) => sum + item.amountCents, 0),
    reviewCount: review.length,
    reviewCents: review.reduce((sum, item) => sum + item.amountCents, 0),
    authorizedCount: authorized.length,
    authorizedCents: authorized.reduce((sum, item) => sum + item.amountCents, 0),
    readyCount: open.filter((item) => !item.approved && !item.reviewRequired).length,
  };
}

export async function loadPayableSources({ force = false } = {}) {
  if (!force && state.payables.length) return state.payables;
  state.month = $('payablesMonth')?.value || state.month || currentMonth();

  const currentPromise = request(`${API.endpoints.currentPayables}?month=${encodeURIComponent(state.month)}`);
  const financePromise = request(API.endpoints.payables);
  const [currentResult, financeResult] = await Promise.allSettled([currentPromise, financePromise]);

  if (currentResult.status === 'fulfilled') {
    state.currentPayables = currentResult.value.items || [];
    state.sourceStatus.current = 'ok';
  } else {
    state.currentPayables = [];
    state.sourceStatus.current = 'error';
  }

  if (financeResult.status === 'fulfilled') {
    const value = financeResult.value;
    state.financePayables = value.payables || [];
    state.rules = value.rules || [];
    state.recipes = value.recipes || [];
    state.vendors = value.vendors || [];
    state.clinics = value.clinics || [];
    state.accounts = value.accounts || [];
    state.sourceStatus.finance = 'ok';
  } else {
    state.financePayables = [];
    state.rules = [];
    state.recipes = [];
    state.vendors = [];
    state.clinics = [];
    state.accounts = [];
    state.sourceStatus.finance = 'error';
  }

  mergePayableSources();
  window.dispatchEvent(new CustomEvent('hms-payables-loaded', { detail: { payables: state.payables } }));
  return state.payables;
}

export function sourceSummaryText() {
  const current = state.sourceStatus.current === 'ok' ? 'Current monthly list connected' : 'Current monthly list unavailable';
  const finance = state.sourceStatus.finance === 'ok' ? 'Finance database connected' : 'Finance database unavailable';
  return `${current}. ${finance}.`;
}

export function navigate(tab) {
  const valid = ['overview', 'inbox', 'payables', 'cash', 'payments', 'savings', 'reports', 'settings'];
  const selected = valid.includes(tab) ? tab : 'overview';
  document.querySelectorAll('.tab-section').forEach((element) => element.classList.toggle('active', element.id === `tab-${selected}`));
  document.querySelectorAll('.nav button[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === selected));
  if (location.hash !== `#${selected}`) history.replaceState(null, '', `#${selected}`);
  window.dispatchEvent(new CustomEvent('hms-tab-selected', { detail: { tab: selected } }));
}
