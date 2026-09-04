import { createHash } from 'node:crypto';

export function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

export function nullable(value, max = 1000) {
  return clean(value, max) || null;
}

export function dateOrNull(value) {
  const text = clean(value, 80);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function timestampOrNull(value) {
  const text = clean(value, 100);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string'
    ? value.replaceAll(',', '').replace('$', '').replace(/[()]/g, '')
    : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function dedupeKey(payee, invoice, amountCents, dueDate) {
  const normalizedPayee = clean(payee, 300).toLowerCase();
  const normalizedInvoice = clean(invoice, 160).toLowerCase();
  if (normalizedPayee && normalizedInvoice) return `${normalizedPayee}|${normalizedInvoice}`;
  if (normalizedPayee && amountCents !== null) return `${normalizedPayee}|${amountCents}|${dueDate || ''}`;
  return null;
}

export function extractAmount(text) {
  const source = clean(text, 20000);
  const patterns = [
    /(?:amount|balance|total)\s+due\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /invoice\s+total\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /current\s+amount\s+due\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /due\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return cents(match[1]);
  }
  return null;
}

export function extractInvoice(text) {
  const source = clean(text, 20000);
  const match = source.match(/(?:invoice|inv\.?|bill)\s*(?:number|no\.?|#)?\s*[:\-#]?\s*([a-z0-9][a-z0-9._\/-]{2,40})/i);
  return match ? clean(match[1], 160) : null;
}

export function extractDueDate(text) {
  const source = clean(text, 20000);
  const match = source.match(/(?:due\s+date|payment\s+due|due)\s*[:\-]?\s*((?:\d{1,2}[\/-]){2}\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i);
  return match ? dateOrNull(match[1]) : null;
}

export function senderName(sender) {
  const value = clean(sender, 500);
  const display = value.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  if (display && !display.includes('@')) return clean(display, 300);
  const email = value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!email) return null;
  const domain = email[1].split('.')[0].replace(/[-_]+/g, ' ');
  return clean(domain.replace(/\b\w/g, (letter) => letter.toUpperCase()), 300);
}

export function classifyEmail(subject, body, attachments = []) {
  const text = `${clean(subject, 1000)}\n${clean(body, 20000)}`.toLowerCase();
  const filenames = attachments.map((item) => clean(item?.filename, 300).toLowerCase()).join(' ');
  const strong = /(invoice|amount due|balance due|payment due|past due|statement available|renewal notice|autopay|automatic payment|bill enclosed|remittance|payment required)/i.test(text);
  const invoiceAttachment = /(invoice|statement|bill|renewal|notice).*(\.pdf|\.xlsx?|\.csv|\.png|\.jpe?g)$/i.test(filenames);
  const receiptOnly = /(payment received|payment confirmation|thank you for your payment|paid in full|receipt)/i.test(text)
    && !/(amount due|balance due|past due|payment required)/i.test(text);
  const paymentInstructions = /(routing number|account number|wire instructions|ach instructions|remit to|bank details|payment instructions)/i.test(text);
  const paymentChange = /(new|changed|change|updated|different|revised).{0,60}(bank|routing|account|wire|ach|payment instructions|remit)/i.test(text)
    || /(bank|routing|wire|ach|payment instructions).{0,60}(new|changed|updated|revised)/i.test(text);
  return {
    isCandidate: (strong || invoiceAttachment) && !receiptOnly,
    reason: receiptOnly
      ? 'payment_receipt_not_payable'
      : strong
        ? 'payable_language_detected'
        : invoiceAttachment
          ? 'invoice_attachment_detected'
          : 'no_payable_signal',
    confidence: strong && invoiceAttachment ? 0.94 : strong ? 0.84 : invoiceAttachment ? 0.72 : 0.2,
    paymentInstructions,
    paymentChange,
  };
}

export function safeExtension(filename, mime) {
  const match = clean(filename, 500).toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  if (match) return `.${match[1]}`;
  return ({
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  })[clean(mime, 160).toLowerCase()] || '';
}

export function stripHtml(html) {
  return clean(html, 50000)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20000);
}
