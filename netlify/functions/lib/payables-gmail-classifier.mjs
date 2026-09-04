const MONEY_PATTERNS = [
  /(?:total\s+debited(?:\s+this\s+invoice)?|total\s+balance|total\s+due|amount\s+due|balance\s+due|payment\s+of|your\s+payment\s+of|total\s+in\s+usd)\s*:?\s*\$\s*([0-9][0-9,]*(?:\.\d{2})?)/i,
  /(?:total\s+debited(?:\s+this\s+invoice)?|total\s+balance|total\s+due|amount\s+due|balance\s+due|invoice\s+total|total\s+in\s+usd)\s*:?\s*([0-9][0-9,]*\.\d{2})/i,
  /\$\s*([0-9][0-9,]*(?:\.\d{2})?)\s+(?:is\s+)?(?:due|past\s+due|will\s+be\s+(?:automatically\s+)?(?:charged|debited))/i,
  /(?:charged|debited)\s+(?:for\s+)?\$\s*([0-9][0-9,]*(?:\.\d{2})?)/i,
];

const DATE_TEXT = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2},?\\s+\\d{4})';
const DUE_PATTERNS = [
  new RegExp(`(?:payment\\s+due(?:\\s+date)?|due\\s+date|payment\\s+due)\\s*:?\\s*(${DATE_TEXT})`, 'i'),
  new RegExp(`(?:will\\s+be\\s+(?:automatically\\s+)?(?:charged|debited)|will\\s+be\\s+processed|autopay[^.]{0,80}processed)\\s+(?:from[^.]{0,80}\\s+)?on\\s+(${DATE_TEXT})`, 'i'),
];
const INVOICE_DATE_PATTERNS = [
  new RegExp(`(?:invoice\\s+date|statement\\s+date|advice\\s+of\\s+debit\\s+date)\\s*:?\\s*(${DATE_TEXT})`, 'i'),
];
const INVOICE_PATTERNS = [
  /\[([A-Z0-9][A-Z0-9._/-]{3,})\]/i,
  /invoice\s*\(#?([A-Z0-9][A-Z0-9._/-]{2,})\)/i,
  /(?:invoice|statement|advice\s+of\s+debit)\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i,
];
const KNOWN_CLINICS = [
  ['Chula Vista', [/826\s+starboard/i, /\bchula\s+vista\b/i]],
  ['Oceanside', [/1411\s+(?:n|north)\s+coast/i, /\boceanside\b/i]],
  ['Laguna', [/31655\s+coast/i, /\blaguna(?:\s+beach)?\b/i]],
  ['Madras', [/83\s+sw\s+k/i, /\bmadras\b/i]],
  ['Monterey', [/70\s+garden\s+court/i, /\bmonterey\b/i]],
  ['Salinas', [/\bsalinas\b/i]],
  ['Riverside', [/\briverside\b/i]],
  ['Hurst', [/\bhurst\b/i]],
];

function clean(value, max = 12000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function normalizeWhitespace(value) {
  return clean(value).replace(/\s+/g, ' ').trim();
}
function toCents(value) {
  const number = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}
function isoDate(value) {
  const input = clean(value, 80).replace(/,$/, '');
  if (!input) return null;
  const direct = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const numeric = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const year = numeric[3].length === 2 ? Number(`20${numeric[3]}`) : Number(numeric[3]);
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}
function addDays(dateValue, days) {
  if (!dateValue || !Number.isFinite(days)) return null;
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function extractAmount(text) {
  for (const pattern of MONEY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return toCents(match[1]);
  }
  return null;
}
function extractDate(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match ? isoDate(match[1]) : null;
    if (value) return value;
  }
  return null;
}
function extractInvoiceNumber(subject, text) {
  const combined = `${subject}\n${text}`;
  const blocked = new Set(['invoice', 'statement', 'number', 'date', 'account', 'customer', 'available']);
  for (const pattern of INVOICE_PATTERNS) {
    const match = combined.match(pattern);
    const candidate = clean(match?.[1], 160);
    if (candidate && !blocked.has(candidate.toLowerCase())) return candidate;
  }
  return null;
}
function senderAddress(from) {
  const angle = clean(from, 500).match(/<([^>]+)>/);
  if (angle) return angle[1].toLowerCase();
  const plain = clean(from, 500).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain ? plain[0].toLowerCase() : '';
}
function vendorName(from, subject, text) {
  const address = senderAddress(from);
  const haystack = `${from} ${subject} ${text}`.toLowerCase();
  const rules = [
    [/matheson|mathesongas/, 'Matheson'], [/\badp\b|adp\.com/, 'ADP'], [/paychex/, 'Paychex'],
    [/google workspace|payments-noreply@google\.com/, 'Google Workspace'], [/netlify/, 'Netlify'],
    [/comcast/, 'Comcast Business'], [/wyyerd/, 'Wyyerd'], [/sdg&e|sdge/, 'SDG&E'],
    [/tenant planet|appfolio/, 'Tenant Planet'], [/clickpay/, 'ClickPay'],
    [/smart self storage|sdss1\.com/, 'Smart Self Storage'], [/stripe/, 'Stripe'],
    [/stacey|independent marketing consultant/, 'Independent Marketing Consultant'],
  ];
  for (const [pattern, name] of rules) if (pattern.test(haystack)) return name;
  const display = clean(from, 300).replace(/<[^>]+>/g, '').replace(/^"|"$/g, '').trim();
  if (display && !display.includes('@')) return display;
  if (address) return address.split('@')[1]?.split('.')[0]?.replace(/[-_]/g, ' ') || address;
  return 'Unidentified vendor';
}
function accountCode(vendor, subject, text) {
  const haystack = `${vendor} ${subject} ${text}`.toLowerCase();
  if (/matheson|medical gas|oxygen cylinder/.test(haystack)) return '5030-MEDGAS';
  if (/\badp\b|paychex|payroll|retirement services/.test(haystack)) return '5000-PAYROLL';
  if (/sdg&e|sdge|electric bill|utility bill|energy bill/.test(haystack)) return '5090-UTIL';
  if (/comcast|wyyerd|\bcox\b|internet|telecom/.test(haystack)) return '5070-TELECOM';
  if (/google workspace|netlify|openai|lovable|tailscale|software|subscription/.test(haystack)) return '5080-SOFTWARE';
  if (/marketing consultant|marketing services|stacey/.test(haystack)) return '5050-MKTG';
  if (/tenant planet|clickpay|\brent\b|lease payment/.test(haystack)) return '5020-RENT';
  if (/insurance|premium/.test(haystack)) return '5060-INS';
  return '5190-OTHER';
}
function clinicName(subject, text, accountCodeValue) {
  const combined = `${subject}\n${text}`;
  const serviceAddress = combined.match(/(?:service|property|location)\s+address[^\n:]*[:\s]+([^\n]{5,120})/i)?.[1] || '';
  const strongText = `${subject}\n${serviceAddress}`;
  for (const [name, patterns] of KNOWN_CLINICS) if (patterns.some((pattern) => pattern.test(strongText))) return name;
  for (const [name, patterns] of KNOWN_CLINICS.slice(0, 5)) if (patterns[0]?.test(combined)) return name;
  if (['5000-PAYROLL', '5080-SOFTWARE'].includes(accountCodeValue)) return 'Corporate / HMS';
  return null;
}
function paymentChangeRisk(text) {
  return /(new|changed|updated|different).{0,50}(bank|routing|account|payment destination|wire instructions)|(?:bank|routing|account).{0,50}(new|changed|updated)/i.test(text);
}
function entityFlags(text) {
  const flags = [];
  if (/juventas health/i.test(text)) flags.push('possible_juventas_entity');
  if (/health ai management/i.test(text)) flags.push('possible_health_ai_entity');
  if (/bonita management/i.test(text)) flags.push('possible_bonita_entity');
  return flags;
}
function disposition(subject, text, labels = []) {
  const combined = `${subject}\n${text}`.toLowerCase();
  const labelText = labels.join(' ').toLowerCase();
  if (labelText.includes('category_promotions')) return { disposition: 'ignore', classification: 'promotion' };
  if (/\bpayout\b|collections report|operational meeting|claim|authorization approval|new contact lead|newsletter|project is still here|pricing update/.test(combined)) {
    return { disposition: 'ignore', classification: 'not_payable' };
  }
  if (/\bhome bill\b/.test(combined) && !KNOWN_CLINICS.some(([, patterns]) => patterns.some((pattern) => pattern.test(combined)))) {
    return { disposition: 'ignore', classification: 'likely_personal' };
  }
  const paidEvidence = /payment received|successfully paid|successfully charged|thank you for your payment|payment confirmation|paid on\b|rent is now paid|being processed/.test(combined);
  const futureAuto = /will be (?:automatically )?(?:charged|debited)|autopay.{0,100}(?:will|scheduled|processed)|automatically charged for any amount due|no payment required/.test(combined);
  const pastDue = /past due|avoid disconnection|payment needed|disconnect(?:ion)? notice/.test(combined);
  const bill = /\binvoice\b|\bbill\b|\bstatement\b|amount due|balance due|advice of debit|payment reminder/.test(combined);
  if (futureAuto && !/already (?:charged|debited)|paid on\b/.test(combined)) return { disposition: 'inbox', classification: 'automatic_obligation' };
  if (pastDue) return { disposition: 'inbox', classification: 'past_due' };
  if (paidEvidence) return { disposition: 'evidence', classification: 'payment_evidence' };
  if (bill) return { disposition: 'inbox', classification: 'bill' };
  return { disposition: 'ignore', classification: 'not_payable' };
}

export function classifyPayablesEmail(message) {
  const subject = normalizeWhitespace(message.subject);
  const body = normalizeWhitespace(`${message.snippet || ''}\n${message.text || ''}`);
  const from = normalizeWhitespace(message.from);
  const combined = `${subject}\n${body}`;
  const decision = disposition(subject, body, message.labels || []);
  const vendor = vendorName(from, subject, body);
  const account = accountCode(vendor, subject, body);
  const clinic = clinicName(subject, body, account);
  const amountCents = extractAmount(combined);
  const invoiceDate = extractDate(combined, INVOICE_DATE_PATTERNS);
  let dueDate = extractDate(combined, DUE_PATTERNS);
  if (!dueDate && invoiceDate) {
    const terms = combined.match(/net\s+(\d{1,3})(?:\s+days?)?/i);
    if (terms) dueDate = addDays(invoiceDate, Number(terms[1]));
  }
  const invoiceNumber = extractInvoiceNumber(subject, combined);
  const flags = entityFlags(combined);
  if (paymentChangeRisk(combined)) flags.push('payment_destination_change');
  if (amountCents == null && decision.disposition === 'inbox') flags.push('amount_missing');
  if (!clinic && decision.disposition === 'inbox') flags.push('clinic_unassigned');

  let confidence = 0.45;
  if (decision.classification === 'past_due') confidence = 0.9;
  else if (decision.classification === 'automatic_obligation') confidence = 0.86;
  else if (decision.classification === 'payment_evidence') confidence = 0.88;
  else if (decision.classification === 'bill') confidence = 0.72;
  if (amountCents != null) confidence += 0.05;
  if (invoiceNumber) confidence += 0.03;
  if (flags.some((flag) => flag.startsWith('possible_'))) confidence -= 0.12;
  confidence = Math.max(0.1, Math.min(0.99, confidence));

  const notes = [];
  if (decision.classification === 'past_due') notes.push('Past-due or shutoff language detected. Review promptly.');
  if (decision.classification === 'automatic_obligation') notes.push('Appears scheduled for automatic charge or debit; include in cash planning and verify against the bank.');
  if (flags.includes('payment_destination_change')) notes.push('Possible changed payment instructions. Automatic authorization must remain blocked.');
  if (flags.some((flag) => flag.startsWith('possible_'))) notes.push('Possible non-HMS legal entity. Confirm ownership before coding or payment.');
  if (amountCents == null && decision.disposition === 'inbox') notes.push('Amount was not available in the email text; open the source or attachment.');
  if (!clinic && decision.disposition === 'inbox') notes.push('Clinic/location requires review.');

  return {
    ...decision,
    vendor,
    senderAddress: senderAddress(from),
    amountCents,
    invoiceNumber,
    invoiceDate,
    dueDate,
    accountCode: account,
    clinicName: clinic,
    confidence,
    urgency: decision.classification === 'past_due' ? 'high' : 'normal',
    flags,
    reviewNote: notes.join(' '),
  };
}

export function defaultGmailQuery(afterEpoch = null) {
  const terms = '{invoice bill "amount due" "past due" statement "payment confirmation" "payment reminder" "will be debited" "will be charged" receipt autopay "payment needed"}';
  const after = afterEpoch ? ` after:${Math.max(0, Math.floor(afterEpoch))}` : ' newer_than:60d';
  return `in:inbox -category:promotions ${terms}${after}`;
}
