# HMS Monthly Payables — CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is authoritative for the still-live legacy Monthly Payables app in public repo `pacifichyperbarics/hms-dashboard`. The broader Finance architecture and canonical business logic are authoritative in private repo `pacifichyperbarics/hms-clinic-ops-dashboard`, branch `hms-finance-v1`, file `hms-ai/FINANCE_CURRENT_STATE.md`.

## Current authority and URLs

**Legacy Monthly Payables / Netlify Blob remains the production authority. No cutover has occurred.**

- Legacy Payables: `https://hms-dashboard-v2.netlify.app/payables/`
- Finance staging: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/`
- Explicit Finance Migration Gate: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/migration.html`
- Device Admin: `https://hms-dashboard-v2.netlify.app/hms-device-access-test/`
- Netlify site ID: `adc6e7e8-12f2-47b7-a6fd-d7eea25e8746`

Do not retire, overwrite, or silently switch `/payables/` until finance-grade parity passes and a separate controlled cutover is explicitly performed.

## Legacy store

Netlify Blob:

- store: `hms-payables`
- key: `state-v1`

Legacy functionality includes recurring and one-time payables, month-specific approval checkboxes/amounts, bills versus allocations/transfers, expected/approved/remaining totals, search, review/variable flags, source descriptions, and last-payment evidence where available.

## Migration compatibility code

- `netlify/functions/lib/payables-finance-shadow.mjs`
- `netlify/functions/payables-finance-sync.mjs`
- `netlify/functions/payables-finance-health.mjs`
- `hms-finance-staging/api.js`
- `hms-finance-staging/migration.html`
- `hms-finance-staging/migration.js`

Current controls:

- Only an enrolled HMS admin browser can view or run parity.
- Normal Finance login/navigation never starts migration.
- The temporary every-minute parity runner was removed.
- The old secondary shadow-token authorization path and disposable trigger were removed.
- The migration gate can explicitly initialize the intended legacy month when definitions exist but no monthly run has been persisted.
- Month initialization creates only an empty monthly work area. It does not approve, pay, copy to Postgres, or change authority.
- Parity cannot pass with zero expected instances while active legacy definitions exist.

## Finance-grade parity

`parity.matched=true` requires zero mismatch across:

- payable keys and counts;
- amount and status;
- payable kind (`vendor_bill`, `intercompany_transfer`, `capex_commitment`);
- account and clinic mapping;
- recurring-rule linkage;
- review-required flag;
- approval/authorization presence and amount;
- legacy vendor-key set;
- legacy recurring-rule-key set.

Even perfect parity displays **“Parity passed — not cut over.”** The sync function never changes authority, deletes the Blob, or moves money.

## Migration safety latch

Once any migrated legacy payable reaches `payment_pending`, `paid`, `reconciled`, `posted`, or `cancelled`, further legacy Blob parity sync is blocked. This prevents a later migration rerun from resetting operational Finance state.

## Current migration state

At the latest review:

- enrolled devices: 0
- migrated legacy vendors/rules/payables: 0
- authorizations/payments/bank transactions/journals: 0
- Payables migration sync rows: 0

Therefore no real parity run and no cutover has occurred.

Required sequence:

1. Open the Finance Migration Gate from the intended administrator browser.
2. Enter the shared HMS password once. With no existing devices, the first successful browser becomes initial admin.
3. Verify persistent hall-pass and Device Admin behavior.
4. Select and initialize the intended legacy month if the gate says no monthly instances exist.
5. Click `Run parity sync`.
6. Review all mismatch categories and rerun after any mapping correction.
7. Preserve the legacy Blob rollback reference.
8. Only then make a separate authority-cutover decision.

## Legacy seed/context retained for parity review

Recurring groups include ADP payroll/benefits, TMS Billings, clinic rent, Madras equipment, Matheson medical gas, cleaning/laundry, marketing, insurance, telecom/internet, software/subscriptions, utilities, medical supplies, and NerdzToo CAPEX/IT.

Separate allocation/transfer items include Bonita operating-expense reimbursement, Bonita profit distribution, Salinas share/rent, and Chula rent allocation. Keep these separate from ordinary vendor AP.

July reference figures:

- Gross receipts: $271,620.67
- Operating expenses: $65,836.21
- Salinas share: $9,763.50
- Salinas rent: $2,540.00
- Chula rent: $3,500.00
- Total HMS profit: $189,980.96
- CAPEX reserve retained in #6002: $20,000.00
- Bonita 50% profit share: $84,990.48
- Bonita operating-expense reimbursement: $65,836.21
- Total Bonita transfer: $150,826.69

Rule: Bonita transfer equals operating-expense reimbursement plus Bonita profit share only. CAPEX, Salinas share/rent, and Chula rent are not part of operating-expense reimbursement.

August planning references:

- Madras rent $5,000 OPEX
- Madras equipment $5,000 CAPEX
- Laguna marketing $1,250
- Laguna materials $400
- Monterey marketing $1,500

## Finance-system behavior already hardened

The private Finance system now has rollback-tested transactional workflows for:

- intake promotion;
- manual checkbox authorization/revocation;
- record-only payment intent and external-payment confirmation;
- bank reconciliation and accounting posting.

The current adapters remain record-only. HMS cannot transmit money through them.

## Email/discovery direction

Legacy parser `netlify/functions/payables-email.mjs` remains compatibility-only. Its secret must never be exposed.

After parity stability, connect durable `hms@healtho2.com`/Gmail discovery to `hms-finance-intake`, preserving message/thread IDs, attachments/support links, source account, source hash, stable source identity, and review-before-payable behavior. Do not deepen the legacy parser unless compatibility requires it.

## Deployment hygiene

Pinned dependencies:

- `@netlify/blobs` 11.0.3
- `@netlify/edge-functions` 4.0.0
- `@netlify/functions` 6.0.0

Reviewed deployments are ready, no scheduled Payables migration job remains, and Netlify secret scanning reports no matches. A generated package lock remains desirable when an npm-capable environment is available; do not hand-author it.

## Operating rules

1. Legacy Blob remains authority until explicit cutover.
2. Preserve source and payment evidence.
3. Variable/invoice-driven items require review.
4. Vendor AP stays separate from distributions/intercompany transfers.
5. Approval does not imply payment.
6. Discovery or approval does not imply accounting posting.
7. Do not disturb unrelated HMS routes.
8. QC before changing authority or reporting cutover success.
9. Keep `/payables/` available as rollback/compatibility until the new system is proven.

## New-chat starter

> Continue HMS Payables / Finance. Read `payables/CURRENT_STATE.md` from `master` of `pacifichyperbarics/hms-dashboard`, then `hms-ai/FINANCE_CURRENT_STATE.md` from branch `hms-finance-v1` of private repo `pacifichyperbarics/hms-clinic-ops-dashboard`. Treat the private Finance handoff as architecture authority and this file as the live legacy Blob authority. The current blocking gate is first admin-browser enrollment, optional explicit legacy-month initialization, and finance-grade parity at `/hms-finance-staging/migration.html`. Normal login must not run migration. Do not cut over `/payables/` until parity is proven and rollback readiness is preserved.
