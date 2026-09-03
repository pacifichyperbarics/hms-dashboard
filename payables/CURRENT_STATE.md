# HMS Monthly Payables - CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is authoritative for the **still-live legacy Monthly Payables app** in public repo `pacifichyperbarics/hms-dashboard`. The broader Finance architecture/source is authoritative in private repo `pacifichyperbarics/hms-clinic-ops-dashboard`, branch `hms-finance-v1`, file `hms-ai/FINANCE_CURRENT_STATE.md`.

## Current authority

Legacy Monthly Payables / Netlify Blob is still production authority.

- Legacy Payables: `https://hms-dashboard-v2.netlify.app/payables/`
- Finance staging: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/`
- **Finance Migration Gate:** `https://hms-dashboard-v2.netlify.app/hms-finance-staging/migration.html`
- Netlify site ID: `adc6e7e8-12f2-47b7-a6fd-d7eea25e8746`

Do not retire, overwrite, or silently switch `/payables/` until finance-grade parity passes and an explicit controlled cutover is performed.

## Legacy store

Netlify Blob:
- store: `hms-payables`
- key: `state-v1`

Legacy functionality includes recurring and one-time payables, month-specific approval checkboxes/amounts, bills vs allocations/transfers, expected/approved/remaining totals, search, review/variable flags, source descriptions, and last-payment evidence where available.

The new Postgres Finance V1 deliberately does **not** support arbitrary partial authorization yet. Manual Postgres authorization is full-payable only until a split-payable/remaining-balance model exists. A legacy partial approval amount is therefore migrated as the payable amount for that monthly shadow instance rather than assumed to mean the original full obligation was paid.

## Migration compatibility code

- `netlify/functions/lib/payables-finance-shadow.mjs`
- `netlify/functions/payables-finance-sync.mjs`
- `netlify/functions/payables-finance-health.mjs`
- `hms-finance-staging/migration.html`
- `hms-finance-staging/migration.js`

The old scheduled sync was removed. The old secondary `HMS_PAYABLES_SHADOW_TOKEN` path was also removed and the Netlify secret deleted.

**Only an enrolled HMS admin browser can view/run migration parity.**

## Finance-grade parity v2

The old parity definition was strengthened. `parity.matched=true` now requires zero mismatches across:
- payable keys/counts
- amount
- status
- payable kind (`vendor_bill`, `intercompany_transfer`, `capex_commitment`)
- account mapping
- clinic mapping
- recurring-rule linkage
- review-required flag
- approval/authorization presence/absence
- approval amount
- legacy vendor key set
- legacy recurring-rule key set

The Migration Gate displays mismatch categories separately.

Even perfect parity displays **“Parity passed — not cut over.”** The sync function never changes authority, deletes the Blob, or moves money.

## Migration safety latch

Once any migrated legacy payable reaches:
- `payment_pending`
- `paid`
- `reconciled`
- `posted`
- `cancelled`

further legacy Blob parity sync is blocked. This prevents a later migration rerun from resetting operational finance state back to `ready`/`authorized`.

## Current migration status

Live Finance operational counts remain:
- enrolled devices: 0
- migrated payables: 0
- posted journals: 0
- Payables migration sync rows: 0

Therefore no real parity run and no cutover has occurred.

Next required sequence:
1. Open the Finance Migration Gate from the intended administrator browser.
2. Enter the shared HMS password once. With devices=0, first successful browser becomes initial admin.
3. Validate persistent hall-pass and Device Admin behavior.
4. Click **Run parity sync**.
5. Review all parity-v2 categories.
6. Fix/rerun mismatches until zero.
7. Preserve the legacy Blob rollback reference/snapshot.
8. Only then make a separate controlled authority decision.

## Legacy seed/context retained for parity review

Recurring groups include:
- ADP Client Trust / TotalSource / 401(k) / fees
- TMS Billings
- Chula rent / Tenant Planet-AppFolio
- Madras rent and equipment
- Matheson medical gas
- clinic cleaning/laundry
- Laguna/Monterey marketing and Google Ads
- Hanover / Next / PIA-PC
- RingCentral / Starlink / eFax / Comcast / Wyerd review
- Google Workspace / Digits / OpenAI / WoundReference / Composer / Rocket Money / GoDaddy / Office Ally
- SDG&E
- medical supplies
- NerdzToo CAPEX/IT

Separate allocation/transfer items include Bonita operating-expense reimbursement, Bonita 50% profit distribution, Salinas share, Salinas rent, and Chula rent allocation. Keep these separate from ordinary vendor AP.

July reference figures retained for parity:
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

Rule: Bonita transfer = operating-expense reimbursement + Bonita profit share only. CAPEX, Salinas share/rent, and Chula rent are not part of operating-expense reimbursement.

August planning references:
- Madras rent $5,000 OPEX
- Madras equipment $5,000 CAPEX
- Laguna marketing $1,250
- Laguna materials $400
- Monterey marketing $1,500

## Email / discovery direction

Legacy parser `netlify/functions/payables-email.mjs` still exists and its `PAYABLES_EMAIL_TOKEN` secret must never be exposed.

After parity/cutover stability, connect `hms@healtho2.com` / Gmail discovery to **`hms-finance-intake`**, preserving message/thread IDs, attachments/support links, source account, stable source identity, and review-before-payable behavior. Do not deepen the legacy parser unless compatibility requires it.

## Deployment hygiene

Pinned dependencies:
- `@netlify/blobs` 11.0.3
- `@netlify/edge-functions` 4.0.0
- `@netlify/functions` 6.0.0

No scheduled Payables shadow job remains. Netlify deployments reviewed during this work were ready and secret scanning reported no matches.

A generated package lock is still desirable from an npm-capable build environment; do not hand-author one.

## Operating rules

1. Legacy Blob remains authority until explicit cutover.
2. Preserve source/payment evidence.
3. Variable/invoice-driven items require review.
4. Vendor AP stays separate from distributions/intercompany transfers.
5. Approval does not imply payment.
6. Discovery/approval does not imply accounting posting.
7. Do not disturb unrelated HMS routes.
8. QC before changing authority or reporting cutover success.
9. Keep `/payables/` available as rollback/compatibility until the new system is proven.

## New-chat starter

> Continue HMS Payables / Finance. Read `payables/CURRENT_STATE.md` from `master` of `pacifichyperbarics/hms-dashboard`, then `hms-ai/FINANCE_CURRENT_STATE.md` from branch `hms-finance-v1` of private repo `pacifichyperbarics/hms-clinic-ops-dashboard`. Treat the private Finance handoff as architecture authority and this file as the live legacy Blob authority. Current blocking gate is the first real admin-browser enrollment and finance-grade parity-v2 run at `/hms-finance-staging/migration.html`. Do not cut over `/payables/` until parity is explicitly proven and rollback readiness is preserved.
