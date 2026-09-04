# HMS Monthly Payables — CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is authoritative for the still-live legacy Monthly Payables app in public repo `pacifichyperbarics/hms-dashboard`. The broader Finance architecture is authoritative in private repo `pacifichyperbarics/hms-clinic-ops-dashboard`, branch `hms-finance-v1`, file `hms-ai/FINANCE_CURRENT_STATE.md`.

## Current authority and URLs

**Legacy Monthly Payables / Netlify Blob remains authoritative. No cutover has occurred.**

- Legacy Payables: `https://hms-dashboard-v2.netlify.app/payables/`
- Finance workspace: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/`
- Simple Payables setup: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/migration.html`
- Workflow guide: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/workflow.html`
- Device Admin: `https://hms-dashboard-v2.netlify.app/hms-device-access-test/`

Do not retire or silently switch `/payables/` until the copy is exact and a separate controlled cutover is explicitly approved.

## Legacy store

- Netlify Blob store: `hms-payables`
- key: `state-v1`

Legacy functionality includes recurring and one-time payables, month-specific approval checkboxes and amounts, bills versus allocations/transfers, expected/approved/remaining totals, search, review/variable flags, source descriptions, and last-payment evidence.

## Simplified setup workflow

The prior setup screen exposed implementation details and was confusing. It has been replaced with four plain-language steps:

1. Browser access
2. System check
3. Copy and compare
4. Switch later only by separate approval

Removed from the user workflow:

- `Persisted months`
- manual month initialization
- `Postgres shadow` terminology
- `parity` terminology except inside optional technical details

The setup service now creates a current-month comparison set in memory without modifying the live Blob merely to manufacture a month record. Normal Finance login/navigation does not start the copy.

The setup page has explicit browser and server timeouts. It must show whether the existing Payables source or the new Finance database failed instead of loading forever or showing only a generic error.

## Setup compatibility code

- `netlify/functions/lib/payables-finance-shadow.mjs`
- `netlify/functions/payables-finance-sync.mjs`
- `netlify/functions/payables-finance-health.mjs`
- `hms-finance-staging/api.js`
- `hms-finance-staging/migration.html`
- `hms-finance-staging/migration.js`
- `hms-finance-staging/workflow.html`

Only an enrolled HMS administrator browser can run System Check or Copy and Compare. The first real Mac browser has been enrolled as the initial administrator.

## What Copy and Compare checks

The technical comparison still validates:

- payable keys and counts;
- amount and status;
- vendor bill, intercompany transfer, or CAPEX commitment type;
- account and clinic mapping;
- recurring-rule linkage;
- review-required flag;
- approval presence and amount;
- vendor-key and recurring-rule-key sets.

Even an exact copy remains **not cut over**. The service never changes authority, deletes the Blob, or moves money.

## Safety latch

Once a copied legacy payable reaches `payment_pending`, `paid`, `reconciled`, `posted`, or `cancelled`, the setup copy is locked against overwrite. This prevents a later setup rerun from regressing operational Finance state.

## Current live state

- One allowed administrator browser is enrolled.
- No authority cutover has occurred.
- No payment has been initiated by HMS Finance.
- Legacy Payables remains active and available.
- A final accepted Copy and Compare result has not yet become the cutover basis.

## Required next sequence

1. Open the refreshed simple Payables Setup page.
2. Click **Run system check**.
3. Click **Copy and compare**.
4. Review any differences.
5. Preserve the Blob rollback reference.
6. Make a separate decision before switching authority.

There is no persisted-month or initialize-month step.

## Operating workflow after setup

`Find → Inbox → Review and code → Authorize → Pay/record → Bank confirm → Reconcile → Post → P&L and cash plan`

The subscriptions/cost-reduction scanner is a separate review loop. A savings suggestion does not change accounting until actual spending changes.

## Legacy seed/context retained for review

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

## Finance controls already built

The private Finance system has rollback-tested transactional workflows for intake promotion, manual and bounded automatic authorization, record-only payment intent, external payment confirmation, bank reconciliation, balanced accounting posting, ledger immutability, and controlled reversals.

The current adapters remain record-only. HMS cannot transmit money through them.

## Email/discovery direction

The legacy parser `netlify/functions/payables-email.mjs` remains compatibility-only. After setup stability, durable `hms@healtho2.com`/Gmail discovery should feed `hms-finance-intake` while preserving message/thread IDs, attachments, source account, source hash, stable identity, and review-before-payable behavior.

## Deployment hygiene

Pinned dependencies:

- `@netlify/blobs` 11.0.3
- `@netlify/edge-functions` 4.0.0
- `@netlify/functions` 6.0.0

No scheduled Payables migration job remains. Reviewed deployments are ready and secret scanning reports no matches.

## New-chat starter

> Continue HMS Payables / Finance. Read `payables/CURRENT_STATE.md` from `master` of `pacifichyperbarics/hms-dashboard`, then `hms-ai/FINANCE_CURRENT_STATE.md` from branch `hms-finance-v1` of private repo `pacifichyperbarics/hms-clinic-ops-dashboard`. Treat the private Finance handoff as architecture authority and this file as the live legacy Blob authority. The setup screen is now plain-language: browser access, system check, copy and compare, then a separate switch decision. There is no persisted-month step. Legacy Payables remains authoritative until an exact comparison and explicit cutover.
