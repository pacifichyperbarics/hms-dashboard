export function currentMonth(timeZone = 'America/Los_Angeles', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

export function activeAuthorization(payable) {
  return (payable?.hms_finance_authorizations || [])
    .find((authorization) => authorization.status === 'authorized') || null;
}

function byId(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

export function normalizeCurrentPayable(payable) {
  return {
    key: `current:${payable.month}:${payable.id}`,
    id: String(payable.id),
    source: 'current',
    month: payable.month,
    name: payable.name || 'Unnamed payable',
    category: payable.category || 'Unclassified',
    clinic: payable.clinic || 'Unassigned',
    kind: payable.kind || 'vendor_bill',
    amountCents: Number(payable.amountCents) || 0,
    approved: Boolean(payable.approved),
    status: payable.approved ? 'authorized' : payable.status || 'ready',
    reviewRequired: Boolean(payable.reviewRequired),
    dueDate: payable.dueDate || null,
    description: payable.description || payable.sourceDescription || '',
    howPaid: 'Not recorded',
    raw: payable,
  };
}

export function normalizeFinancePayable(payable, reference = {}) {
  const authorization = activeAuthorization(payable);
  const vendors = byId(reference.vendors);
  const clinics = byId(reference.clinics);
  const accounts = byId(reference.accounts);
  const rules = byId(reference.rules);
  const recipes = byId(reference.recipes);
  const vendor = vendors.get(payable.vendor_id);
  const clinic = clinics.get(payable.clinic_id);
  const account = accounts.get(payable.account_id);
  const rule = rules.get(payable.recurring_rule_id);
  const recipe = recipes.get(rule?.payment_recipe_id);

  return {
    key: `finance:${payable.id}`,
    id: String(payable.id),
    source: 'finance',
    month: null,
    name: payable.payee_name || vendor?.display_name || 'Unnamed payable',
    category: account?.name || account?.code || 'Unclassified',
    clinic: clinic?.name || 'Unassigned',
    kind: payable.payable_kind || 'vendor_bill',
    amountCents: Number(authorization?.authorized_amount_cents ?? payable.amount_cents) || 0,
    approved: Boolean(authorization),
    status: authorization ? 'authorized' : payable.status || 'review',
    reviewRequired: Boolean(payable.review_required),
    dueDate: payable.due_date || null,
    description: payable.description || payable.invoice_number || payable.source_type || '',
    howPaid: recipe?.label || vendor?.default_payment_method || 'Not recorded',
    raw: payable,
  };
}

export function sortPayables(rows) {
  const priority = (item) => {
    if (item.reviewRequired && !item.approved) return 0;
    if (item.approved) return 1;
    return 2;
  };
  return [...rows].sort((left, right) => {
    const priorityDifference = priority(left) - priority(right);
    if (priorityDifference) return priorityDifference;
    if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return right.amountCents - left.amountCents;
  });
}

export function mergePayableSources({
  currentRows = [],
  financeRows = [],
  currentAvailable = false,
  reference = {},
}) {
  const financeFiltered = currentAvailable
    ? financeRows.filter((payable) => payable.source_type !== 'legacy_payables_blob')
    : financeRows;
  return sortPayables([
    ...currentRows.map(normalizeCurrentPayable),
    ...financeFiltered.map((payable) => normalizeFinancePayable(payable, reference)),
  ]);
}

export function isOpen(item) {
  return !['paid', 'reconciled', 'posted', 'cancelled'].includes(item.status);
}

export function summarizePayables(rows = []) {
  const open = rows.filter(isOpen);
  const review = open.filter((item) => item.reviewRequired && !item.approved);
  const authorized = open.filter((item) => item.approved);
  const ready = open.filter((item) => !item.approved && !item.reviewRequired);
  const sum = (items) => items.reduce((total, item) => total + item.amountCents, 0);
  return {
    openCount: open.length,
    totalCents: sum(open),
    reviewCount: review.length,
    reviewCents: sum(review),
    authorizedCount: authorized.length,
    authorizedCents: sum(authorized),
    readyCount: ready.length,
    readyCents: sum(ready),
  };
}

export function cashGroups(rows = []) {
  const open = rows.filter(isOpen);
  const groups = new Map();
  for (const item of open) {
    const key = item.kind || 'vendor_bill';
    const group = groups.get(key) || { kind: key, count: 0, amountCents: 0 };
    group.count += 1;
    group.amountCents += item.amountCents;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents);
}

export function inboxSummary(rows = []) {
  const count = (status) => rows.filter((row) => row.review_status === status).length;
  return {
    total: rows.length,
    review: count('needs_review') + count('ready'),
    held: count('held'),
    duplicate: count('duplicate'),
    promoted: count('promoted'),
  };
}
