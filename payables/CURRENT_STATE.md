# HMS Monthly Payables - CURRENT STATE

**Last updated:** 2026-09-03 PT

This file is the authoritative handoff for continuing the HMS Monthly Payables project in a new ChatGPT conversation. Read this before making changes. Verify only what is needed for the next action. Update this file whenever material state changes.

## 1. Goal

Build a low-friction monthly payables approval system for Hyperbaric Management Services (HMS). The intended workflow is that on or around the **3rd of each month**, the user opens one URL, reviews recurring bills/payables, checks the items to approve, sees totals, and handles exceptions. The system should minimize manual work while keeping the user in control of approvals.

Do not mix ordinary vendor AP with partner/intercompany allocations. Keep those in a separate section.

## 2. Live app

**Payables app:** https://hms-dashboard-v2.netlify.app/payables/

**Netlify project:** `hms-dashboard-v2`

**Netlify site ID:** `adc6e7e8-12f2-47b7-a6fd-d7eea25e8746`

The site is intentionally low-friction. Do not add login/authentication steps unless the user explicitly requests them or they are essential for a specific external action.

## 3. Source repository

**GitHub repository:** `pacifichyperbarics/hms-dashboard`

**Production branch:** `master`

Important files:

- `payables/index.html` - browser UI
- `netlify/functions/payables.mjs` - persistent payables state/API and seeded recurring items
- `netlify/functions/payables-email.mjs` - inbound structured-email parser
- `payables/CURRENT_STATE.md` - this handoff file
- `netlify.toml` - Netlify configuration
- `package.json` - Netlify dependencies

## 4. Current app behavior

The live app currently supports:

- Monthly approval checklist with checkboxes.
- Expected total, approved total, remaining total, and approved item count.
- Editable approval amount per line.
- Tabs for **Bills & Payables**, **Allocations / Transfers**, and **All**.
- Search by payee, clinic, category, source, or description.
- Last-payment date and amount when source history is available.
- Source/bank description when available.
- Variable/review flags for items that should not be blindly approved.
- Manual creation of new payables.
- Manual items can be recurring or one-time.
- Totals by category.
- Central persistence using Netlify Blobs rather than browser-only state.
- Monthly approval state is stored separately by month.

The payables API uses Netlify Blobs:

- Store: `hms-payables`
- State key: `state-v1`

Do not replace central persistence with localStorage.

## 5. Email intake

The user wants bills/payables to be addable by emailing **hms@healtho2.com**.

The inbound parser already exists at:

- `netlify/functions/payables-email.mjs`

A production secret named `PAYABLES_EMAIL_TOKEN` is configured in Netlify. **Do not expose or copy the secret into chat, source documentation, or client-side code.**

The email parser can create an unapproved payable from structured input such as:

`Subject: PAYABLE: Vendor Name | 1250.00 | 2026-09-10 | Laguna`

Optional body fields:

- Vendor / Payee
- Amount
- Due
- Clinic / Location
- Category
- Description
- Recurring: yes/no

**Current missing piece:** Google Workspace/Gmail routing from `hms@healtho2.com` to the Netlify email endpoint has not yet been connected. Until that bridge is completed, emailed items will not automatically appear in the app.

This is the highest-priority unfinished feature unless the user gives a different priority.

## 6. Current source history and seeded payables

The recurring list was built mainly from May and July HMS expense activity, plus August planning items. Last-payment history is best-effort and should be updated as newer actual bank/accounting data becomes available.

Major seeded groups include:

### Payroll / benefits
- ADP Client Trust - payroll funding
- ADP TotalSource - payroll/HR services
- ADP 401(k)
- ADP/Paychex payroll processing fees

### Billing
- TMS Billings

### Rent / occupancy
- Tenant Planet / AppFolio - Chula rent
- Madras rent - planned $5,000/month

### CAPEX / equipment
- Madras equipment payment - planned $5,000; flagged for review because recurring status should be confirmed
- NerdzToo - invoice-driven CAPEX/IT; do not treat as fixed autopay

### Medical gas / clinic operations
- Matheson / NSM Matheson
- Salinas cleaning - Angela
- Chula cleaning/laundry
- Laguna cleaning/laundry
- Medical / clinic supplies - invoice-driven, variable

### Marketing
- Laguna marketing - planned $1,250/month
- Monterey marketing - planned $1,500/month
- Google Ads

### Insurance
- Hanover Insurance
- Next Insurance - general liability
- Next Insurance - professional liability
- Next Insurance - property
- PIA-PC insurance

### Telecom / internet
- RingCentral
- Starlink
- CCSI eFax
- Comcast / Xfinity
- Wyerd Fiber - verify still active

### Software / subscriptions
- Google Workspace
- Digits Financial
- OpenAI / ChatGPT subscription - verify active account count
- WoundReference
- Composer
- Rocket Money - review whether still needed
- GoDaddy
- Office Ally

### Utilities
- SD Gas & Electric - latest exact transaction history should be refreshed when newer source data is available

### Separate monthly allocations / transfers
These are intentionally separated from vendor AP:

- Bonita - operating expense reimbursement
- Bonita - 50% profit distribution
- Salinas share
- Salinas rent
- Chula rent allocation

These amounts are not necessarily fixed and should follow the applicable monthly P&L/allocation logic.

## 7. Relevant July P&L figures for allocation context

The July P&L was updated to:

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

Important rule: **Bonita transfer = operating-expense reimbursement + Bonita profit share only.** CAPEX, Salinas share, Salinas rent, and Chula rent are not part of the operating-expense reimbursement.

NerdzToo CAPEX added separately: **$5,611.67** from invoices 1911, 1912, 1920, and 1921. It is tracked in #6002 and is not part of the Bonita transfer.

## 8. August planning additions relevant to payables

Using July as the planning baseline, August added:

- Madras rent: **$5,000**
- Madras equipment: **$5,000**
- Laguna marketing: **$1,250**
- Laguna materials: **$400**
- Monterey marketing: **$1,500**

Madras rent and equipment were requested as an explicit Madras line item, with rent treated as operating expense and equipment treated as CAPEX.

## 9. Operating principles for future development

1. Keep the workflow simple enough to use on the 3rd of each month.
2. User approval should be one click/checkbox per item where practical.
3. Show expected amount, actual/approval amount, last payment, source, and exception status.
4. Variable or invoice-driven items should require review rather than blind preapproval.
5. Fixed, low-risk recurring items may eventually be pre-populated, but actual payment should not be initiated without explicit user direction.
6. Keep vendor AP separate from distributions/intercompany transfers.
7. Preserve source descriptions and payment history so each line can be audited.
8. Make it easy to add/disable/edit recurring items without editing source code.
9. Avoid unnecessary authentication friction.
10. Test/QC changes before telling the user a URL works.
11. Do not overwrite unrelated HMS dashboard projects or routes.

## 10. Recommended next steps

Priority order unless the user changes it:

1. **Connect `hms@healtho2.com` email intake** to the existing `payables-email` endpoint using the simplest reliable Google Workspace/Gmail mail-to-webhook bridge.
2. Add a clean **edit payable** control in the UI for payee/category/clinic/default amount/active status.
3. Add a **payment history** view so last payment is derived from history rather than only seeded fields.
4. Add an import/reconciliation flow for new bank CSV/accounting data to refresh last-payment dates and amounts.
5. Add a monthly **approval summary/export** showing approved, held, and exception items.
6. Consider reminder/automation for the **3rd of each month** after the checklist itself is stable.
7. Only after approval workflow is reliable, evaluate actual payment initiation/integration. Do not automatically send money merely because an item is checked unless the user explicitly authorizes that workflow.

## 11. New-chat starter instruction

Recommended prompt for a new chat:

> Continue development of HMS Monthly Payables. Before doing anything, read `payables/CURRENT_STATE.md` from branch `master` of the private GitHub repo `pacifichyperbarics/hms-dashboard`. Treat that file as authoritative over prior chat history. Verify only what is needed for the next action, then continue from its current priority list. Update `CURRENT_STATE.md` whenever material state changes. Keep the app low-friction, test/QC changes, and do not disturb unrelated HMS dashboard routes.
