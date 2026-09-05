# HMS Payables release acceptance

A release is not called usable until the required checks below pass against the deployed production URL.

## Automated checks

- [ ] All browser modules pass `node --check`.
- [ ] All repository tests pass under Node 22.
- [ ] Bare `/hms-payables` redirects to `/hms-payables/`.
- [ ] Production HTML uses only absolute Payables asset paths.
- [ ] The production shell does not import the old staging application.
- [ ] Domain tests preserve review, ready, authorized, CAPEX, transfer, and duplicate-suppression behavior.

## Public shell checks

- [ ] `/hms-payables/` returns the new physical application.
- [ ] CSS and `src/main.js` return successfully.
- [ ] The page shows build `2026.09.04-r1`.
- [ ] The login form remains visible when no hall-pass exists.
- [ ] A browser error displays a readable message instead of a blank page.

## Authenticated read checks

- [ ] Shared-password login succeeds on an allowed browser.
- [ ] Reload reuses the stored opaque hall-pass without re-entering the password.
- [ ] A blocked browser is denied.
- [ ] Overview loads even if one optional source is unavailable.
- [ ] The current Monthly Payables list loads for the selected month.
- [ ] The Finance Inbox loads independently.
- [ ] The System screen identifies each source as available or unavailable with a bounded response time.

## Controlled mutation checks

Use non-destructive or explicitly removable test records only.

- [ ] Add one manual Inbox candidate.
- [ ] Reload and confirm it persisted.
- [ ] Move that candidate to Finance Payables.
- [ ] Confirm it appears once and is not automatically authorized.
- [ ] Authorize one full payable with the checkbox.
- [ ] Confirm the same amount appears in Cash Plan as authorized.
- [ ] Revoke authorization before payment activity begins.
- [ ] Confirm no payment record, bank match, or journal was created by discovery or authorization.
- [ ] Remove or dismiss the acceptance-test record and confirm no residue remains.

## Regression checks

- [ ] Legacy `/payables/` still opens and retains its data.
- [ ] Previous `/hms-finance-staging/` shell remains available as rollback reference.
- [ ] `/ops` and the site root remain unchanged.
- [ ] No real payment adapter is enabled.
- [ ] Legacy Monthly Payables remains authority until a separate cutover decision.

## Post-release decision

Only after all applicable checks pass:

- Mark the new shell usable for daily review and authorization.
- Continue to treat the legacy Blob as authority for the preexisting monthly list.
- Add the next feature as one isolated module, beginning with either evidence upload or Payments—not both simultaneously.
