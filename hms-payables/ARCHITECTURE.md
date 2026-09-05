# HMS Payables architecture

## Product boundary

HMS Payables owns the workflow from a possible payment obligation through review, authorization, cash planning, payment evidence, reconciliation, and accounting handoff.

The browser application does not move money, hold database credentials, or post directly to accounting tables.

## Current production vertical slice

```text
Browser
  |
  +-- Overview screen
  +-- Inbox screen
  +-- Payables screen
  +-- Cash Plan screen
  +-- System screen
  |
  v
One API client (src/api.js)
  |
  +-- Current Monthly Payables adapter
  |      -> Netlify function -> Legacy Netlify Blob
  |
  +-- Finance Inbox / Payables APIs
  |      -> Supabase Edge Functions -> HMS PostgreSQL
  |
  +-- Optional discovery status
         -> Netlify Gmail status function
```

The legacy Blob remains authoritative for the preexisting monthly list until a separate controlled cutover. New Inbox candidates and promoted Finance payables use PostgreSQL.

## One-way dependency rule

```text
main.js
  -> router.js
  -> screens/*
       -> data.js
            -> api.js
            -> domain.js
            -> store.js
       -> ui.js
```

Rules:

1. Screens never call `fetch` or browser storage directly.
2. `api.js` owns HTTP, timeouts, device tokens, and normalized request errors.
3. `data.js` coordinates sources and isolates source failures.
4. `domain.js` contains pure calculations and source normalization. It has no DOM, network, storage, or database dependencies.
5. `store.js` owns browser-session state only. It is not an accounting source of truth.
6. `ui.js` creates DOM nodes with `textContent`; source data is not rendered through arbitrary HTML strings.
7. Each visible screen is independently mountable and independently recoverable.
8. Optional Gmail or reporting failures must not prevent monthly Payables or manual Inbox work.

## Financial state separation

```text
Discovered
   -> Inbox review
      -> Payable
         -> Authorized
            -> Payment record
               -> Bank-confirmed reconciliation
                  -> Posted journal
                     -> P&L
```

These are separate records and events. No earlier state implies a later state.

- Discovery is not authorization.
- Authorization is not payment.
- A payment record is not bank confirmation.
- A bank transaction does not post without confirmed coding and reconciliation.
- Only posted balanced journals feed financial statements.

## Reliability design

- `/hms-payables` canonicalizes to physical directory `/hms-payables/`.
- Browser assets use absolute paths.
- Shell and modules use explicit build-version cache keys.
- Payables HTML is not cached; source modules must revalidate.
- Each network call has a bounded timeout.
- Monthly-list and PostgreSQL requests run independently with `Promise.allSettled`.
- If one payable source fails, the available source still renders and the System screen identifies the failure.
- The old application remains at `/hms-finance-staging/` as a temporary rollback reference.
- Legacy `/payables/` remains available until controlled authority cutover.

## Module ownership

| Module | Owns | Must not own |
|---|---|---|
| `config.js` | endpoints, version, screen names, storage keys | business logic |
| `api.js` | HTTP, timeout, auth token, API operations | DOM rendering or totals |
| `domain.js` | normalization, sorting, summaries, cash grouping | HTTP, DOM, storage |
| `store.js` | current in-browser state | persistent accounting records |
| `data.js` | loading and combining independent sources | presentation markup |
| `ui.js` | safe reusable DOM primitives | data fetching |
| `router.js` | screen selection | screen business logic |
| `screens/*` | one user-facing workflow each | direct raw HTTP or database access |
| Netlify/Supabase APIs | authorization checks and persistent writes | browser presentation |
| HMS PostgreSQL | durable Finance records and ledger | legacy monthly-list authority before cutover |

## Change policy

1. Prove the smallest complete workflow before adding a feature family.
2. Add a pure-domain regression test for every calculation or source-merging rule.
3. Add a static routing test for every production path change.
4. Keep production QA utilities out of normal navigation.
5. Do not add a second implementation of an integration; replace or remove the old one after acceptance.
6. Do not cut over authority as a side effect of deployment.
7. Do not enable a real payment adapter without a separate sandbox, idempotency, destination-verification, reversal, and reconciliation release gate.

## Next modular increments

After the core browser acceptance checklist passes:

1. Add source evidence upload as an Inbox adapter, not as another app shell.
2. Activate one Gmail discovery connector and one scheduler only.
3. Add the Payments screen against the existing payment API.
4. Add bank imports and reconciliation as a separate screen module.
5. Add subscription optimization as a separate screen module.
6. Complete controlled legacy-to-PostgreSQL parity and authority cutover.

Each increment must preserve the same API, data, domain, screen, and source-adapter boundaries.
