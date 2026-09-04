import { createHash } from 'node:crypto';

const DATE_HEADERS = ['transaction date', 'date', 'trans date'];
const POSTED_HEADERS = ['posting date', 'post date', 'posted date'];
const AMOUNT_HEADERS = ['amount', 'transaction amount', 'amount usd'];
const DEBIT_HEADERS = ['debit', 'withdrawal', 'withdrawals', 'charge'];
const CREDIT_HEADERS = ['credit', 'deposit', 'deposits'];
const DESCRIPTION_HEADERS = ['description', 'details', 'memo', 'name', 'transaction description'];
const REFERENCE_HEADERS = ['reference', 'reference number', 'check number', 'check or slip #', 'check or slip number', 'transaction id', 'trace number'];
const BALANCE_HEADERS = ['balance', 'running balance'];
const STATUS_HEADERS = ['status', 'transaction status'];
const TYPE_HEADERS = ['type', 'transaction type', 'details'];

function clean(value, max = 2000) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizedHeader(value) {
  return clean(value, 120).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function detectDelimiter(text) {
  const sample = clean(text, 12000).split(/\r?\n/).filter((line) => line.trim()).slice(0, 8).join('\n');
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestScore = -1;
  for (const delimiter of candidates) {
    let score = 0;
    let quoted = false;
    for (const char of sample) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) score += 1;
    }
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => clean(value))) rows.push(row);
  return { delimiter, rows };
}

function parseDate(value) {
  const text = clean(value, 80);
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    return validDate(year, Number(match[1]), Number(match[2]));
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return validDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function validDate(year, month, day) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMoney(value) {
  const original = clean(value, 120);
  if (!original) return null;
  const negative = /^\(.*\)$/.test(original) || /-$/.test(original);
  const normalized = original.replace(/[,$()\s]/g, '').replace(/-$/, '');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  let number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  if (negative) number = -Math.abs(number);
  return Math.round(number * 100);
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function firstIndex(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function rowValue(row, index) {
  return index >= 0 ? clean(row[index], 2000) : '';
}

function isLikelyHeader(row) {
  const headers = row.map(normalizedHeader);
  const matches = [...DATE_HEADERS, ...POSTED_HEADERS, ...AMOUNT_HEADERS, ...DEBIT_HEADERS, ...CREDIT_HEADERS, ...DESCRIPTION_HEADERS]
    .filter((name) => headers.includes(name)).length;
  return matches >= 2 || (matches >= 1 && !parseDate(row[0]));
}

function detectFormat(rows, fileName = '') {
  if (!rows.length) return { parserKey: 'empty', sourceSystem: 'generic_csv', hasHeader: false };
  const headers = rows[0].map(normalizedHeader);
  const name = clean(fileName, 500).toLowerCase();
  if (headers.includes('posting date') && headers.includes('details') && headers.includes('amount')) {
    return { parserKey: 'chase_csv', sourceSystem: 'chase_csv', hasHeader: true };
  }
  if (isLikelyHeader(rows[0])) {
    const isWells = name.includes('wells') || name.includes('wf') || headers.includes('check number');
    return { parserKey: isWells ? 'wells_fargo_csv' : 'generic_csv', sourceSystem: isWells ? 'wells_fargo_csv' : 'generic_csv', hasHeader: true };
  }
  if (rows[0].length >= 5 && parseDate(rows[0][0]) && parseMoney(rows[0][1]) !== null) {
    return { parserKey: 'wells_fargo_headerless', sourceSystem: 'wells_fargo_csv', hasHeader: false };
  }
  return { parserKey: 'generic_headerless', sourceSystem: 'generic_csv', hasHeader: false };
}

function classifyKind(amountCents, description, type = '') {
  const text = `${description} ${type}`.toLowerCase();
  if (/\btransfer\b|\bxfer\b|online transfer|mobile transfer|internal transfer/.test(text)) return 'transfer';
  if (amountCents > 0 && /refund|reversal|returned|chargeback|rebate|credit memo/.test(text)) return 'reversal';
  if (amountCents < 0 && /service fee|monthly fee|wire fee|overdraft fee|bank fee|finance charge/.test(text)) return 'fee';
  if (amountCents < 0) return 'outflow';
  if (amountCents > 0) return 'inflow';
  return 'unknown';
}

function normalizeDescription(value) {
  return clean(value, 1500).replace(/\s+/g, ' ').trim();
}

function makeSourceIdentity({ accountKey, date, amountCents, description, reference, balanceCents, occurrence }) {
  const base = [accountKey, date, amountCents, description.toLowerCase(), reference.toLowerCase(), balanceCents ?? '', occurrence].join('|');
  const digest = hash(base);
  return { sourceTransactionId: `csv:${digest.slice(0, 32)}`, contentHash: digest };
}

function headerMapping(headerRow) {
  const headers = headerRow.map(normalizedHeader);
  return {
    transactionDate: firstIndex(headers, DATE_HEADERS),
    postedDate: firstIndex(headers, POSTED_HEADERS),
    amount: firstIndex(headers, AMOUNT_HEADERS),
    debit: firstIndex(headers, DEBIT_HEADERS),
    credit: firstIndex(headers, CREDIT_HEADERS),
    description: firstIndex(headers, DESCRIPTION_HEADERS),
    reference: firstIndex(headers, REFERENCE_HEADERS),
    balance: firstIndex(headers, BALANCE_HEADERS),
    status: firstIndex(headers, STATUS_HEADERS),
    type: firstIndex(headers, TYPE_HEADERS),
  };
}

function parseMappedRow(row, mapping) {
  const transactionDate = parseDate(rowValue(row, mapping.transactionDate)) || parseDate(rowValue(row, mapping.postedDate));
  const postedDate = parseDate(rowValue(row, mapping.postedDate)) || transactionDate;
  let amountCents = parseMoney(rowValue(row, mapping.amount));
  if (amountCents === null && (mapping.debit >= 0 || mapping.credit >= 0)) {
    const debit = parseMoney(rowValue(row, mapping.debit));
    const credit = parseMoney(rowValue(row, mapping.credit));
    if (debit !== null && debit !== 0) amountCents = -Math.abs(debit);
    else if (credit !== null && credit !== 0) amountCents = Math.abs(credit);
  }
  return {
    transactionDate,
    postedDate,
    amountCents,
    description: normalizeDescription(rowValue(row, mapping.description)),
    reference: rowValue(row, mapping.reference),
    balanceCents: parseMoney(rowValue(row, mapping.balance)),
    statusText: rowValue(row, mapping.status),
    typeText: rowValue(row, mapping.type),
  };
}

function parseHeaderlessWellsFargo(row) {
  return {
    transactionDate: parseDate(row[0]),
    postedDate: parseDate(row[0]),
    amountCents: parseMoney(row[1]),
    description: normalizeDescription(row[4] || row[3] || ''),
    reference: clean(row[3], 500),
    balanceCents: null,
    statusText: '',
    typeText: clean(row[2], 120),
  };
}

export function parseBankCsv(text, { accountKey, accountType = 'checking', fileName = 'bank-export.csv' } = {}) {
  const csvText = String(text ?? '');
  if (!clean(accountKey, 160)) throw new Error('bank_account_key_required');
  if (!csvText.trim()) throw new Error('bank_csv_empty');
  if (Buffer.byteLength(csvText, 'utf8') > 5 * 1024 * 1024) throw new Error('bank_csv_too_large');

  const parsed = parseDelimited(csvText);
  if (!parsed.rows.length) throw new Error('bank_csv_no_rows');
  const format = detectFormat(parsed.rows, fileName);
  const mapping = format.hasHeader ? headerMapping(parsed.rows[0]) : null;
  const dataRows = format.hasHeader ? parsed.rows.slice(1) : parsed.rows;
  const fingerprintCounts = new Map();
  const rows = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const raw = dataRows[index];
    const rowNumber = index + (format.hasHeader ? 2 : 1);
    let values;
    if (format.parserKey === 'wells_fargo_headerless') values = parseHeaderlessWellsFargo(raw);
    else if (mapping) values = parseMappedRow(raw, mapping);
    else {
      values = {
        transactionDate: parseDate(raw[0]),
        postedDate: parseDate(raw[0]),
        amountCents: parseMoney(raw[1]),
        description: normalizeDescription(raw.slice(2).join(' ')),
        reference: '', balanceCents: null, statusText: '', typeText: '',
      };
    }

    const errors = [];
    let rowStatus = 'ready';
    if (/pending/i.test(values.statusText)) {
      rowStatus = 'ignored';
      errors.push('Pending transaction; import after it posts.');
    }
    if (!values.transactionDate) errors.push('Transaction date is missing or invalid.');
    if (values.amountCents === null || values.amountCents === 0) errors.push('Amount is missing or zero.');
    if (!values.description) errors.push('Description is missing.');
    if (rowStatus !== 'ignored' && errors.length) rowStatus = 'invalid';

    const baseFingerprint = [values.transactionDate || '', values.amountCents ?? '', values.description.toLowerCase(), values.reference.toLowerCase(), values.balanceCents ?? ''].join('|');
    const occurrence = (fingerprintCounts.get(baseFingerprint) || 0) + 1;
    fingerprintCounts.set(baseFingerprint, occurrence);
    const identity = makeSourceIdentity({
      accountKey: clean(accountKey, 160),
      date: values.transactionDate || '',
      amountCents: values.amountCents ?? '',
      description: values.description || `row-${rowNumber}`,
      reference: values.reference || '',
      balanceCents: values.balanceCents,
      occurrence,
    });
    const kind = classifyKind(values.amountCents || 0, values.description, values.typeText);

    rows.push({
      rowNumber,
      sourceTransactionId: identity.sourceTransactionId,
      transactionDate: values.transactionDate,
      postedDate: values.postedDate,
      amountCents: values.amountCents,
      description: values.description,
      reference: values.reference || null,
      balanceCents: values.balanceCents,
      contentHash: identity.contentHash,
      transactionKind: kind,
      rowStatus,
      error: errors.join(' ') || null,
      raw: Object.fromEntries(raw.map((value, column) => [`column_${column + 1}`, clean(value, 1000)])),
      metadata: { parserKey: format.parserKey, accountType, occurrence, sourceFileName: clean(fileName, 500) },
    });
  }

  const ready = rows.filter((row) => row.rowStatus === 'ready');
  const dates = ready.map((row) => row.transactionDate).filter(Boolean).sort();
  return {
    parserKey: format.parserKey,
    sourceSystem: format.sourceSystem,
    delimiter: parsed.delimiter === '\t' ? 'tab' : parsed.delimiter,
    hasHeader: format.hasHeader,
    rows,
    summary: {
      rowCount: rows.length,
      readyCount: ready.length,
      invalidCount: rows.filter((row) => row.rowStatus === 'invalid').length,
      ignoredCount: rows.filter((row) => row.rowStatus === 'ignored').length,
      totalOutflowCents: ready.filter((row) => row.amountCents < 0).reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      totalInflowCents: ready.filter((row) => row.amountCents > 0).reduce((sum, row) => sum + row.amountCents, 0),
      periodStart: dates[0] || null,
      periodEnd: dates.at(-1) || null,
    },
  };
}

export function bankFileHash(text) {
  return hash(String(text ?? '').replace(/\r\n/g, '\n'));
}
