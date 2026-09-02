# HMS Dashboard Engineering Guardrails

## Production protection

- The live production site `https://hms-dashboard-v2.netlify.app` must remain available throughout development.
- Never delete, rename, replace, or directly overwrite the production Netlify project.
- Never push dashboard refactor work directly to `master`.
- All work must occur on `dashboard-refactor` or a descendant feature branch and be reviewed through a pull request.
- Use a Netlify branch or deploy-preview URL for testing. Production promotion requires explicit owner approval.
- Preserve the current visual design and existing clinic information unless a task explicitly changes it.
- The July P&L page is a separate artifact and is not part of the operations-dashboard refactor.

## Architecture goals

- Replace the single-file application incrementally; do not perform a destructive rewrite.
- Separate presentation, application logic, clinic data access, authentication, and audit logging.
- Use the existing Supabase project `hms-clinic-ops-dashboard` and its `ops_*` tables where appropriate.
- Do not expose service-role keys or other secrets in browser code or the repository.
- Enforce row-level security and role-based access for production data.
- Maintain a read-only fallback so the dashboard remains usable if the data service is temporarily unavailable.

## Required checks

- Verify the root dashboard loads and its clinic cards, filters, modals, settings, and chat interface still work.
- Verify mobile and desktop layouts.
- Verify authentication and role restrictions before enabling edits.
- Record meaningful data changes in the activity log.
- Test on a preview deployment before any production merge.
- Keep changes small enough to review and roll back.
