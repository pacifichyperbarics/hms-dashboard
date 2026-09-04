import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPayablesEmail } from '../netlify/functions/lib/payables-gmail-classifier.mjs';

test('ADP debit advice is a scheduled automatic obligation', () => {
  const result = classifyPayablesEmail({
    from: 'ADP <invoice@adp.com>',
    subject: 'ADP Advice of Debit 729642004',
    labels: ['INBOX'],
    text: 'Client Name PACIFIC HYPERBARICS Advice of Debit Number: 729642004 Advice of Debit Date: 08/28/2026 Advice of Debit Due Date: 09/04/2026 Total Debited This Invoice: $399.77 NO PAYMENT REQUIRED. This amount will be processed for debit from your account on 09/04/2026.',
  });
  assert.equal(result.classification, 'automatic_obligation');
  assert.equal(result.amountCents, 39977);
  assert.equal(result.dueDate, '2026-09-04');
  assert.equal(result.accountCode, '5000-PAYROLL');
});

test('Google Workspace invoice with Juventas wording is held for entity review', () => {
  const result = classifyPayablesEmail({
    from: 'Google Payments <payments-noreply@google.com>',
    subject: 'Your Google Workspace invoice is available',
    labels: ['INBOX'],
    text: 'Invoice number: 5667491329 Invoice date Aug 31, 2026 Total in USD $36.00 Bill to Juventas Health, Inc Pacific Hyperbarics. You will be automatically charged for any amount due.',
  });
  assert.equal(result.classification, 'automatic_obligation');
  assert.equal(result.amountCents, 3600);
  assert.equal(result.invoiceNumber, '5667491329');
  assert.equal(result.accountCode, '5080-SOFTWARE');
  assert.ok(result.flags.includes('possible_juventas_entity'));
});

test('Matheson statement extracts balance, terms, medical gas, and Chula Vista', () => {
  const result = classifyPayablesEmail({
    from: 'Matheson <billing@mathesongas.com>',
    subject: 'Your statement [W8726]',
    labels: ['INBOX'],
    text: 'STATEMENT STATEMENT DATE 08/31/26 CUSTOMER NUMBER W8726 HEALTH AI MANAGEMENT 826 STARBOARD STREET CHULA VISTA CA 91914 NET 30 DAYS TOTAL BALANCE 3,116.04',
  });
  assert.equal(result.disposition, 'inbox');
  assert.equal(result.vendor, 'Matheson');
  assert.equal(result.amountCents, 311604);
  assert.equal(result.invoiceNumber, 'W8726');
  assert.equal(result.dueDate, '2026-09-30');
  assert.equal(result.accountCode, '5030-MEDGAS');
  assert.equal(result.clinicName, 'Chula Vista');
});

test('marketing consultant invoice extracts amount and Net 15 due date', () => {
  const result = classifyPayablesEmail({
    from: 'Stacey <stacey@example.com>',
    subject: 'August invoice',
    labels: ['INBOX'],
    text: 'INVOICE Invoice No. INV-AUG-2026 Invoice Date: August 28, 2026 Payment Terms: Net 15 TOTAL DUE: $1,125.00 Independent Marketing Consultant Pacific Hyperbarics',
  });
  assert.equal(result.disposition, 'inbox');
  assert.equal(result.amountCents, 112500);
  assert.equal(result.invoiceDate, '2026-08-28');
  assert.equal(result.dueDate, '2026-09-12');
  assert.equal(result.accountCode, '5050-MKTG');
});

test('payment receipt is evidence, not a payable', () => {
  const result = classifyPayablesEmail({
    from: 'Netlify <billing@netlify.com>',
    subject: 'Payment received',
    labels: ['INBOX'],
    text: 'Thank you for your payment of $5.00. Your invoice was successfully paid.',
  });
  assert.equal(result.disposition, 'evidence');
  assert.equal(result.classification, 'payment_evidence');
});

test('Stripe payout is income evidence, not a payable', () => {
  const result = classifyPayablesEmail({
    from: 'Stripe <notifications@stripe.com>',
    subject: 'Payout of $1,000 is on the way',
    labels: ['INBOX'],
    text: 'Your payout will arrive in your bank account.',
  });
  assert.equal(result.disposition, 'ignore');
});

test('SDG&E past-due notice is urgent and assigned to Oceanside', () => {
  const result = classifyPayablesEmail({
    from: 'SDG&E <noreply@sdge.com>',
    subject: 'Urgent: Past due - avoid disconnection',
    labels: ['INBOX'],
    text: 'Service address 1411 North Coast Highway Oceanside. Your account is past due. Payment needed to avoid disconnection.',
  });
  assert.equal(result.classification, 'past_due');
  assert.equal(result.urgency, 'high');
  assert.equal(result.clinicName, 'Oceanside');
  assert.equal(result.accountCode, '5090-UTIL');
});

test('changed payment instructions are flagged and block normal automation', () => {
  const result = classifyPayablesEmail({
    from: 'Vendor <billing@example.com>',
    subject: 'Invoice 8841',
    labels: ['INBOX'],
    text: 'Amount due $2,500.00. Please use our new bank account and updated wire instructions.',
  });
  assert.ok(result.flags.includes('payment_destination_change'));
  assert.equal(result.amountCents, 250000);
});
