# HMS Monthly Payables - CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is the authoritative handoff for the **legacy/current Monthly Payables app** in public deployment repo `pacifichyperbarics/hms-dashboard`. The broader HMS Finance architecture and canonical finance source now live in private repo `pacifichyperbarics/hms-clinic-ops-dashboard`, branch `hms-finance-v1`, at `hms-ai/FINANCE_CURRENT_STATE.md`.

Read both handoffs before changing migration/cutover behavior. Update the relevant handoff whenever material state changes.

## 1. Current production role

Legacy Monthly Payables remains the **authoritative production Payables state** until Blob -> Postgres parity is explicitly proven.

**Current Payables:** https://hms-dashboard-v2.netlify.app/payables/

**New Finance staging:** https://hms-dashboard-v2.netlify.app/hms-finance-staging/

**Netlify project:** `hms-dashboard-v2`

**Site ID:** `adc6e7e8-12f2-47b7-a6fd-d7eea25e8746`

Do not retire, overwrite, or silently switch `/payables/` yet.

## 2. Legacy data store

Netlify Blobs remains authoritative:
- Store: `hms-payables`
- State key: `state-v1`

Existing functionality remains:
- monthly checkbox approvals
- expected/approved/remaining totals
- editable approval amount in the legacy UI
- bills vs allocations/transfers tabs
- search/filter
- last-payment/source evidence where available
- variable/review flags
- manual recurring and one-time items
- category totals
- month-specific approval state

The new Finance V1 control model is stricter: Postgres manual authorizations are full-payable only until a proper split-payable/remaining-balance model exists. Do not infer that a legacy partial checkbox amount is safely equivalent to a completed Postgres authorization.

## 3. Finance migration compatibility code

Current migration/support files include:
- `netlify/functions/lib/payables-finance-shadow.mjs`
- `netlify/functions/payables-finance-sync.mjs`
- `netlify/functions/payables-finance-health.mjs`

The unreliable scheduled shadow-sync function was removed. Supported migration path is an authenticated Finance **admin browser** triggering the server-side mapper; the server reads the Blob privately and mirrors it to Postgres.

The mapper is intended to preserve:
- stable recurring item identity
- month/item payable identity
- vendor/payee
- amount
- bill/allocation distinction
- known category/account and clinic mapping
- approval/authorization state
- source/last-payment evidence in metadata

## 4. Current migration gate

The new finance database is structurally live but operational finance tables are still empty:
- enrolled devices: 0
- intake: 0
- payables: 0
- payments: 0
- reconciliation matches: 0
- journal entries/lines: 0

Therefore Blob -> Postgres migration has **not yet been exercised with real production state**.

The next required cutover sequence is:
1. Open `https://hms-dashboard-v2.netlify.app/hms-finance-staging/` from the intended administrator browser.
2. Enter the shared HMS password once. Because no finance devices exist yet, this first successful browser becomes the initial admin.
3. Allow the Finance admin path to trigger/observe the legacy parity sync.
4. Inspect Postgres vendor/rule/payable/authorization counts plus `hms_sync_state` parity metadata.
5. Fix and rerun any differences.
6. Preserve the Blob state as rollback evidence.
7. Only after parity passes may Postgres become authoritative.

Do not bypass the shared device-access control merely to test migration.

## 5. Email intake

The original structured legacy parser still exists:
- `netlify/functions/payables-email.mjs`

A production `PAYABLES_EMAIL_TOKEN` secret is configured. Never expose it in chat, docs, or browser code.

The user ultimately wants bill discovery from **hms@healtho2.com**.

Google Workspace/Gmail routing into the legacy parser has not been completed. The newer architecture now also has `hms-finance-intake`, which provides source-key idempotency and a review-before-payable workflow.

**New priority:** complete browser enrollment/parity first. After parity, connect Gmail/email discovery into the new Finance intake layer rather than deepening the legacy parser unless required for compatibility.

## 6. Seeded recurring/payable context

The legacy list was built mainly from May/July HMS expense activity plus August planning.

Major recurring groups include:
- ADP Client Trust / TotalSource / 401(k) / processing fees
- TMS Billings
- Chula rent / Tenant Planet-AppFolio
- Madras rent
- Madras equipment payment (review/CAPEX)
- Matheson medical gas
- Salinas, Chula, Laguna cleaning/laundry
- Laguna / Monterey marketing
- Google Ads
- Hanover / Next / PIA-PC insurance
- RingCentral / Starlink / eFax / Comcast / Wyerd review
- Google Workspace / Digits / OpenAI / WoundReference / Composer / Rocket Money / GoDaddy / Office Ally
- SDG&E
- invoice-driven medical supplies
- NerdzToo CAPEX/IT

Separate allocation/transfer items include:
- Bonita operating-expense reimbursement
- Bonita 50% profit distribution
- Salinas share
- Salinas rent
- Chula rent allocation

Keep vendor AP separate from distributions/intercompany transfers.

## 7. July allocation context retained for migration reference

July P&L figures used by the legacy allocation list:
- Gross receipts: **$271,620.67**
- Operating expenses: **$65,836.21**
- Salinas share: **$9,763.50**
- Salinas rent: **$2,540.00**
- Chula rent: **$3,500.00**
- Total HMS profit: **$189,980.96**
- Base CAPEX reserve retained in #6002: **$20,000.00**
- Bonita 50% profit share: **$84,990.48**
- Bonita operating-expense reimbursement: **$65,836.21**
- Total Bonita transfer: **$150,826.69**

Rule: **Bonita transfer = operating-expense reimbursement + Bonita profit share only.** CAPEX, Salinas share, Salinas rent, and Chula rent are not part of the operating-expense reimbursement.

NerdzToo CAPEX reference: **$5,611.67** from invoices 1911, 1912, 1920, 1921; separate from Bonita transfer.

## 8. August planning additions retained for migration reference

- Madras rent: **$5,000** operating expense
- Madras equipment: **$5,000** CAPEX
- Laguna marketing: **$1,250**
- Laguna materials: **$400**
- Monterey marketing: **$1,500**

## 9. Deployment hygiene

`package.json` is now pinned rather than using npm `latest` tags:
- `@netlify/blobs` 11.0.3
- `@netlify/edge-functions` 4.0.0
- `@netlify/functions` 6.0.0

A generated package lock is still desirable from an npm-capable build environment. Do not hand-author it.

## 10. Operating rules

1. Keep the workflow simple enough to use on the 3rd of each month.
2. Preserve source descriptions and payment history/evidence.
3. Variable/invoice-driven items require review.
4. Vendor AP remains separate from intercompany distributions/transfers.
5. Do not infer payment from approval.
6. Do not infer accounting posting from discovery/approval.
7. Do not disturb unrelated HMS dashboard routes.
8. Test/QC before changing authority or telling the user a cutover succeeded.
9. Keep the legacy Blob app available until Postgres parity and rollback readiness are proven.

## 11. Recommended next actions

Priority order:
1. **Enroll the first intended Finance admin browser and prove Blob -> Postgres parity.**
2. Resolve migration differences until counts/keys/amounts/kinds/authorization state agree.
3. Controlled Postgres authority cutover only after parity + rollback snapshot/reference.
4. Connect `hms@healtho2.com` / Gmail bill discovery into `hms-finance-intake` with stable source IDs and deduplication.
5. Add current bank/accounting imports and normalized payment history.
6. Complete revenue ingestion/posting so the new P&L becomes complete.
7. Add split-payable semantics before permitting partial authorizations in the new model.
8. Real payment execution remains a later explicit project; current Finance adapters do not move money.

## 12. New-chat starter

> Continue development of HMS Monthly Payables / HMS Finance. First read `payables/CURRENT_STATE.md` from `master` of `pacifichyperbarics/hms-dashboard`, then read `hms-ai/FINANCE_CURRENT_STATE.md` from branch `hms-finance-v1` of private repo `pacifichyperbarics/hms-clinic-ops-dashboard`. Treat the private Finance handoff as authoritative for architecture and the public Payables handoff as authoritative for the still-live legacy Blob app. Do not cut over `/payables/` until parity is explicitly proven. Keep access low-friction, test/QC changes, and update the relevant handoff whenever material state changes.
