import { getStore } from '@netlify/blobs';
import { audit, authenticatedDevice } from './lib/hms-device-session.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';
const TIME_ZONE = 'America/Los_Angeles';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function cents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function dollars(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function validMonth(value) {
  const text = clean(value, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : currentMonth();
}

function payableKind(item) {
  if ((item.kind || 'bill') === 'allocation') return 'intercompany_transfer';
  if (String(item.category || '').startsWith('CAPEX /')) return 'capex_commitment';
  return 'vendor_bill';
}

function activeItems(state, run) {
  const recurring = (state.items || []).filter((item) => item?.active !== false);
  const oneTime = Array.isArray(run?.oneTimeItems) ? run.oneTimeItems : [];
  return [...recurring, ...oneTime];
}

function virtualRun(state, month) {
  const stored = state.runs && typeof state.runs === 'object' ? state.runs[month] : null;
  return stored || { month, approvals: {}, oneTimeItems: [], virtual: true };
}

function normalizeItem(item, run, month) {
  const approval = run?.approvals?.[item.id] || null;
  const approved = Boolean(approval?.approved);
  const amountCents = cents(approval?.amount ?? item.expectedAmount);
  const needsReview = Boolean(item.review || item.variable);
  return {
    id: String(item.id),
    source: 'current_payables',
    month,
    name: clean(item.name, 300) || 'Unnamed payable',
    category: clean(item.category, 160) || 'Unclassified',
    clinic: clean(item.clinic, 160) || 'Unassigned',
    kind: payableKind(item),
    amountCents,
    expectedAmountCents: cents(item.expectedAmount),
    approvedAmountCents: approved ? amountCents : null,
    approved,
    status: approved ? 'authorized' : needsReview ? 'review' : 'ready',
    variable: Boolean(item.variable),
    reviewRequired: needsReview,
    recurring: item.active !== false,
    dueDate: null,
    lastPaymentDate: item.lastPaymentDate || null,
    lastPaymentAmountCents: item.lastPaymentAmount == null ? null : cents(item.lastPaymentAmount),
    description: clean(item.description, 1500) || null,
    sourceDescription: clean(item.sourceDescription, 1500) || null,
    sourcePeriod: clean(item.sourcePeriod, 160) || null,
    approvalNote: clean(approval?.note, 1000) || null,
    approvalUpdatedAt: approval?.updatedAt || null,
  };
}

function summarize(items) {
  const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const authorized = items.filter((item) => item.approved);
  const review = items.filter((item) => item.reviewRequired && !item.approved);
  return {
    count: items.length,
    totalCents,
    authorizedCount: authorized.length,
    authorizedCents: authorized.reduce((sum, item) => sum + item.amountCents, 0),
    reviewCount: review.length,
    reviewCents: review.reduce((sum, item) => sum + item.amountCents, 0),
    vendorBillsCents: items.filter((item) => item.kind === 'vendor_bill').reduce((sum, item) => sum + item.amountCents, 0),
    capexCents: items.filter((item) => item.kind === 'capex_commitment').reduce((sum, item) => sum + item.amountCents, 0),
    transfersCents: items.filter((item) => item.kind === 'intercompany_transfer').reduce((sum, item) => sum + item.amountCents, 0),
  };
}

async function readState() {
  const store = getStore(STORE_NAME);
  const state = await store.get(STATE_KEY, { type: 'json' });
  if (!state || !Array.isArray(state.items)) throw new Error('current_payables_state_missing');
  return { store, state };
}

function locateItem(state, run, id) {
  const recurring = (state.items || []).find((item) => String(item.id) === id);
  if (recurring) return { item: recurring, collection: 'recurring' };
  const oneTime = (run.oneTimeItems || []).find((item) => String(item.id) === id);
  return oneTime ? { item: oneTime, collection: 'one_time' } : null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);

  try {
    const device = await authenticatedDevice(req, { requireAdmin: req.method === 'POST' });
    if (!device) return json({ error: req.method === 'POST' ? 'admin_device_required' : 'device_session_required' }, req.method === 'POST' ? 403 : 401);

    const url = new URL(req.url);
    const month = validMonth(url.searchParams.get('month'));
    const { store, state } = await readState();
    state.runs = state.runs && typeof state.runs === 'object' ? state.runs : {};
    const run = virtualRun(state, month);

    if (req.method === 'GET') {
      const items = activeItems(state, run).map((item) => normalizeItem(item, run, month));
      return json({ ok: true, month, items, summary: summarize(items), device: { id: device.id, isAdmin: device.isAdmin } });
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 50);
    const id = clean(body.id, 160);
    if (!id) return json({ error: 'id_required' }, 400);

    const found = locateItem(state, run, id);
    if (!found) return json({ error: 'payable_not_found' }, 404);
    const beforeItem = structuredClone(found.item);
    const beforeApproval = structuredClone(run.approvals?.[id] || null);

    if (action === 'set-authorization') {
      const authorized = Boolean(body.authorized);
      run.approvals = run.approvals && typeof run.approvals === 'object' ? run.approvals : {};
      run.approvals[id] = {
        approved: authorized,
        amount: dollars(body.amount ?? found.item.expectedAmount),
        note: clean(body.note, 1000),
        updatedAt: new Date().toISOString(),
      };
      run.updatedAt = new Date().toISOString();
      state.runs[month] = run;
      state.updatedAt = run.updatedAt;
      await store.setJSON(STATE_KEY, state);

      const item = normalizeItem(found.item, run, month);
      await audit(device.config, authorized ? 'current_payable_authorized' : 'current_payable_authorization_revoked', 'current_payable', `${month}:${id}`, device.id, { item: beforeItem, approval: beforeApproval }, item, { month });
      return json({ ok: true, month, item, summary: summarize(activeItems(state, run).map((entry) => normalizeItem(entry, run, month))) });
    }

    if (action === 'update-item') {
      const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
      if ('name' in fields) found.item.name = clean(fields.name, 300) || found.item.name;
      if ('category' in fields) found.item.category = clean(fields.category, 160) || found.item.category;
      if ('clinic' in fields) found.item.clinic = clean(fields.clinic, 160) || found.item.clinic;
      if ('expectedAmount' in fields) found.item.expectedAmount = dollars(fields.expectedAmount);
      if ('variable' in fields) found.item.variable = Boolean(fields.variable);
      if ('review' in fields) found.item.review = Boolean(fields.review);
      if ('description' in fields) found.item.description = clean(fields.description, 1500);
      found.item.updatedAt = new Date().toISOString();
      state.updatedAt = found.item.updatedAt;
      await store.setJSON(STATE_KEY, state);

      const item = normalizeItem(found.item, run, month);
      await audit(device.config, 'current_payable_updated', 'current_payable', `${month}:${id}`, device.id, beforeItem, found.item, { month, collection: found.collection });
      return json({ ok: true, month, item });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('payables-current failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'current_payables_unavailable', detail: error instanceof Error ? error.message : String(error) }, 500);
  }
};
