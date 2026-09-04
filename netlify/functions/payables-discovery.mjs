import { createHash } from 'node:crypto';
import { authenticatedDevice, audit, rest, supabaseConfig } from './lib/hms-device-session.mjs';

const BUCKET = 'hms-finance-evidence';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function clean(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function nullable(value, max = 1000) { return clean(value, max) || null; }
function dateOrNull(value) {
  const text = clean(value, 30);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
function timestampOrNull(value) {
  const text = clean(value, 80);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replaceAll(',', '').replace('$', '') : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function safeExtension(filename, mime) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
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
  })[mime] || '';
}
function encodeObjectPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function dedupeKey(payee, invoice, amountCents, dueDate) {
  if (payee && invoice) return `${payee.toLowerCase()}|${invoice.toLowerCase()}`;
  if (payee && amountCents !== null) return `${payee.toLowerCase()}|${amountCents}|${dueDate || ''}`;
  return null;
}
function extractAmount(text) {
  const patterns = [
    /(?:amount|balance|total)\s+due\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /invoice\s+total\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /due\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cents(match[1]);
  }
  return null;
}
function extractInvoice(text) {
  const match = text.match(/(?:invoice|inv\.?|bill)\s*(?:number|no\.?|#)?\s*[:\-#]?\s*([a-z0-9][a-z0-9._\/-]{2,40})/i);
  return match ? clean(match[1], 160) : null;
}
function extractDueDate(text) {
  const match = text.match(/(?:due\s+date|payment\s+due|due)\s*[:\-]?\s*((?:\d{1,2}[\/-]){2}\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i);
  return match ? dateOrNull(match[1]) : null;
}
function senderName(sender) {
  const display = sender.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  if (display && !display.includes('@')) return clean(display, 300);
  const email = sender.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!email) return null;
  const domain = email[1].split('.')[0].replace(/[-_]+/g, ' ');
  return domain.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 300);
}
function classifyEmail(subject, body, attachments) {
  const text = `${subject}\n${body}`.toLowerCase();
  const filenames = attachments.map((item) => clean(item.filename, 300).toLowerCase()).join(' ');
  const strong = /(invoice|amount due|balance due|payment due|past due|statement available|renewal notice|autopay|automatic payment|bill enclosed|remittance)/i.test(text);
  const invoiceAttachment = /(invoice|statement|bill|renewal).*(\.pdf|\.xlsx?|\.csv)$/i.test(filenames);
  const receiptOnly = /(payment received|payment confirmation|thank you for your payment|paid in full|receipt)/i.test(text) && !/(amount due|balance due|past due)/i.test(text);
  const paymentInstructions = /(routing number|account number|wire instructions|ach instructions|remit to|bank details|payment instructions)/i.test(text);
  const paymentChange = /(new|changed|change|updated|different|revised).{0,50}(bank|routing|account|wire|ach|payment instructions|remit)/i.test(text) || /(bank|routing|wire|ach|payment instructions).{0,50}(new|changed|updated|revised)/i.test(text);
  return {
    isCandidate: (strong || invoiceAttachment) && !receiptOnly,
    reason: receiptOnly ? 'payment_receipt_not_payable' : strong ? 'payable_language_detected' : invoiceAttachment ? 'invoice_attachment_detected' : 'no_payable_signal',
    confidence: strong && invoiceAttachment ? 0.94 : strong ? 0.84 : invoiceAttachment ? 0.72 : 0.2,
    paymentInstructions,
    paymentChange,
  };
}

async function storageRequest(config, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/storage/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...(options.headers || {}) },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`storage_request_failed:${response.status}:${detail.slice(0, 300)}`);
    }
    return response.status === 204 ? null : response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('storage_request_timeout');
    throw error;
  } finally { clearTimeout(timer); }
}
async function uploadObject(config, path, bytes, mime) {
  return storageRequest(config, `object/${BUCKET}/${encodeObjectPath(path)}`, {
    method: 'POST', headers: { 'content-type': mime, 'x-upsert': 'false' }, body: bytes,
  });
}
async function deleteObject(config, path) { return storageRequest(config, `object/${BUCKET}/${encodeObjectPath(path)}`, { method: 'DELETE' }); }
async function signedObjectUrl(config, path, expiresIn = 600) {
  const result = await storageRequest(config, `object/sign/${BUCKET}/${encodeObjectPath(path)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn }),
  });
  const relative = result?.signedURL || result?.signedUrl || null;
  if (!relative) throw new Error('signed_url_missing');
  return relative.startsWith('http') ? relative : `${config.url}/storage/v1${relative}`;
}
async function sourceByKey(config, sourceKey) {
  const query = new URLSearchParams({ select: '*', source_key: `eq.${sourceKey}`, limit: '1' });
  const source = (await rest(config, `hms_finance_ingestion_sources?${query}`))?.[0];
  if (!source) throw new Error(`ingestion_source_missing:${sourceKey}`);
  return source;
}
async function upsertGmailSource(config, account, deviceId) {
  const rows = await rest(config, 'hms_finance_ingestion_sources?on_conflict=source_key', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      source_key: `gmail:${account}`, source_type: 'gmail', display_name: `Gmail — ${account}`,
      account_identifier: account, status: 'connected',
      config: { mode: 'incremental', review_only: true, connection_mode: 'agent_or_webhook' },
      metadata: { registered_by_device: deviceId, creates_authorization: false, moves_money: false },
      updated_at: new Date().toISOString(),
    },
  });
  if (!rows?.[0]) throw new Error('gmail_source_upsert_failed');
  return rows[0];
}
async function startRun(config, sourceId, runType, deviceId, detail = {}) {
  const rows = await rest(config, 'hms_finance_ingestion_runs', {
    method: 'POST', prefer: 'return=representation',
    body: { source_id: sourceId, run_type: runType, status: 'running', requested_by_device_id: deviceId, detail },
  });
  if (!rows?.[0]) throw new Error('ingestion_run_create_failed');
  return rows[0];
}
async function finishRun(config, runId, status, patch = {}) {
  await rest(config, `hms_finance_ingestion_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { status, completed_at: new Date().toISOString(), ...patch },
  });
}
async function registerCandidate(config, sourceId, runId, candidate, evidence, deviceId, paymentChange) {
  const rows = await rest(config, 'rpc/hms_finance_register_discovery_candidate', {
    method: 'POST', prefer: 'return=representation',
    body: { p_source_id: sourceId, p_run_id: runId, p_candidate: candidate, p_evidence: evidence, p_device_id: deviceId, p_payment_change: Boolean(paymentChange) },
  });
  return rows?.[0] || null;
}
async function status(config) {
  const [sources, runs, evidence] = await Promise.all([
    rest(config, 'hms_finance_ingestion_sources?select=id,source_key,source_type,display_name,account_identifier,status,last_sync_at,last_success_at,last_error,config,metadata,updated_at&order=display_name.asc'),
    rest(config, 'hms_finance_ingestion_runs?select=id,source_id,run_type,status,scanned_count,candidate_count,duplicate_count,ignored_count,error_count,started_at,completed_at,detail&order=started_at.desc&limit=25'),
    rest(config, 'hms_finance_intake_evidence?select=id&limit=10000'),
  ]);
  return { sources, runs, evidenceCount: evidence.length };
}

async function handleUpload(req, device) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'file_required' }, 400);
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return json({ error: 'file_size_not_allowed', maxBytes: MAX_FILE_BYTES }, 400);
  const mime = clean(file.type || 'application/octet-stream', 160).toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return json({ error: 'file_type_not_allowed', mimeType: mime }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  const existingQuery = new URLSearchParams({ select: 'id,intake_id,original_filename,created_at', sha256: `eq.${hash}`, limit: '1' });
  const existing = await rest(device.config, `hms_finance_intake_evidence?${existingQuery}`);
  if (existing?.[0]) return json({ ok: true, duplicate: true, intakeId: existing[0].intake_id, evidence: existing[0] });

  const source = await sourceByKey(device.config, 'upload:hms-payables');
  const run = await startRun(device.config, source.id, 'upload', device.id, { filename: clean(file.name, 300), size: file.size, mime });
  const now = new Date();
  const path = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${hash}${safeExtension(file.name, mime)}`;
  let stored = false;
  try {
    await uploadObject(device.config, path, bytes, mime);
    stored = true;
    const payee = clean(form.get('payee'), 300);
    const amountCents = cents(form.get('amount'));
    const dueDate = dateOrNull(form.get('dueDate'));
    const invoice = clean(form.get('invoiceNumber'), 160);
    const note = clean(form.get('note'), 3000);
    const candidate = {
      source_type: 'upload', source_account: 'hms-payables', source_id: `sha256:${hash}`,
      received_at: new Date().toISOString(), source_received_at: timestampOrNull(form.get('sourceReceivedAt')),
      subject: file.name, attachment_name: file.name, raw_text: note || null, content_hash: hash,
      dedupe_key: dedupeKey(payee, invoice, amountCents, dueDate), candidate_payee: payee || null,
      candidate_invoice_number: invoice || null, candidate_invoice_date: dateOrNull(form.get('invoiceDate')),
      candidate_due_date: dueDate, candidate_amount_cents: amountCents, candidate_currency: 'USD',
      candidate_clinic_id: nullable(form.get('clinicId'), 80), candidate_account_id: nullable(form.get('accountId'), 80),
      extraction_confidence: payee && amountCents !== null ? 0.9 : 0.55, review_note: note || null,
      discovery_reason: 'invoice_or_bill_uploaded', contains_payment_instructions: false,
      metadata: { uploaded_by_device: device.id, original_filename: file.name, private_evidence: true },
    };
    const evidence = [{ evidence_type: 'upload', external_id: hash, original_filename: file.name, mime_type: mime, byte_size: file.size, sha256: hash, storage_bucket: BUCKET, storage_path: path, metadata: { private: true } }];
    const result = await registerCandidate(device.config, source.id, run.id, candidate, evidence, device.id, false);
    await finishRun(device.config, run.id, 'success', { scanned_count: 1, detail: { filename: file.name, intake_id: result?.intake_id || null } });
    return json({ ok: true, duplicate: Boolean(result?.already_existing || result?.duplicate_of_id), result }, result?.already_existing ? 200 : 201);
  } catch (error) {
    if (stored) await deleteObject(device.config, path).catch(() => undefined);
    await finishRun(device.config, run.id, 'failed', { error_count: 1, detail: { error: error instanceof Error ? error.message : 'upload_failed' } }).catch(() => undefined);
    throw error;
  }
}

async function handleEmail(body, device) {
  if (!device.isAdmin) return json({ error: 'admin_device_required' }, 403);
  const email = body.email && typeof body.email === 'object' ? body.email : {};
  const account = clean(email.account || 'hms@healtho2.com', 300).toLowerCase();
  const messageId = clean(email.messageId, 500);
  if (!messageId) return json({ error: 'message_id_required' }, 400);
  const source = await upsertGmailSource(device.config, account, device.id);
  const run = await startRun(device.config, source.id, clean(body.runType, 30) || 'manual', device.id, { message_id: messageId });
  try {
    const subject = clean(email.subject, 1000);
    const bodyText = clean(email.bodyText || email.snippet, 12000);
    const sender = clean(email.sender, 500);
    const attachments = Array.isArray(email.attachments) ? email.attachments.slice(0, 30) : [];
    const classification = classifyEmail(subject, bodyText, attachments);
    if (!classification.isCandidate && body.force !== true) {
      await finishRun(device.config, run.id, 'success', { scanned_count: 1, ignored_count: 1, detail: { message_id: messageId, reason: classification.reason } });
      return json({ ok: true, ignored: true, reason: classification.reason });
    }
    const payee = clean(email.payee, 300) || senderName(sender) || '';
    const amountCents = cents(email.amount) ?? extractAmount(`${subject}\n${bodyText}`);
    const invoice = clean(email.invoiceNumber, 160) || extractInvoice(`${subject}\n${bodyText}`) || '';
    const dueDate = dateOrNull(email.dueDate) || extractDueDate(`${subject}\n${bodyText}`);
    const contentHash = sha256(`${account}|${messageId}|${subject}|${bodyText}`);
    const instructionFingerprint = classification.paymentInstructions ? sha256(bodyText.toLowerCase().replace(/\s+/g, ' ').slice(0, 4000)) : null;
    const candidate = {
      source_type: 'gmail', source_account: account, source_id: messageId, source_url: nullable(email.sourceUrl, 1200),
      received_at: timestampOrNull(email.receivedAt) || new Date().toISOString(), source_received_at: timestampOrNull(email.receivedAt),
      sender: sender || null, subject: subject || null,
      attachment_name: attachments.length === 1 ? nullable(attachments[0]?.filename, 500) : null,
      raw_text: bodyText || null, content_hash: contentHash, dedupe_key: dedupeKey(payee, invoice, amountCents, dueDate),
      candidate_payee: payee || null, candidate_invoice_number: invoice || null, candidate_invoice_date: dateOrNull(email.invoiceDate),
      candidate_due_date: dueDate, candidate_amount_cents: amountCents, candidate_currency: 'USD',
      candidate_clinic_id: nullable(email.clinicId, 80), candidate_account_id: nullable(email.accountId, 80),
      extraction_confidence: classification.confidence, review_note: nullable(email.note, 2000),
      discovery_reason: classification.reason, contains_payment_instructions: classification.paymentInstructions,
      payment_instruction_fingerprint: instructionFingerprint,
      metadata: { thread_id: nullable(email.threadId, 500), history_id: nullable(email.historyId, 500), labels: Array.isArray(email.labels) ? email.labels.slice(0, 40) : [], attachment_count: attachments.length, review_only: true, imported_by_device: device.id },
    };
    const evidence = [{ evidence_type: 'email', external_id: messageId, external_parent_id: nullable(email.threadId, 500), source_url: nullable(email.sourceUrl, 1200), excerpt: bodyText.slice(0, 4000) || null, metadata: { sender, subject, received_at: timestampOrNull(email.receivedAt) } }];
    for (const attachment of attachments) {
      evidence.push({ evidence_type: 'attachment', external_id: nullable(attachment?.attachmentId, 500), external_parent_id: messageId, original_filename: nullable(attachment?.filename, 500), mime_type: nullable(attachment?.mimeType, 160), byte_size: Number.isFinite(Number(attachment?.size)) ? Math.max(0, Math.round(Number(attachment.size))) : null, source_url: nullable(attachment?.sourceUrl, 1200), metadata: { attachment_not_downloaded: true } });
    }
    const result = await registerCandidate(device.config, source.id, run.id, candidate, evidence, device.id, classification.paymentChange);
    await finishRun(device.config, run.id, 'success', { scanned_count: 1, cursor_after: nullable(email.historyId, 500), detail: { message_id: messageId, intake_id: result?.intake_id || null } });
    return json({ ok: true, ignored: false, classification, result }, result?.already_existing ? 200 : 201);
  } catch (error) {
    await finishRun(device.config, run.id, 'failed', { scanned_count: 1, error_count: 1, detail: { message_id: messageId, error: error instanceof Error ? error.message : 'email_import_failed' } }).catch(() => undefined);
    throw error;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);
  try {
    const device = await authenticatedDevice(req);
    if (!device) return json({ error: 'device_session_required' }, 401);
    const config = device.config || supabaseConfig();
    if (!config) return json({ error: 'supabase_not_configured' }, 503);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const intakeId = clean(url.searchParams.get('intakeId'), 80);
      if (intakeId) {
        const query = new URLSearchParams({ select: 'id,intake_id,evidence_type,external_id,original_filename,mime_type,byte_size,sha256,storage_bucket,storage_path,source_url,created_at', intake_id: `eq.${intakeId}`, order: 'created_at.asc' });
        return json({ ok: true, evidence: await rest(config, `hms_finance_intake_evidence?${query}`) });
      }
      return json({ ok: true, ...(await status(config)), device: { id: device.id, isAdmin: device.isAdmin } });
    }

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) return handleUpload(req, device);
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 60);
    if (action === 'register-email') return handleEmail(body, device);
    if (action === 'signed-evidence-url') {
      const evidenceId = clean(body.evidenceId, 80);
      if (!evidenceId) return json({ error: 'evidence_id_required' }, 400);
      const query = new URLSearchParams({ select: '*', id: `eq.${evidenceId}`, limit: '1' });
      const evidence = (await rest(config, `hms_finance_intake_evidence?${query}`))?.[0];
      if (!evidence) return json({ error: 'evidence_not_found' }, 404);
      if (evidence.storage_bucket && evidence.storage_path) return json({ ok: true, url: await signedObjectUrl(config, evidence.storage_path), expiresInSeconds: 600 });
      return json({ ok: true, url: evidence.source_url || null, expiresInSeconds: null });
    }
    if (action === 'pause-source' || action === 'resume-source') {
      if (!device.isAdmin) return json({ error: 'admin_device_required' }, 403);
      const sourceId = clean(body.sourceId, 80);
      if (!sourceId) return json({ error: 'source_id_required' }, 400);
      const beforeQuery = new URLSearchParams({ select: '*', id: `eq.${sourceId}`, limit: '1' });
      const before = (await rest(config, `hms_finance_ingestion_sources?${beforeQuery}`))?.[0];
      if (!before) return json({ error: 'source_not_found' }, 404);
      const rows = await rest(config, `hms_finance_ingestion_sources?id=eq.${encodeURIComponent(sourceId)}`, {
        method: 'PATCH', prefer: 'return=representation',
        body: { status: action === 'pause-source' ? 'paused' : 'connected', updated_at: new Date().toISOString() },
      });
      await audit(config, 'finance_discovery_source_updated', 'ingestion_source', sourceId, device.id, before, rows?.[0] || null);
      return json({ ok: true, source: rows?.[0] || null });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('payables-discovery failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'finance_discovery_error', detail: error instanceof Error ? error.message.slice(0, 300) : 'unknown' }, 500);
  }
};
