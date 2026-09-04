# HMS Monthly Payables — CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is authoritative for the live application/deployment compatibility layer in public repo `pacifichyperbarics/hms-dashboard`. The broader Finance architecture and accounting rules are authoritative in private repo `pacifichyperbarics/hms-clinic-ops-dashboard`, branch `hms-finance-v1`, file `hms-ai/FINANCE_CURRENT_STATE.md`.

## Current authority and URLs

**Legacy Monthly Payables / Netlify Blob remains authoritative for the preexisting monthly list. No cutover has occurred.**

- Primary HMS Payables app: `https://hms-dashboard-v2.netlify.app/hms-payables`
- Source path: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/`
- Legacy Payables: `https://hms-dashboard-v2.netlify.app/payables/`
- Setup/copy comparison: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/migration.html`
- Workflow guide: `https://hms-dashboard-v2.netlify.app/hms-finance-staging/workflow.html`
- Device Admin: `https://hms-dashboard-v2.netlify.app/hms-device-access-test/`

Do not retire or silently switch `/payables/` until the copy is exact and a separate controlled cutover is explicitly approved.

## Product workflow

`Find → Inbox → Review and code → Authorize → Pay/record → Bank confirm → Reconcile → Post → P&L and cash plan`

The app is organized as:

- Overview
- Inbox
- Payables
- Cash Plan
- Payments
- Savings
- Reports
- Settings

Finding does not authorize. Authorization does not move money. Only a confirmed, coded bank reconciliation posts accounting.

## Existing Monthly Payables source

- Netlify Blob store: `hms-payables`
- key: `state-v1`
- authenticated service: `netlify/functions/payables-current.mjs`

The new app reads the current monthly list directly through `payables-current`, including recurring/one-time items, monthly approvals, amounts, categories, clinics, vendor bills, CAPEX commitments, and intercompany transfers.

The existing list remains available while controlled migration/cutover work continues.

## Gmail bill discovery implementation

New public-repo modules:

- `netlify/functions/lib/payables-gmail-auth.mjs`
- `netlify/functions/lib/payables-gmail-classifier.mjs`
- `netlify/functions/lib/payables-gmail-scanner.mjs`
- `netlify/functions/payables-gmail.mjs`
- `netlify/functions/payables-gmail-callback.mjs`
- `netlify/functions/payables-gmail-scheduled.mjs`
- `hms-finance-staging/app-gmail.js`
- `hms-finance-staging/gmail.css`
- `test/payables-gmail-classifier.test.mjs`

Behavior:

- read-only Gmail OAuth with PKCE;
- refresh token encrypted with AES-256-GCM;
- first scan uses a targeted query, later scans use Gmail history IDs;
- hourly scheduled scan at minute 17;
- scan overlap is prevented per mailbox;
- messages are classified as payment-needed, scheduled automatic charge, already paid, not payable, or legal-entity hold;
- review candidates retain message/thread IDs, Gmail source link, attachment metadata, sanitized summary, hashes, and scan history;
- full raw attachment contents are not retained in Finance storage;
- suspected changed payment instructions always require manual review;
- already-paid confirmations and incoming payouts do not become payables;
- possible Bonita, Juventas, Health AI Management, personal, or other non-HMS obligations are held for entity confirmation;
- no email scan can authorize, initiate payment, or post accounting.

The Inbox now shows source links. Held items provide **Confirm HMS**, which moves the item back to normal review only.

## Current Gmail connection state

The code, UI, database, and hourly schedule are deployed. The Gmail token-encryption key is configured.

Durable automatic scanning is not active yet because a Google OAuth web client has not been supplied. Required callback:

`https://hms-dashboard-v2.netlify.app/api/hms-payables/gmail/callback`

Required Netlify values:

- `HMS_GOOGLE_CLIENT_ID`
- `HMS_GOOGLE_CLIENT_SECRET`

The ChatGPT Gmail connector credential cannot be reused by the deployed Netlify job.

## Initial assisted email review

A curated initial review of 15 recent messages is already loaded:

- 12 Inbox candidates;
- 8 normal review items;
- 4 legal-entity holds;
- 2 already-paid/payment-confirmation evidence records excluded from AP;
- 1 incoming Stripe payout excluded from AP.

Known amounts:

- normal review: $2,848.27;
- entity-held: $3,152.04;
- several notices require opening the source or attachment for amount/location confirmation.

Examples in the queue include urgent utility notices, Comcast, Matheson, Wyyerd, marketing consulting, an ADP scheduled debit, Google Workspace, B-line Electric, Paychex/Bonita, a property statement, and laundry service.

No email item has been promoted, authorized, paid, reconciled, or posted.

## QC and deployment

Completed checks:

- deterministic email classifier: 8/8 representative cases passed;
- core Finance gate QC passed;
- scan-lock concurrency test passed and rolled back;
- new Gmail foreign keys have supporting indexes;
- RLS/server-only Finance access remains in place;
- temporary/debug sessions removed;
- current operational counts: 15 evidence records, 12 Gmail Inbox candidates, 0 authorizations, 0 payments, 0 journal entries;
- Netlify production deploy is ready, includes 13 functions and the hourly schedule, and reported no secret-scan matches.

Current payment adapters remain record-only. HMS Finance cannot transmit money.

## Simplified setup workflow

The setup page remains a separate engineering/transition tool:

1. Browser access
2. System check
3. Copy and compare
4. Separate switch decision

There is no user-facing persisted-month or initialize-month requirement. Copying and comparing does not switch authority or pay anything.

## Remaining sequence

1. Review the current email candidates at `/hms-payables/#inbox`.
2. Confirm or reject entity-held items.
3. Supply/configure one Google OAuth web client and connect the intended Gmail account from Settings.
4. Run the first live scan and verify it against the assisted review.
5. Confirm the next scan uses incremental history-ID processing and creates no duplicates.
6. Continue with bank import/reconciliation and complete cash/P&L integration.

## Deployment hygiene

Pinned dependencies:

- `@netlify/blobs` 11.0.3
- `@netlify/edge-functions` 4.0.0
- `@netlify/functions` 6.0.0

No scheduled Payables migration job remains. The only new schedule is the Gmail discovery job, which safely skips until OAuth is configured and an active connection exists.

## New-chat starter

> Continue HMS Payables / Finance. Read `payables/CURRENT_STATE.md` from `master` of `pacifichyperbarics/hms-dashboard`, then `hms-ai/FINANCE_CURRENT_STATE.md` from branch `hms-finance-v1` of private repo `pacifichyperbarics/hms-clinic-ops-dashboard`. Treat the private Finance handoff as architecture authority and this file as the live deployment/legacy-Blob authority. Durable Gmail discovery code is deployed and 12 review candidates are loaded, but hourly scanning is inactive until `HMS_GOOGLE_CLIENT_ID` and `HMS_GOOGLE_CLIENT_SECRET` are configured and the mailbox is connected. No email item is authorized or paid. Legacy Monthly Payables remains authoritative until exact comparison and explicit cutover.
