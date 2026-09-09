const PAYABLE_KINDS = new Set(['vendor_bill', 'capex_commitment', 'intercompany_transfer']);

export function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

export function dollars(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function cents(value) {
  return Math.round(dollars(value) * 100);
}

export function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

export function ensureRun(state, month, now = new Date().toISOString()) {
  state.runs = state.runs && typeof state.runs === 'object' ? state.runs : {};
  if (!state.runs[month]) {
    state.runs[month] = {
      month,
      approvals: {},
      oneTimeItems: [],
      createdAt: now,
      updatedAt: now,
    };
  }
  const run = state.runs[month];
  run.approvals = run.approvals && typeof run.approvals === 'object' ? run.approvals : {};
  run.oneTimeItems = Array.isArray(run.oneTimeItems) ? run.oneTimeItems : [];
  return run;
}

export function payableKind(item) {
  if (PAYABLE_KINDS.has(item?.payableKind)) return item.payableKind;
  if ((item?.kind || 'bill') === 'allocation') return 'intercompany_transfer';
  if (String(item?.category || '').startsWith('CAPEX /')) return 'capex_commitment';
  return 'vendor_bill';
}

export function activeItems(state, run) {
  const recurring = (state.items || []).filter((item) => item?.active !== false);
  const oneTime = Array.isArray(run?.oneTimeItems) ? run.oneTimeItems : [];
  return [...recurring, ...oneTime];
}

export function locateItem(state, run, id) {
  const recurring = (state.items || []).find((item) => String(item.id) === String(id));
  if (recurring) return { item: recurring, collection: 'recurring' };
  const oneTime = (run.oneTimeItems || []).find((item) => String(item.id) === String(id));
  return oneTime ? { item: oneTime, collection: 'one_time' } : null;
}

export function normalizeItem(item, run, month) {
  const approval = run?.approvals?.[item.id] || null;
  const approved = Boolean(approval?.approved);
  const amountCents = cents(approval?.amount ?? item.expectedAmount);
  const needsReview = Boolean(item.review || item.variable);
  return {
    id: String(item.id),
    month,
    name: clean(item.name, 300) || 'Unnamed payable',
    category: clean(item.category, 160) || 'Unclassified',
    clinic: clean(item.clinic, 160) || 'Unassigned',
    kind: payableKind(item),
    amountCents,
    expectedAmountCents: cents(item.expectedAmount),
    approved,
    status: approved ? 'authorized' : needsReview ? 'review' : 'ready',
    reviewRequired: needsReview,
    recurring: item.active !== false,
    manual: Boolean(item.manual),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate || '')) ? item.dueDate : null,
    description: clean(item.description, 1500) || null,
    sourceDescription: clean(item.sourceDescription, 1500) || null,
    sourcePeriod: clean(item.sourcePeriod, 160) || null,
    lastPaymentDate: item.lastPaymentDate || null,
    lastPaymentAmountCents: item.lastPaymentAmount == null ? null : cents(item.lastPaymentAmount),
    approvalNote: clean(approval?.note, 1000) || null,
    approvalUpdatedAt: approval?.updatedAt || null,
  };
}

export function summarize(items) {
  const authorized = items.filter((item) => item.approved);
  const review = items.filter((item) => item.reviewRequired && !item.approved);
  const ready = items.filter((item) => !item.reviewRequired && !item.approved);
  const sum = (rows) => rows.reduce((total, item) => total + item.amountCents, 0);
  return {
    count: items.length,
    totalCents: sum(items),
    reviewCount: review.length,
    reviewCents: sum(review),
    readyCount: ready.length,
    readyCents: sum(ready),
    authorizedCount: authorized.length,
    authorizedCents: sum(authorized),
    notAuthorizedCents: sum(items) - sum(authorized),
    vendorBillsCents: sum(items.filter((item) => item.kind === 'vendor_bill')),
    capexCents: sum(items.filter((item) => item.kind === 'capex_commitment')),
    transfersCents: sum(items.filter((item) => item.kind === 'intercompany_transfer')),
  };
}

export function payloadFor(state, month) {
  const run = ensureRun(state, month);
  const items = activeItems(state, run).map((item) => normalizeItem(item, run, month));
  return {
    month,
    stateUpdatedAt: state.updatedAt || null,
    items,
    summary: summarize(items),
  };
}

export function assertFresh(state, expectedStateUpdatedAt) {
  if (expectedStateUpdatedAt == null) return;
  const actual = state.updatedAt || null;
  if (String(expectedStateUpdatedAt) !== String(actual)) {
    const error = new Error('payables_state_changed');
    error.code = 'stale_state';
    error.actualStateUpdatedAt = actual;
    throw error;
  }
}

export function addOneTimeItem(state, run, fields, { id, now }) {
  const name = clean(fields?.name, 300);
  if (!name) {
    const error = new Error('payee_required');
    error.code = 'payee_required';
    throw error;
  }
  const kind = PAYABLE_KINDS.has(fields?.kind) ? fields.kind : 'vendor_bill';
  const item = {
    id,
    name,
    category: clean(fields?.category, 160) || (kind === 'capex_commitment' ? 'CAPEX / Unclassified' : 'Unclassified'),
    clinic: clean(fields?.clinic, 160) || 'Unassigned',
    kind: kind === 'intercompany_transfer' ? 'allocation' : 'bill',
    payableKind: kind,
    expectedAmount: dollars(fields?.amount),
    variable: Boolean(fields?.variable),
    review: true,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(fields?.dueDate || '')) ? fields.dueDate : null,
    lastPaymentDate: null,
    lastPaymentAmount: null,
    description: clean(fields?.description, 1500),
    sourceDescription: clean(fields?.sourceDescription, 1500) || 'Added manually in HMS Payables Core.',
    sourcePeriod: run.month,
    active: false,
    manual: true,
    createdAt: now,
    updatedAt: now,
  };
  run.oneTimeItems.push(item);
  run.approvals[id] = { approved: false, amount: item.expectedAmount, note: '', updatedAt: now };
  return item;
}

export function updateItem(found, fields, now) {
  const item = found.item;
  if ('name' in fields) item.name = clean(fields.name, 300) || item.name;
  if ('category' in fields) item.category = clean(fields.category, 160) || 'Unclassified';
  if ('clinic' in fields) item.clinic = clean(fields.clinic, 160) || 'Unassigned';
  if ('amount' in fields) item.expectedAmount = dollars(fields.amount);
  if ('description' in fields) item.description = clean(fields.description, 1500);
  if ('kind' in fields && PAYABLE_KINDS.has(fields.kind)) {
    item.payableKind = fields.kind;
    item.kind = fields.kind === 'intercompany_transfer' ? 'allocation' : 'bill';
    if (fields.kind === 'capex_commitment' && !String(item.category || '').startsWith('CAPEX /')) {
      item.category = `CAPEX / ${item.category || 'Unclassified'}`;
    }
  }
  if (found.collection === 'one_time' && 'dueDate' in fields) {
    item.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fields.dueDate || '')) ? fields.dueDate : null;
  }
  item.updatedAt = now;
  return item;
}

export function setAuthorization(run, item, authorized, now, note = '') {
  run.approvals[item.id] = {
    approved: Boolean(authorized),
    amount: dollars(item.expectedAmount),
    note: clean(note, 1000),
    updatedAt: now,
  };
  return run.approvals[item.id];
}
