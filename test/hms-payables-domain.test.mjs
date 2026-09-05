import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cashGroups,
  inboxSummary,
  mergePayableSources,
  normalizeCurrentPayable,
  summarizePayables,
  validMonth,
} from '../hms-payables/src/domain.js';

test('validMonth accepts only YYYY-MM', () => {
  assert.equal(validMonth('2026-09'), true);
  assert.equal(validMonth('2026-13'), false);
  assert.equal(validMonth('September'), false);
});

test('current payable normalization preserves authorization state', () => {
  const row = normalizeCurrentPayable({
    id: 'rent', month: '2026-09', name: 'Rent', amountCents: 500000,
    approved: true, status: 'ready', clinic: 'Madras', category: 'Rent', kind: 'vendor_bill',
  });
  assert.equal(row.key, 'current:2026-09:rent');
  assert.equal(row.approved, true);
  assert.equal(row.status, 'authorized');
});

test('merge excludes migrated legacy duplicates while current list is available', () => {
  const merged = mergePayableSources({
    currentAvailable: true,
    currentRows: [{ id: 'a', month: '2026-09', name: 'A', amountCents: 100, approved: false }],
    financeRows: [
      { id: 'legacy-a', payee_name: 'A duplicate', amount_cents: 100, source_type: 'legacy_payables_blob' },
      { id: 'new-b', payee_name: 'B', amount_cents: 200, source_type: 'gmail' },
    ],
  });
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((row) => row.name).sort(), ['A', 'B']);
});

test('summary keeps review, ready, and authorized separate', () => {
  const summary = summarizePayables([
    { status: 'review', reviewRequired: true, approved: false, amountCents: 100 },
    { status: 'ready', reviewRequired: false, approved: false, amountCents: 200 },
    { status: 'authorized', reviewRequired: false, approved: true, amountCents: 300 },
    { status: 'posted', reviewRequired: false, approved: false, amountCents: 400 },
  ]);
  assert.deepEqual(summary, {
    openCount: 3,
    totalCents: 600,
    reviewCount: 1,
    reviewCents: 100,
    authorizedCount: 1,
    authorizedCents: 300,
    readyCount: 1,
    readyCents: 200,
  });
});

test('cash groups separate vendor bills, CAPEX, and transfers', () => {
  const groups = cashGroups([
    { status: 'ready', kind: 'vendor_bill', amountCents: 100 },
    { status: 'ready', kind: 'capex_commitment', amountCents: 500 },
    { status: 'ready', kind: 'intercompany_transfer', amountCents: 300 },
    { status: 'posted', kind: 'vendor_bill', amountCents: 900 },
  ]);
  assert.deepEqual(groups.map((group) => group.kind), ['capex_commitment', 'intercompany_transfer', 'vendor_bill']);
});

test('Inbox summary exposes held and duplicate work separately', () => {
  assert.deepEqual(inboxSummary([
    { review_status: 'needs_review' },
    { review_status: 'ready' },
    { review_status: 'held' },
    { review_status: 'duplicate' },
    { review_status: 'promoted' },
  ]), { total: 5, review: 2, held: 1, duplicate: 1, promoted: 1 });
});
