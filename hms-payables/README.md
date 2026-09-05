# HMS Payables browser application

This directory is the production browser shell for `/hms-payables/`.

## Design rules

- Physical directory, not a rewrite to a staging directory.
- Absolute asset and module paths.
- One API client in `src/api.js`.
- One shared state store in `src/store.js`.
- Pure finance display/composition logic in `src/domain.js`.
- One module per visible screen under `src/screens/`.
- A failed optional source must not prevent the shell or other screens from working.
- Legacy Monthly Payables remains authoritative for the preexisting list until a controlled cutover.
- Authorization never implies payment.
- No browser code contains service-role credentials.

## Supported vertical slice

1. Sign in once with the shared HMS password.
2. Read the current monthly Payables list.
3. Read and manually add Finance Inbox items.
4. Move reviewed Inbox items to Finance Payables.
5. Authorize or revoke a full payable using the checkbox.
6. See authorized, review, ready, CAPEX, and transfer amounts in Cash Plan.
7. Diagnose each source independently on the System screen.

The prior implementation remains at `/hms-finance-staging/` as a temporary rollback reference.
