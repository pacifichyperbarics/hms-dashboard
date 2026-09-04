import test from 'node:test';
import assert from 'node:assert/strict';
import { bankFileHash, parseBankCsv, parseDelimited } from '../netlify/functions/lib/payables-bank-parser.mjs';

test('parses quoted CSV including commas and newlines', () => {
  const parsed = parseDelimited('Date,Description,Amount\n09/01/2026,"Vendor, Inc",-12.34\n09/02/2026,"Two\nlines",5.00');
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[1][1], 'Vendor, Inc');
  assert.equal(parsed.rows[2][1], 'Two\nlines');
});

test('parses headerless Wells Fargo export', () => {
  const csv = '09/01/2026,-125.50,*,1234,"ACH PAYMENT VENDOR"\n09/02/2026,5000.00,*,,"DEPOSIT"';
  const result = parseBankCsv(csv, { accountKey: 'wf-0811', fileName: 'WF0811 Sep.csv' });
  assert.equal(result.parserKey, 'wells_fargo_headerless');
  assert.equal(result.summary.readyCount, 2);
  assert.equal(result.summary.totalOutflowCents, 12550);
  assert.equal(result.summary.totalInflowCents, 500000);
  assert.equal(result.rows[0].transactionKind, 'outflow');
});

test('parses Chase style headers', () => {
  const csv = 'Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\nDEBIT,09/02/2026,COMCAST,-226.00,ACH_DEBIT,1000.00,\nCREDIT,09/03/2026,REFUND,25.00,MISC_CREDIT,1025.00,';
  const result = parseBankCsv(csv, { accountKey: 'chase-7126', fileName: 'Chase7126.csv' });
  assert.equal(result.parserKey, 'chase_csv');
  assert.equal(result.rows[0].transactionDate, '2026-09-02');
  assert.equal(result.rows[0].amountCents, -22600);
  assert.equal(result.rows[1].transactionKind, 'reversal');
});

test('parses debit and credit columns', () => {
  const csv = 'Date,Description,Debit,Credit\n09/01/2026,Utility,100.25,\n09/02/2026,Deposit,,900.00';
  const result = parseBankCsv(csv, { accountKey: 'generic' });
  assert.equal(result.rows[0].amountCents, -10025);
  assert.equal(result.rows[1].amountCents, 90000);
});

test('ignores pending transactions', () => {
  const csv = 'Date,Description,Amount,Status\n09/01/2026,Pending debit,-10.00,Pending';
  const result = parseBankCsv(csv, { accountKey: 'wf-0811' });
  assert.equal(result.rows[0].rowStatus, 'ignored');
  assert.match(result.rows[0].error, /Pending/);
});

test('marks malformed rows invalid', () => {
  const csv = 'Date,Description,Amount\nnot-a-date,Vendor,abc';
  const result = parseBankCsv(csv, { accountKey: 'wf-0811' });
  assert.equal(result.rows[0].rowStatus, 'invalid');
  assert.match(result.rows[0].error, /date/i);
});

test('creates distinct stable IDs for identical duplicate rows', () => {
  const csv = 'Date,Description,Amount\n09/01/2026,Same,-10.00\n09/01/2026,Same,-10.00';
  const first = parseBankCsv(csv, { accountKey: 'wf-0811' });
  const second = parseBankCsv(csv, { accountKey: 'wf-0811' });
  assert.notEqual(first.rows[0].contentHash, first.rows[1].contentHash);
  assert.equal(first.rows[0].contentHash, second.rows[0].contentHash);
  assert.equal(first.rows[1].contentHash, second.rows[1].contentHash);
});

test('file hash normalizes CRLF', () => {
  assert.equal(bankFileHash('a\r\nb\r\n'), bankFileHash('a\nb\n'));
});
