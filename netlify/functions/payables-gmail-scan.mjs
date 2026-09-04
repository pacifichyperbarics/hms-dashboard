import { authenticatedDevice, audit, rest, supabaseConfig } from './lib/hms-device-session.mjs';
import { decryptSecret, encryptionConfigured } from './lib/hms-oauth-crypto.mjs';
import {
  decodeBase64Url,
  getGmailAttachment,
  getGmailMessage,
  getGmailProfile,
  googleOAuthConfig,
  listHistoryMessageIds,
  listInitialMessageIds,
  parseGmailMessage,
  refreshGoogleAccessToken,
} from './lib/payables-gmail-client.mjs';
import {
  classifyEmail,
  dateOrNull,
  dedupeKey,
  extractAmount,
  extractDueDate,
  extractInvoice,
  safeExtension,
  senderName,
  sha256,
} from './lib/payables-discovery-rules.mjs';
import { deletePrivateObject, uploadPrivateObject } from './lib/hms-private-storage.mjs';

const ACCOUNT = 'hms@healtho2.com';
const SOURCE_KEY = `gmail:${ACCOUNT}`;
const BUCKET = 'hms-finance-evidence';
const MAX_MESSAGES = 200;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const INITIAL_QUERY = 'newer_than:60d (invoice OR "amount due" OR "balance due" OR "payment due" OR "past due" OR renewal OR statement) -label:spam -label:trash';
const FALLBACK_QUERY = 'newer_than:30d (invoice OR "amount due" OR "balance due" OR "payment due" OR "past due" OR renewal OR statement) -label:spam -label:trash';

export const config = { schedule: '17 */4 * * *' };

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}
function nullable(value, max = 1000) {
  return clean(value, max) || null;
}
function isScheduled(context) {
  return Boolean(context?.scheduled);
}
function accountPath(account) {
  return account.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
}
function shouldRetainAttachment(attachment, classification) {
  const mime = clean(attachment?.mimeType, 160).toLowerCase();
  const filename = clean(attachment?.filename, 500);
  const size = Math.max(0, Number(attachment?.size) || 0);
  if (!ALLOWED_ATTACHMENT_MIME.has(mime) || !filename || size > MAX_ATTACHMENT_BYTES) return false;
  if (/application\/(pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/csv/i.test(mime)) return true;
  if (mime === 'text/plain') return /(invoice|statement|bill|renewal|payment|notice)/i.test(filename);
  if (mime.startsWith('image/')) return /(invoice|statement|bill|renewal|payment|notice|scan|photo)/i.test(filename) && classification.isCandidate;
  return false;
}

async function activeCredential(config) {
  const query = new URLSearchParams({
    select: '*',
    provider: 'eq.google',
    account_identifier: `eq.${ACCOUNT}`,
    status: 'eq.active',
    limit: '1',
  });
  return (await rest(config, `hms_finance_oauth_credentials?${query}`))?.[0] || null;
}

async function beginRun(config, deviceId, runType) {
  const rows = await rest(config, 'rpc/hms_finance_begin_ingestion_run', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      p_source_key: SOURCE_KEY,
      p_run_type: runType,
      p_device_id: deviceId,
      p_stale_minutes: 45,
      p_detail: { trigger: deviceId ? 'manual' : 'scheduled', account: ACCOUNT },
    },
  });
  return rows?.[0] || null;
}

async function finishRun(config, runId, status, stats, cursorAfter, errorText = null, detail = {}) {
  const rows = await rest(config, 'rpc/hms_finance_finish_ingestion_run', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      p_run_id: runId,
      p_status: status,
      p_cursor_after: cursorAfter,
      p_scanned_count: stats.scanned,
      p_candidate_count: stats.candidates,
      p_duplicate_count: stats.duplicates,
      p_ignored_count: stats.ignored,
      p_error_count: stats.errors,
      p_error_text: errorText,
      p_detail: detail,
    },
  });
  return rows?.[0] || null;
}

async function existingMessageIds(config) {
  const query = new URLSearchParams({
    select: 'source_id',
    source_type: 'eq.gmail',
    source_account: `eq.${ACCOUNT}`,
    limit: '10000',
  });
  const rows = await rest(config, `hms_finance_intake_items?${query}`);
  return new Set(rows.map((row) => row.source_id).filter(Boolean));
}

async function registerCandidate(config, sourceId, runId, candidate, evidence, deviceId, paymentChange) {
  const rows = await rest(config, 'rpc/hms_finance_register_discovery_candidate', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      p_source_id: sourceId,
      p_run_id: runId,
      p_candidate: candidate,
      p_evidence: evidence,
      p_device_id: deviceId,
      p_payment_change: Boolean(paymentChange),
    },
  });
  return rows?.[0] || null;
}

async function downloadAttachment(accessToken, parsed, attachment) {
  if (attachment.inlineData) return decodeBase64Url(attachment.inlineData);
  if (!attachment.attachmentId) return Buffer.alloc(0);
  const result = await getGmailAttachment(accessToken, parsed.messageId, attachment.attachmentId);
  return decodeBase64Url(result?.data);
}

async function retainAttachments(config, accessToken, parsed, classification) {
  const stored = [];
  const evidence = [];
  for (const attachment of parsed.attachments || []) {
    if (!shouldRetainAttachment(attachment, classification)) continue;
    const bytes = await downloadAttachment(accessToken, parsed, attachment);
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) continue;
    const hash = sha256(bytes);
    const mime = clean(attachment.mimeType, 160).toLowerCase();
    const filename = clean(attachment.filename, 500) || `attachment${safeExtension('', mime)}`;
    const yearMonth = (parsed.receivedAt || new Date().toISOString()).slice(0, 7).replace('-', '/');
    const path = `gmail/${accountPath(ACCOUNT)}/${yearMonth}/${parsed.messageId}/${hash}${safeExtension(filename, mime)}`;
    let created = false;
    try {
      await uploadPrivateObject(config, BUCKET, path, bytes, mime, { upsert: false });
      created = true;
    } catch (error) {
      if (error?.status !== 409) throw error;
    }
    stored.push({ path, created });
    evidence.push({
      evidence_type: 'attachment',
      external_id: attachment.attachmentId || `${parsed.messageId}:${attachment.partId || hash}`,
      external_parent_id: parsed.messageId,
      original_filename: filename,
      mime_type: mime,
      byte_size: bytes.length,
      sha256: hash,
      storage_bucket: BUCKET,
      storage_path: path,
      metadata: { gmail_part_id: attachment.partId || null, private: true },
    });
  }
  return { stored, evidence };
}

async function removeCreatedObjects(config, stored) {
  for (const item of stored || []) {
    if (item.created) await deletePrivateObject(config, BUCKET, item.path).catch(() => undefined);
  }
}

async function processMessage({ config, accessToken, sourceId, runId, messageId, existingIds, deviceId }) {
  if (existingIds.has(messageId)) return { result: 'duplicate' };
  const message = await getGmailMessage(accessToken, messageId);
  const parsed = parseGmailMessage(message);
  const classification = classifyEmail(parsed.subject, parsed.bodyText || parsed.snippet, parsed.attachments);
  if (!classification.isCandidate) return { result: 'ignored', reason: classification.reason };

  const payee = senderName(parsed.sender) || '';
  const text = `${parsed.subject}\n${parsed.bodyText || parsed.snippet}`;
  const amountCents = extractAmount(text);
  const invoice = extractInvoice(text) || '';
  const dueDate = extractDueDate(text);
  const contentHash = sha256(`${ACCOUNT}|${parsed.messageId}|${parsed.subject}|${parsed.bodyText}`);
  const instructionFingerprint = classification.paymentInstructions
    ? sha256((parsed.bodyText || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 4000))
    : null;
  const retained = await retainAttachments(config, accessToken, parsed, classification);
  try {
    const candidate = {
      source_type: 'gmail',
      source_account: ACCOUNT,
      source_id: parsed.messageId,
      source_url: `https://mail.google.com/mail/u/0/#all/${parsed.threadId || parsed.messageId}`,
      received_at: parsed.receivedAt || new Date().toISOString(),
      source_received_at: parsed.receivedAt,
      sender: parsed.sender || null,
      subject: parsed.subject || null,
      attachment_name: retained.evidence.length === 1 ? retained.evidence[0].original_filename : null,
      raw_text: parsed.bodyText || parsed.snippet || null,
      content_hash: contentHash,
      dedupe_key: dedupeKey(payee, invoice, amountCents, dueDate),
      candidate_payee: payee || null,
      candidate_invoice_number: invoice || null,
      candidate_invoice_date: null,
      candidate_due_date: dateOrNull(dueDate),
      candidate_amount_cents: amountCents,
      candidate_currency: 'USD',
      extraction_confidence: classification.confidence,
      review_note: null,
      discovery_reason: classification.reason,
      contains_payment_instructions: classification.paymentInstructions,
      payment_instruction_fingerprint: instructionFingerprint,
      metadata: {
        thread_id: parsed.threadId || null,
        internet_message_id: parsed.internetMessageId || null,
        labels: parsed.labelIds,
        attachment_count: parsed.attachments.length,
        retained_attachment_count: retained.evidence.length,
        review_only: true,
        gmail_history_id: parsed.historyId || null,
      },
    };
    const evidence = [{
      evidence_type: 'email',
      external_id: parsed.messageId,
      external_parent_id: parsed.threadId || null,
      source_url: candidate.source_url,
      excerpt: (parsed.bodyText || parsed.snippet || '').slice(0, 4000) || null,
      metadata: {
        sender: parsed.sender,
        recipient: parsed.recipient,
        subject: parsed.subject,
        received_at: parsed.receivedAt,
        internet_message_id: parsed.internetMessageId || null,
      },
    }, ...retained.evidence];
    const result = await registerCandidate(config, sourceId, runId, candidate, evidence, deviceId, classification.paymentChange);
    if (result?.already_existing) {
      await removeCreatedObjects(config, retained.stored);
      return { result: 'duplicate', intakeId: result.intake_id };
    }
    existingIds.add(messageId);
    return {
      result: result?.duplicate_of_id ? 'duplicate' : 'candidate',
      intakeId: result?.intake_id || null,
      paymentChange: classification.paymentChange,
    };
  } catch (error) {
    await removeCreatedObjects(config, retained.stored);
    throw error;
  }
}

async function runScan(config, deviceId, trigger) {
  const setup = googleOAuthConfig();
  if (!setup.configured || !encryptionConfigured()) {
    return { ok: true, skipped: true, reason: 'google_oauth_setup_required' };
  }

  const credential = await activeCredential(config);
  if (!credential) return { ok: true, skipped: true, reason: 'gmail_not_connected' };
  const sourceQuery = new URLSearchParams({ select: '*', source_key: `eq.${SOURCE_KEY}`, limit: '1' });
  const source = (await rest(config, `hms_finance_ingestion_sources?${sourceQuery}`))?.[0];
  if (!source || source.status !== 'connected') return { ok: true, skipped: true, reason: 'gmail_source_not_connected' };

  const runType = source.last_sync_cursor ? 'incremental' : 'initial';
  const claim = await beginRun(config, deviceId, deviceId ? 'manual' : runType);
  if (!claim?.claimed) return { ok: true, skipped: true, reason: claim?.reason || 'scan_not_claimed', runId: claim?.run_id || null };

  const stats = { scanned: 0, candidates: 0, duplicates: 0, ignored: 0, errors: 0 };
  let cursorAfter = null;
  let historyFallback = false;
  try {
    const refreshToken = decryptSecret(
      credential.refresh_token_ciphertext,
      credential.refresh_token_iv,
      `oauth-credential:google:${ACCOUNT}`,
    );
    const token = await refreshGoogleAccessToken(refreshToken);
    const profile = await getGmailProfile(token.access_token);
    const profileAccount = clean(profile.emailAddress, 300).toLowerCase();
    if (profileAccount !== ACCOUNT) throw new Error(`gmail_account_mismatch:${profileAccount || 'unknown'}`);

    let messageIds;
    if (claim.cursor_before) {
      try {
        const history = await listHistoryMessageIds(token.access_token, claim.cursor_before, { maxMessages: MAX_MESSAGES });
        messageIds = history.messageIds;
        cursorAfter = history.latestHistoryId || clean(profile.historyId, 500) || claim.cursor_before;
      } catch (error) {
        if (error?.status !== 404) throw error;
        historyFallback = true;
        messageIds = await listInitialMessageIds(token.access_token, { query: FALLBACK_QUERY, maxMessages: MAX_MESSAGES });
        cursorAfter = clean(profile.historyId, 500) || claim.cursor_before;
      }
    } else {
      messageIds = await listInitialMessageIds(token.access_token, { query: INITIAL_QUERY, maxMessages: MAX_MESSAGES });
      cursorAfter = clean(profile.historyId, 500) || null;
    }

    const existingIds = await existingMessageIds(config);
    for (const messageId of messageIds) {
      stats.scanned += 1;
      try {
        const outcome = await processMessage({
          config,
          accessToken: token.access_token,
          sourceId: claim.source_id,
          runId: claim.run_id,
          messageId,
          existingIds,
          deviceId,
        });
        if (outcome.result === 'candidate') stats.candidates += 1;
        else if (outcome.result === 'duplicate') stats.duplicates += 1;
        else stats.ignored += 1;
      } catch (error) {
        stats.errors += 1;
        console.error('Gmail message discovery failed', messageId, error instanceof Error ? error.message : String(error));
      }
    }

    const finalStatus = stats.errors ? 'partial' : 'success';
    await finishRun(
      config,
      claim.run_id,
      finalStatus,
      stats,
      cursorAfter,
      stats.errors ? `${stats.errors} message(s) could not be processed` : null,
      { trigger, historyFallback, profileHistoryId: clean(profile.historyId, 500) || null, query: claim.cursor_before ? null : INITIAL_QUERY },
    );
    await rest(config, `hms_finance_oauth_credentials?id=eq.${encodeURIComponent(credential.id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        last_refresh_at: new Date().toISOString(),
        last_error: stats.errors ? `${stats.errors} message(s) failed` : null,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
    });
    await audit(config, 'gmail_payables_scan_completed', 'ingestion_run', claim.run_id, deviceId, null, stats, {
      trigger,
      finalStatus,
      cursorAdvanced: finalStatus === 'success' && Boolean(cursorAfter),
      authorizes: false,
      movesMoney: false,
    });
    return { ok: true, skipped: false, runId: claim.run_id, status: finalStatus, stats, historyFallback, cursorAdvanced: finalStatus === 'success' && Boolean(cursorAfter) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    stats.errors = Math.max(stats.errors, 1);
    await finishRun(config, claim.run_id, 'failed', stats, null, detail, { trigger, fatal: true }).catch(() => undefined);
    const invalidCredential = /invalid_grant|unauthorized|revoked/i.test(detail);
    await rest(config, `hms_finance_oauth_credentials?id=eq.${encodeURIComponent(credential.id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        status: invalidCredential ? 'error' : 'active',
        last_error: detail.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
    }).catch(() => undefined);
    if (invalidCredential) {
      await rest(config, `hms_finance_ingestion_sources?id=eq.${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { status: 'error', last_error: detail.slice(0, 500), updated_at: new Date().toISOString() },
      }).catch(() => undefined);
    }
    await audit(config, 'gmail_payables_scan_failed', 'ingestion_run', claim.run_id, deviceId, null, null, { trigger, detail: detail.slice(0, 500), invalidCredential }).catch(() => undefined);
    throw error;
  }
}

export default async (req, context) => {
  const scheduled = isScheduled(context);
  if (!scheduled && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const config = supabaseConfig();
  if (!config) return scheduled ? new Response(null, { status: 204 }) : json({ error: 'supabase_not_configured' }, 503);

  let deviceId = null;
  if (!scheduled) {
    const device = await authenticatedDevice(req, { requireAdmin: true });
    if (!device) return json({ error: 'admin_device_required' }, 403);
    deviceId = device.id;
  }

  try {
    const result = await runScan(config, deviceId, scheduled ? 'scheduled' : 'manual');
    return scheduled ? new Response(null, { status: result.ok ? 204 : 500 }) : json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('payables-gmail-scan failed', detail);
    return scheduled ? new Response(null, { status: 500 }) : json({ error: 'gmail_scan_failed', detail: detail.slice(0, 500) }, 500);
  }
};
