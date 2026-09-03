const ACCOUNT_BY_CATEGORY = new Map([
  ['Payroll & Benefits','5000-PAYROLL'],
  ['Billing Services','5010-BILLING'],
  ['Rent & Occupancy','5020-RENT'],
  ['Medical Gas','5030-MEDGAS'],
  ['Cleaning & Laundry','5040-CLEAN'],
  ['Marketing','5050-MKTG'],
  ['Insurance','5060-INS'],
  ['Telecom & Internet','5070-TELECOM'],
  ['Software & Subscriptions','5080-SOFTWARE'],
  ['Utilities','5090-UTIL'],
  ['Medical Supplies','5100-MEDSUP'],
  ['CAPEX / Equipment','1500-CAPEX-EQUIP'],
  ['CAPEX / IT','1510-CAPEX-IT'],
]);

function env(name) {
  try { return Netlify.env.get(name) || ''; } catch { return process.env[name] || ''; }
}

function cents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

function clean(value, max = 700) {
  return String(value ?? '').trim().slice(0, max);
}

function vendorKey(item) {
  return `legacy-payables:${clean(item.id, 140)}`;
}

function ruleKey(item) {
  return `legacy-payables-rule:${clean(item.id, 140)}`;
}

function payableKey(month, item) {
  return `legacy-payables:${clean(month, 10)}:${clean(item.id, 160)}`;
}

function payableKind(item) {
  if ((item.kind || 'bill') === 'allocation') return 'intercompany_transfer';
  if (String(item.category || '').startsWith('CAPEX /')) return 'capex_commitment';
  return 'vendor_bill';
}

function clinicName(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('chula')) return 'Chula Vista';
  if (text.includes('salinas')) return 'Salinas';
  if (text.includes('laguna')) return 'Laguna';
  if (text.includes('monterey')) return 'Monterey';
  if (text.includes('madras')) return 'Madras';
  if (text.includes('oceanside')) return 'Oceanside';
  if (text.includes('riverside')) return 'Riverside';
  if (text.includes('hurst')) return 'Hurst';
  if (text.includes('corporate') && !text.includes('all clinics')) return 'Corporate / HMS';
  return null;
}

function allRunItems(state, run) {
  const recurring = (state.items || []).filter((item) => item.active !== false);
  return [...recurring, ...(run.oneTimeItems || [])];
}

function sourceInstances(state) {
  const result = [];
  for (const [month, run] of Object.entries(state.runs || {})) {
    for (const item of allRunItems(state, run || {})) {
      const approval = run?.approvals?.[item.id] || {};
      result.push({ month, run, item, approval });
    }
  }
  return result;
}

function supabaseConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url, key };
}

async function rest(config, table, { method = 'GET', query = '', body, prefer = '' } = {}) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${config.url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${table} ${method} failed ${response.status}: ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return [];
  return response.json().catch(() => []);
}

async function referenceMaps(config) {
  const [accounts, clinics] = await Promise.all([
    rest(config, 'hms_finance_accounts', { query: 'select=id,code' }),
    rest(config, 'ops_clinics', { query: 'select=id,name' }),
  ]);
  return {
    accounts: new Map(accounts.map((row) => [row.code, row.id])),
    clinics: new Map(clinics.map((row) => [row.name, row.id])),
  };
}

async function upsert(config, table, rows, conflict) {
  if (!rows.length) return [];
  return rest(config, table, {
    method: 'POST',
    query: `on_conflict=${encodeURIComponent(conflict)}`,
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function syncAuthorizations(config, payableRows, sourceByKey) {
  if (!payableRows.length) return { active: 0, inserted: 0, revoked: 0, updated: 0 };
  const ids = payableRows.map((row) => row.id);
  const idFilter = ids.map((id) => `"${id}"`).join(',');
  const existing = await rest(config, 'hms_finance_authorizations', {
    query: `select=id,payable_id,authorized_amount_cents,status&status=eq.authorized&payable_id=in.(${idFilter})`,
  });
  const existingByPayable = new Map(existing.map((row) => [row.payable_id, row]));
  const inserts = [];
  let revoked = 0;
  let updated = 0;

  for (const payable of payableRows) {
    const source = sourceByKey.get(payable.external_key);
    if (!source) continue;
    const approved = Boolean(source.approval?.approved);
    const amount = cents(source.approval?.amount ?? source.item.expectedAmount);
    const current = existingByPayable.get(payable.id);

    if (approved && !current) {
      inserts.push({
        payable_id: payable.id,
        authorization_type: 'manual',
        status: 'authorized',
        authorized_amount_cents: amount,
        reason: 'Migrated from HMS Monthly Payables approval checkbox.',
        metadata: { legacy_month: source.month, legacy_item_id: source.item.id, shadow_sync: true },
      });
    } else if (approved && current && Number(current.authorized_amount_cents) !== amount) {
      await rest(config, 'hms_finance_authorizations', {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(current.id)}`,
        body: { authorized_amount_cents: amount, metadata: { legacy_month: source.month, legacy_item_id: source.item.id, shadow_sync: true } },
        prefer: 'return=minimal',
      });
      updated += 1;
    } else if (!approved && current) {
      await rest(config, 'hms_finance_authorizations', {
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(current.id)}`,
        body: { status: 'revoked', revoked_at: new Date().toISOString(), reason: 'Legacy Payables approval unchecked.' },
        prefer: 'return=minimal',
      });
      revoked += 1;
    }
  }

  if (inserts.length) {
    await rest(config, 'hms_finance_authorizations', {
      method: 'POST', body: inserts, prefer: 'return=minimal',
    });
  }
  return { active: existing.length + inserts.length - revoked, inserted: inserts.length, revoked, updated };
}

function sameNullable(a, b) {
  return (a ?? null) === (b ?? null);
}

async function parity(config, expectedPayables, sourceByKey, expectedVendorRows, expectedRuleRows) {
  const [rows, vendors, rules, authorizations] = await Promise.all([
    rest(config, 'hms_finance_payables', {
      query: 'select=id,external_key,amount_cents,status,payable_kind,account_id,clinic_id,recurring_rule_id,review_required&source_type=eq.legacy_payables_blob',
    }),
    rest(config, 'hms_finance_vendors', {
      query: 'select=id,vendor_key&vendor_key=like.legacy-payables:*',
    }),
    rest(config, 'hms_finance_recurring_rules', {
      query: 'select=id,external_key&external_key=like.legacy-payables-rule:*',
    }),
    rest(config, 'hms_finance_authorizations', {
      query: 'select=id,payable_id,authorized_amount_cents,status,metadata&status=eq.authorized',
    }),
  ]);

  const expectedByKey = new Map(expectedPayables.map((row) => [row.external_key, row]));
  const actualByKey = new Map(rows.map((row) => [row.external_key, row]));
  const legacyPayableIds = new Set(rows.map((row) => row.id));
  const activeAuthByPayable = new Map(
    authorizations
      .filter((row) => legacyPayableIds.has(row.payable_id))
      .map((row) => [row.payable_id, row]),
  );

  let missing = 0;
  let extra = 0;
  let amountMismatch = 0;
  let statusMismatch = 0;
  let kindMismatch = 0;
  let accountMismatch = 0;
  let clinicMismatch = 0;
  let recurringRuleMismatch = 0;
  let reviewFlagMismatch = 0;
  let authorizationMissing = 0;
  let authorizationUnexpected = 0;
  let authorizationAmountMismatch = 0;

  for (const [key, expected] of expectedByKey) {
    const actual = actualByKey.get(key);
    if (!actual) { missing += 1; continue; }
    if (Number(actual.amount_cents) !== Number(expected.amount_cents)) amountMismatch += 1;
    if (actual.status !== expected.status) statusMismatch += 1;
    if (actual.payable_kind !== expected.payable_kind) kindMismatch += 1;
    if (!sameNullable(actual.account_id, expected.account_id)) accountMismatch += 1;
    if (!sameNullable(actual.clinic_id, expected.clinic_id)) clinicMismatch += 1;
    if (!sameNullable(actual.recurring_rule_id, expected.recurring_rule_id)) recurringRuleMismatch += 1;
    if (Boolean(actual.review_required) !== Boolean(expected.review_required)) reviewFlagMismatch += 1;

    const source = sourceByKey.get(key);
    const shouldBeAuthorized = Boolean(source?.approval?.approved);
    const expectedAuthAmount = cents(source?.approval?.amount ?? source?.item?.expectedAmount);
    const actualAuth = activeAuthByPayable.get(actual.id);
    if (shouldBeAuthorized && !actualAuth) authorizationMissing += 1;
    if (!shouldBeAuthorized && actualAuth) authorizationUnexpected += 1;
    if (shouldBeAuthorized && actualAuth && Number(actualAuth.authorized_amount_cents) !== expectedAuthAmount) authorizationAmountMismatch += 1;
  }
  for (const key of actualByKey.keys()) if (!expectedByKey.has(key)) extra += 1;

  const expectedVendorKeys = new Set(expectedVendorRows.map((row) => row.vendor_key));
  const actualVendorKeys = new Set(vendors.map((row) => row.vendor_key));
  const expectedRuleKeys = new Set(expectedRuleRows.map((row) => row.external_key));
  const actualRuleKeys = new Set(rules.map((row) => row.external_key));
  let vendorMissing = 0, vendorExtra = 0, ruleMissing = 0, ruleExtra = 0;
  for (const key of expectedVendorKeys) if (!actualVendorKeys.has(key)) vendorMissing += 1;
  for (const key of actualVendorKeys) if (!expectedVendorKeys.has(key)) vendorExtra += 1;
  for (const key of expectedRuleKeys) if (!actualRuleKeys.has(key)) ruleMissing += 1;
  for (const key of actualRuleKeys) if (!expectedRuleKeys.has(key)) ruleExtra += 1;

  const mismatchTotal = missing + extra + amountMismatch + statusMismatch + kindMismatch + accountMismatch + clinicMismatch + recurringRuleMismatch + reviewFlagMismatch + authorizationMissing + authorizationUnexpected + authorizationAmountMismatch + vendorMissing + vendorExtra + ruleMissing + ruleExtra;
  return {
    version: 2,
    expected: expectedPayables.length,
    actual: rows.length,
    missing,
    extra,
    amountMismatch,
    statusMismatch,
    kindMismatch,
    accountMismatch,
    clinicMismatch,
    recurringRuleMismatch,
    reviewFlagMismatch,
    authorizationMissing,
    authorizationUnexpected,
    authorizationAmountMismatch,
    vendors: { expected: expectedVendorKeys.size, actual: actualVendorKeys.size, missing: vendorMissing, extra: vendorExtra },
    recurringRules: { expected: expectedRuleKeys.size, actual: actualRuleKeys.size, missing: ruleMissing, extra: ruleExtra },
    mismatchTotal,
    matched: mismatchTotal === 0,
  };
}

export async function syncPayablesToFinance(state) {
  const config = supabaseConfig();
  if (!config || !state || !Array.isArray(state.items)) return { skipped: true, reason: 'not_configured' };

  const refs = await referenceMaps(config);
  const allVendorItems = new Map();
  for (const item of state.items || []) allVendorItems.set(item.id, item);
  for (const run of Object.values(state.runs || {})) for (const item of run?.oneTimeItems || []) allVendorItems.set(item.id, item);

  const vendorRows = [...allVendorItems.values()].map((item) => ({
    vendor_key: vendorKey(item),
    display_name: clean(item.name, 300) || 'Unnamed payable',
    status: item.active === false && !item.manual ? 'inactive' : 'active',
    default_account_id: payableKind(item) === 'intercompany_transfer' ? null : refs.accounts.get(ACCOUNT_BY_CATEGORY.get(item.category) || '5190-OTHER') || null,
    default_clinic_id: refs.clinics.get(clinicName(item.clinic)) || null,
    default_payment_method: null,
    notes: clean(item.description, 1500) || null,
    metadata: {
      legacy_item_id: item.id,
      source_description: clean(item.sourceDescription, 1500) || null,
      source_period: clean(item.sourcePeriod, 160) || null,
      variable: Boolean(item.variable),
      review: Boolean(item.review),
      shadow_sync: true,
    },
  }));
  const vendors = await upsert(config, 'hms_finance_vendors', vendorRows, 'vendor_key');
  const vendorByKey = new Map(vendors.map((row) => [row.vendor_key, row]));

  const recurringRows = (state.items || []).map((item) => ({
    external_key: ruleKey(item),
    vendor_id: vendorByKey.get(vendorKey(item))?.id || null,
    name: clean(item.name, 300) || 'Unnamed payable',
    frequency: 'monthly',
    expected_amount_cents: cents(item.expectedAmount),
    tolerance_cents: item.variable ? Math.max(100, Math.round(cents(item.expectedAmount) * 0.15)) : 0,
    tolerance_percent: item.variable ? 15 : 0,
    authorization_mode: 'manual',
    max_auto_amount_cents: null,
    require_same_destination: true,
    clinic_id: refs.clinics.get(clinicName(item.clinic)) || null,
    account_id: payableKind(item) === 'intercompany_transfer' ? null : refs.accounts.get(ACCOUNT_BY_CATEGORY.get(item.category) || '5190-OTHER') || null,
    payable_kind: payableKind(item),
    active: item.active !== false,
    metadata: {
      legacy_item_id: item.id,
      source_description: clean(item.sourceDescription, 1500) || null,
      source_period: clean(item.sourcePeriod, 160) || null,
      variable: Boolean(item.variable),
      review: Boolean(item.review),
      shadow_sync: true,
    },
  }));
  const recurring = await upsert(config, 'hms_finance_recurring_rules', recurringRows, 'external_key');
  const ruleByKey = new Map(recurring.map((row) => [row.external_key, row]));

  const instances = sourceInstances(state);
  const sourceByKey = new Map();
  const payableRows = instances.map((source) => {
    const { month, item, approval } = source;
    const externalKey = payableKey(month, item);
    sourceByKey.set(externalKey, source);
    const approved = Boolean(approval.approved);
    return {
      external_key: externalKey,
      vendor_id: vendorByKey.get(vendorKey(item))?.id || null,
      payee_name: clean(item.name, 300) || 'Unnamed payable',
      amount_cents: cents(approval.amount ?? item.expectedAmount),
      currency: 'USD',
      description: clean(item.description, 1500) || null,
      status: approved ? 'authorized' : 'ready',
      recurring_rule_id: item.manual && item.active === false ? null : ruleByKey.get(ruleKey(item))?.id || null,
      account_id: payableKind(item) === 'intercompany_transfer' ? null : refs.accounts.get(ACCOUNT_BY_CATEGORY.get(item.category) || '5190-OTHER') || null,
      clinic_id: refs.clinics.get(clinicName(item.clinic)) || null,
      source_type: 'legacy_payables_blob',
      source_id: externalKey,
      source_url: null,
      source_hash: null,
      review_required: Boolean(item.review || item.variable),
      payable_kind: payableKind(item),
      metadata: {
        legacy_month: month,
        legacy_item_id: item.id,
        legacy_note: clean(approval.note, 1000) || null,
        legacy_approval_updated_at: approval.updatedAt || null,
        source_description: clean(item.sourceDescription, 1500) || null,
        source_period: clean(item.sourcePeriod, 160) || null,
        shadow_sync: true,
      },
    };
  });
  const payables = await upsert(config, 'hms_finance_payables', payableRows, 'external_key');
  const authStats = await syncAuthorizations(config, payables, sourceByKey);
  const parityStats = await parity(config, payableRows, sourceByKey, vendorRows, recurringRows);

  const stats = {
    parityVersion: 2,
    vendors: vendors.length,
    recurringRules: recurring.length,
    sourceInstances: instances.length,
    authorizations: authStats,
    parity: parityStats,
    sourceUpdatedAt: state.updatedAt || null,
  };
  await upsert(config, 'hms_sync_state', [{
    connector: 'payables_blob',
    source_account: 'hms-payables/state-v1',
    last_source_timestamp: state.updatedAt || null,
    last_attempt_at: new Date().toISOString(),
    last_success_at: parityStats.matched ? new Date().toISOString() : null,
    status: parityStats.matched ? 'success' : 'partial',
    error_text: parityStats.matched ? null : `Payables shadow parity mismatch (${parityStats.mismatchTotal})`,
    stats,
  }], 'connector,source_account');
  return stats;
}

export async function shadowSyncPayablesSafely(state) {
  try {
    return await syncPayablesToFinance(state);
  } catch (error) {
    console.error('Payables finance shadow sync failed', error instanceof Error ? error.message : error);
    return { error: true };
  }
}
