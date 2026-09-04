import { createHash, randomUUID } from 'node:crypto';
import { audit, rest, supabaseConfig } from './hms-device-session.mjs';
import { accessTokenForConnection, gmailConfigurationStatus } from './payables-gmail-auth.mjs';
import { classifyPayablesEmail, defaultGmailQuery } from './payables-gmail-classifier.mjs';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_BODY_CHARS = 20000;
const REVIEWABLE_STATUSES = new Set(['needs_review', 'ready', 'duplicate', 'held']);

function clean(value, max = 2000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'unknown_error');
}

function sanitizeEvidenceText(value) {
  return clean(value, 4000)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX')
    .replace(/((?:routing|account|acct|bank account|card)\s*(?:number|no\.?|#|ending)?\s*[:#]?\s*)(?:[Xx* -]*)(\d{4,19})/gi, (_match, prefix, digits) => `${prefix}XXXX${String(digits).slice(-4)}`)
    .replace(/\b(\d{13,19})\b/g, (_match, digits) => `XXXX${String(digits).slice(-4)}`);
}

function contentHash(message) {
  return createHash('sha256')
    .update(`${message.from}\n${message.subject}\n${message.snippet}\n${message.text}`)
    .digest('hex');
}

async function gmailJson(accessToken, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${GMAIL_API}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('gmail_api_timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(body?.error?.message || response.statusText, 500);
    const error = new Error(`gmail_api_failed:${response.status}:${detail}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function decodeBase64Url(value) {
  if (!value) return '';
  try { return Buffer.from(String(value), 'base64url').toString('utf8'); }
  catch { return ''; }
}

function stripHtml(html) {
  return clean(String(html || '')
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
    .replace(/\n{3,}/g, '\n\n'), MAX_BODY_CHARS);
}

function collectParts(part, result) {
  if (!part) return;
  const mimeType = String(part.mimeType || '').toLowerCase();
  const data = decodeBase64Url(part.body?.data);
  if (data && mimeType === 'text/plain') result.plain.push(data);
  if (data && mimeType === 'text/html') result.html.push(data);
  if (part.filename || part.body?.attachmentId) {
    result.attachments.push({
      filename: clean(part.filename || 'attachment', 500),
      mimeType: mimeType || null,
      size: Number(part.body?.size || 0),
      attachmentId: part.body?.attachmentId || null,
    });
  }
  for (const child of part.parts || []) collectParts(child, result);
}

function headerValue(message, name) {
  const target = String(name).toLowerCase();
  return message.payload?.headers?.find((header) => String(header.name || '').toLowerCase() === target)?.value || '';
}

function normalizeMessage(raw) {
  const parts = { plain: [], html: [], attachments: [] };
  collectParts(raw.payload, parts);
  const text = clean(parts.plain.join('\n') || stripHtml(parts.html.join('\n')) || raw.snippet, MAX_BODY_CHARS);
  return {
    id: String(raw.id || ''),
    threadId: String(raw.threadId || ''),
    historyId: String(raw.historyId || ''),
    receivedAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : null,
    from: clean(headerValue(raw, 'from'), 500),
    subject: clean(headerValue(raw, 'subject'), 1000),
    snippet: clean(raw.snippet, 3000),
    text,
    labels: Array.isArray(raw.labelIds) ? raw.labelIds : [],
    attachments: parts.attachments.slice(0, 40),
  };
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { status: 'fulfilled', value: await mapper(values[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length || 1) }, worker));
  return results;
}

async function listMessageIds(accessToken, connection, maxMessages) {
  const ids = new Set();
  const cursorStart = connection.history_cursor || null;
  let mode = cursorStart ? 'history' : 'query';

  if (cursorStart) {
    try {
      let pageToken = '';
      for (let page = 0; page < 4 && ids.size < maxMessages; page += 1) {
        const params = new URLSearchParams({
          startHistoryId: String(cursorStart),
          historyTypes: 'messageAdded',
          maxResults: String(Math.min(100, maxMessages - ids.size)),
        });
        if (pageToken) params.set('pageToken', pageToken);
        const pageResult = await gmailJson(accessToken, `/history?${params}`);
        for (const history of pageResult.history || []) {
          for (const added of history.messagesAdded || []) {
            if (added?.message?.id) ids.add(String(added.message.id));
          }
        }
        pageToken = pageResult.nextPageToken || '';
        if (!pageToken) break;
      }
    } catch (error) {
      if (![400, 404].includes(error?.status)) throw error;
      ids.clear();
      mode = 'query_fallback';
    }
  }

  if (!cursorStart || mode === 'query_fallback') {
    const query = clean(connection.config?.initial_query, 2000) || defaultGmailQuery();
    let pageToken = '';
    for (let page = 0; page < 3 && ids.size < maxMessages; page += 1) {
      const params = new URLSearchParams({
        q: query,
        maxResults: String(Math.min(100, maxMessages - ids.size)),
      });
      if (pageToken) params.set('pageToken', pageToken);
      const pageResult = await gmailJson(accessToken, `/messages?${params}`);
      for (const item of pageResult.messages || []) if (item?.id) ids.add(String(item.id));
      pageToken = pageResult.nextPageToken || '';
      if (!pageToken) break;
    }
  }

  const profile = await gmailJson(accessToken, '/profile');
  return {
    ids: [...ids].slice(0, maxMessages),
    mode,
    query: clean(connection.config?.initial_query, 2000) || defaultGmailQuery(),
    cursorStart,
    cursorEnd: String(profile.historyId || cursorStart || ''),
  };
}

function evidenceClassification(decision) {
  const map = {
    automatic_obligation: 'autopay_notice',
    payment_evidence: 'payment_confirmation',
    likely_personal: 'non_hms',
    not_payable: 'other',
    promotion: 'promotion',
    past_due: 'past_due',
    bill: 'invoice',
  };
  return map[decision.classification] || 'possible_bill';
}

function financialState(decision) {
  if (decision.disposition === 'evidence') return 'already_paid';
  if (decision.disposition === 'ignore') return 'not_payable';
  if (decision.flags?.some((flag) => flag.startsWith('possible_'))) return 'entity_hold';
  if (decision.classification === 'automatic_obligation') return 'scheduled_auto';
  if (decision.disposition === 'inbox') return 'payment_needed';
  return 'review';
}

async function referenceMaps(config) {
  const [rules, accounts, clinics, vendors, aliases] = await Promise.all([
    rest(config, 'hms_finance_email_rules?select=*&active=eq.true&order=priority.asc,rule_key.asc'),
    rest(config, 'hms_finance_accounts?select=id,code,name&active=eq.true'),
    rest(config, 'ops_clinics?select=id,name,slug&archived=eq.false'),
    rest(config, 'hms_finance_vendors?select=id,display_name,status'),
    rest(config, 'hms_finance_vendor_aliases?select=vendor_id,alias_text'),
  ]);
  const accountByCode = new Map(accounts.map((row) => [String(row.code), row.id]));
  const clinicByName = new Map(clinics.map((row) => [String(row.name).toLowerCase(), row.id]));
  const vendorByName = new Map(vendors.map((row) => [String(row.display_name).toLowerCase(), row.id]));
  for (const alias of aliases) {
    const vendor = vendors.find((row) => row.id === alias.vendor_id);
    if (vendor) vendorByName.set(String(alias.alias_text).toLowerCase(), vendor.id);
  }
  return { rules, accountByCode, clinicByName, vendorByName };
}

function matchesPattern(pattern, text) {
  if (!pattern) return true;
  try { return new RegExp(pattern, 'i').test(String(text || '')); }
  catch { return false; }
}

function applyStoredRule(message, baseDecision, rules) {
  const body = `${message.snippet || ''}\n${message.text || ''}`;
  const sender = `${message.from || ''}\n${baseDecision.senderAddress || ''}`;
  const rule = (rules || []).find((candidate) =>
    matchesPattern(candidate.sender_pattern, sender)
    && matchesPattern(candidate.subject_pattern, message.subject)
    && matchesPattern(candidate.body_pattern, body));
  if (!rule) return { decision: baseDecision, rule: null };

  const decision = {
    ...baseDecision,
    flags: [...(baseDecision.flags || [])],
  };
  if (rule.action === 'skip_paid') {
    decision.disposition = 'evidence';
    decision.classification = 'payment_evidence';
  } else if (rule.action === 'skip_income' || rule.action === 'skip_promotion') {
    decision.disposition = 'ignore';
    decision.classification = rule.classification === 'promotion' ? 'promotion' : 'not_payable';
  } else {
    decision.disposition = 'inbox';
    decision.classification = rule.classification === 'past_due'
      ? 'past_due'
      : rule.classification === 'autopay_notice' || rule.payment_mode_hint === 'automatic'
        ? 'automatic_obligation'
        : 'bill';
  }
  if (rule.action === 'hold_entity' && !decision.flags.includes('possible_rule_entity')) {
    decision.flags.push('possible_rule_entity');
  }
  if (rule.suggested_vendor_name) decision.vendor = rule.suggested_vendor_name;
  if (rule.suggested_account_code) decision.accountCode = rule.suggested_account_code;
  if (rule.suggested_clinic_name) decision.clinicName = rule.suggested_clinic_name;
  if (rule.action === 'review' && !decision.reviewNote.includes('Review')) {
    decision.reviewNote = `${decision.reviewNote} Review the source before moving this item to Payables.`.trim();
  }
  return { decision, rule };
}

function candidateFromMessage(message, maps) {
  const classified = classifyPayablesEmail(message);
  const applied = applyStoredRule(message, classified, maps.rules);
  const decision = applied.decision;
  const state = financialState(decision);
  const classification = evidenceClassification(decision);
  const hash = contentHash(message);
  const sourceUrl = `https://mail.google.com/mail/#all/${message.id}`;
  const vendorId = maps.vendorByName.get(String(decision.vendor || '').toLowerCase()) || null;
  const accountId = maps.accountByCode.get(decision.accountCode) || null;
  const clinicId = decision.clinicName ? maps.clinicByName.get(decision.clinicName.toLowerCase()) || null : null;
  const evidenceSummary = sanitizeEvidenceText(`${message.subject}\n${message.snippet || message.text}`.replace(/\s+/g, ' '));
  return {
    decision,
    financialState: state,
    classification,
    payee: decision.vendor || 'Unidentified vendor',
    amountCents: decision.amountCents,
    invoiceNumber: decision.invoiceNumber,
    invoiceDate: decision.invoiceDate,
    dueDate: decision.dueDate,
    accountId,
    clinicId,
    vendorId,
    contentHash: hash,
    sourceUrl,
    evidenceSummary,
    ruleId: applied.rule?.id || null,
    ruleKey: applied.rule?.rule_key || null,
    dedupeKey: decision.invoiceNumber
      ? `${String(decision.vendor || '').toLowerCase()}|${String(decision.invoiceNumber).toLowerCase()}`
      : `${String(decision.vendor || '').toLowerCase()}|${decision.amountCents ?? ''}|${decision.dueDate ?? ''}`,
  };
}

async function findExistingIntake(config, sourceAccount, messageId) {
  const params = new URLSearchParams({
    select: '*',
    source_type: 'eq.gmail',
    source_account: `eq.${sourceAccount}`,
    source_id: `eq.${messageId}`,
    limit: '1',
  });
  const rows = await rest(config, `hms_finance_intake_items?${params}`);
  return rows?.[0] || null;
}

async function findDuplicate(config, candidate, sourceAccount, messageId) {
  if (candidate.invoiceNumber && candidate.payee) {
    const params = new URLSearchParams({
      select: 'id,source_account,source_id',
      candidate_invoice_number: `eq.${candidate.invoiceNumber}`,
      candidate_payee: `ilike.${candidate.payee}`,
      review_status: 'not.eq.rejected',
      limit: '5',
    });
    const rows = await rest(config, `hms_finance_intake_items?${params}`);
    const other = rows.find((row) => row.source_account !== sourceAccount || row.source_id !== messageId);
    if (other?.id) return other.id;
  }
  if (candidate.contentHash) {
    const rows = await rest(config, `hms_finance_intake_items?select=id,source_account,source_id&content_hash=eq.${candidate.contentHash}&review_status=not.eq.rejected&limit=5`);
    const other = rows.find((row) => row.source_account !== sourceAccount || row.source_id !== messageId);
    if (other?.id) return other.id;
  }
  return null;
}

async function saveEvidence(config, connection, run, message, candidate) {
  const rows = await rest(config, 'hms_finance_email_evidence?on_conflict=source_account,message_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      connection_id: connection.id,
      scan_run_id: run.id,
      source_account: connection.source_account,
      message_id: message.id,
      thread_id: message.threadId || null,
      received_at: message.receivedAt,
      sender: message.from || null,
      sender_domain: candidate.decision.senderAddress?.split('@')[1] || null,
      subject: message.subject || null,
      classification: candidate.classification,
      financial_state: candidate.financialState,
      candidate_payee: candidate.payee,
      candidate_invoice_number: candidate.invoiceNumber,
      candidate_invoice_date: candidate.invoiceDate,
      candidate_due_date: candidate.dueDate,
      candidate_amount_cents: candidate.amountCents,
      candidate_currency: 'USD',
      candidate_clinic_id: candidate.clinicId,
      candidate_account_id: candidate.accountId,
      source_url: candidate.sourceUrl,
      attachments: message.attachments,
      evidence_summary: candidate.evidenceSummary,
      content_hash: candidate.contentHash,
      rule_id: candidate.ruleId,
      status: 'active',
      metadata: {
        history_id: message.historyId || null,
        disposition: candidate.decision.disposition,
        classifier: 'deterministic-v1',
        rule_key: candidate.ruleKey,
        confidence: candidate.decision.confidence,
        urgency: candidate.decision.urgency,
        flags: candidate.decision.flags || [],
        body_stored: false,
      },
      updated_at: new Date().toISOString(),
    },
  });
  return rows?.[0] || null;
}

async function saveIntake(config, connection, run, message, candidate, evidence) {
  if (!['payment_needed', 'scheduled_auto', 'entity_hold', 'review'].includes(candidate.financialState)) {
    return { item: null, created: false, updated: false, duplicate: false };
  }

  const existing = await findExistingIntake(config, connection.source_account, message.id);
  if (existing && !REVIEWABLE_STATUSES.has(existing.review_status)) {
    return { item: existing, created: false, updated: false, duplicate: existing.review_status === 'duplicate' };
  }
  const duplicateOf = existing?.duplicate_of_id || await findDuplicate(config, candidate, connection.source_account, message.id);
  const reviewStatus = duplicateOf ? 'duplicate' : candidate.financialState === 'entity_hold' ? 'held' : 'needs_review';
  const row = {
    source_type: 'gmail',
    source_account: connection.source_account,
    source_id: message.id,
    source_url: candidate.sourceUrl,
    received_at: message.receivedAt || new Date().toISOString(),
    sender: message.from || null,
    subject: message.subject || null,
    attachment_name: message.attachments.map((item) => item.filename).filter(Boolean).join(', ').slice(0, 500) || null,
    raw_text: candidate.evidenceSummary || null,
    content_hash: candidate.contentHash,
    dedupe_key: candidate.dedupeKey,
    candidate_payee: candidate.payee,
    candidate_invoice_number: candidate.invoiceNumber,
    candidate_invoice_date: candidate.invoiceDate,
    candidate_due_date: candidate.dueDate,
    candidate_amount_cents: candidate.amountCents,
    candidate_currency: 'USD',
    candidate_vendor_id: candidate.vendorId,
    candidate_clinic_id: candidate.clinicId,
    candidate_account_id: candidate.accountId,
    extraction_confidence: candidate.decision.confidence,
    review_status: reviewStatus,
    duplicate_of_id: duplicateOf,
    review_note: candidate.decision.reviewNote || null,
    metadata: {
      email_evidence_id: evidence?.id || null,
      thread_id: message.threadId || null,
      classification: candidate.classification,
      financial_state: candidate.financialState,
      payment_mode_hint: candidate.financialState === 'scheduled_auto' ? 'automatic' : 'manual',
      urgency: candidate.decision.urgency,
      flags: candidate.decision.flags || [],
      rule_key: candidate.ruleKey,
      scan_run_id: run.id,
      attachment_count: message.attachments.length,
      discovered_automatically: true,
      auto_authorization_applied: false,
      payment_initiated: false,
    },
    updated_at: new Date().toISOString(),
  };

  let item;
  let created = false;
  let updated = false;
  if (existing) {
    const rows = await rest(config, `hms_finance_intake_items?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: row,
    });
    item = rows?.[0] || existing;
    updated = true;
  } else {
    try {
      const rows = await rest(config, 'hms_finance_intake_items', {
        method: 'POST',
        prefer: 'return=representation',
        body: row,
      });
      item = rows?.[0] || null;
      created = Boolean(item);
    } catch (error) {
      if (!String(errorMessage(error)).includes('23505')) throw error;
      item = await findExistingIntake(config, connection.source_account, message.id);
    }
  }

  if (evidence?.id && item?.id) {
    await rest(config, `hms_finance_email_evidence?id=eq.${encodeURIComponent(evidence.id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { intake_item_id: item.id, updated_at: new Date().toISOString() },
    });
  }

  return { item, created, updated, duplicate: item?.review_status === 'duplicate' };
}

async function processMessage(config, maps, connection, run, accessToken, messageId) {
  const raw = await gmailJson(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
  const message = normalizeMessage(raw);
  const candidate = candidateFromMessage(message, maps);
  const evidence = await saveEvidence(config, connection, run, message, candidate);
  const intake = await saveIntake(config, connection, run, message, candidate, evidence);
  return {
    messageId,
    financialState: candidate.financialState,
    classification: candidate.classification,
    intakeCreated: intake.created,
    intakeUpdated: intake.updated,
    duplicate: intake.duplicate,
  };
}

export async function scanGmailConnection(connection, {
  triggerType = 'manual',
  maxMessages = null,
  deviceId = null,
} = {}) {
  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');
  if (!connection?.id || connection.status !== 'active') throw new Error('gmail_connection_not_active');
  const lockToken = randomUUID();
  const claimed = await rest(config, 'rpc/hms_finance_claim_gmail_scan', {
    method: 'POST',
    body: { p_connection_id: connection.id, p_lock_token: lockToken, p_ttl_seconds: 240 },
  });
  if (claimed !== true) {
    return {
      skipped: true,
      reason: 'scan_already_running',
      sourceAccount: connection.source_account,
      messagesFound: 0,
      messagesScanned: 0,
      candidatesCreated: 0,
    };
  }

  try {
    const effectiveMax = Math.max(1, Math.min(100, Number(maxMessages || connection.config?.max_messages_per_scan || 75)));
    const runRows = await rest(config, 'hms_finance_discovery_runs', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        connection_id: connection.id,
        connector_type: 'gmail',
        source_account: connection.source_account,
        trigger_type: triggerType,
        query_text: clean(connection.config?.initial_query, 2000) || defaultGmailQuery(),
        status: 'running',
        cursor_start: connection.history_cursor || null,
        metadata: { max_messages: effectiveMax, device_id: deviceId },
      },
    });
    const run = runRows?.[0];
    if (!run?.id) throw new Error('gmail_discovery_run_create_failed');

    try {
      const accessToken = await accessTokenForConnection(config, connection);
      const maps = await referenceMaps(config);
      const listed = await listMessageIds(accessToken, connection, effectiveMax);
      const outcomes = await mapLimit(listed.ids, 5, (id) => processMessage(config, maps, connection, run, accessToken, id));
      const successes = outcomes.filter((outcome) => outcome.status === 'fulfilled').map((outcome) => outcome.value);
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      const completedAt = new Date().toISOString();
      const stats = {
        messagesFound: listed.ids.length,
        messagesScanned: successes.length,
        candidatesCreated: successes.filter((item) => item.intakeCreated).length,
        candidatesUpdated: successes.filter((item) => item.intakeUpdated).length,
        duplicatesFound: successes.filter((item) => item.duplicate).length,
        receiptsSkipped: successes.filter((item) => item.financialState === 'already_paid').length,
        irrelevantSkipped: successes.filter((item) => item.financialState === 'not_payable').length,
        entityHolds: successes.filter((item) => item.financialState === 'entity_hold').length,
        errorCount: failures.length,
        mode: listed.mode,
        cursorStart: listed.cursorStart,
        cursorEnd: listed.cursorEnd,
      };

      await Promise.all([
        rest(config, `hms_finance_discovery_runs?id=eq.${encodeURIComponent(run.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: {
            status: failures.length ? 'partial' : 'success',
            cursor_end: listed.cursorEnd || null,
            messages_found: stats.messagesFound,
            messages_scanned: stats.messagesScanned,
            candidates_created: stats.candidatesCreated,
            candidates_updated: stats.candidatesUpdated,
            duplicates_found: stats.duplicatesFound,
            receipts_skipped: stats.receiptsSkipped,
            irrelevant_skipped: stats.irrelevantSkipped,
            entity_holds: stats.entityHolds,
            error_count: stats.errorCount,
            error_text: failures.length ? clean(failures.map((item) => errorMessage(item.reason)).join('; '), 2000) : null,
            completed_at: completedAt,
            metadata: { ...stats, query: listed.query, device_id: deviceId },
          },
        }),
        rest(config, `hms_finance_source_connections?id=eq.${encodeURIComponent(connection.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: {
            status: 'active',
            history_cursor: listed.cursorEnd || connection.history_cursor,
            last_scanned_at: completedAt,
            last_success_at: failures.length ? connection.last_success_at : completedAt,
            last_error_at: failures.length ? completedAt : null,
            error_text: failures.length ? `${failures.length} email(s) could not be processed.` : null,
            updated_at: completedAt,
          },
        }),
        rest(config, 'hms_sync_state?on_conflict=connector,source_account', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: {
            connector: 'gmail_payables',
            source_account: connection.source_account,
            cursor: listed.cursorEnd || null,
            last_attempt_at: completedAt,
            last_success_at: failures.length ? null : completedAt,
            status: failures.length ? 'partial' : 'success',
            error_text: failures.length ? `${failures.length} email(s) failed.` : null,
            stats,
          },
        }),
      ]);

      await audit(config, 'gmail_payables_scan_completed', 'source_connection', connection.id, deviceId, null, stats, {
        sourceAccount: connection.source_account,
        triggerType,
      });
      return { runId: run.id, sourceAccount: connection.source_account, ...stats };
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = clean(errorMessage(error), 2000);
      await Promise.allSettled([
        rest(config, `hms_finance_discovery_runs?id=eq.${encodeURIComponent(run.id)}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: { status: 'failed', error_count: 1, error_text: message, completed_at: failedAt },
        }),
        rest(config, `hms_finance_source_connections?id=eq.${encodeURIComponent(connection.id)}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: { status: 'error', last_error_at: failedAt, error_text: message, updated_at: failedAt },
        }),
      ]);
      await audit(config, 'gmail_payables_scan_failed', 'source_connection', connection.id, deviceId, null, null, {
        sourceAccount: connection.source_account,
        triggerType,
        error: message.slice(0, 500),
      });
      throw error;
    }
  } finally {
    await rest(config, 'rpc/hms_finance_release_gmail_scan', {
      method: 'POST',
      body: { p_connection_id: connection.id, p_lock_token: lockToken },
    }).catch(() => null);
  }
}

export async function gmailDiscoveryStatus() {
  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');
  const [connections, runs, evidence] = await Promise.all([
    rest(config, 'hms_finance_source_connections?select=id,source_account,display_name,status,history_cursor,last_scanned_at,last_success_at,last_error_at,error_text,config,metadata,created_at,updated_at&connector_type=eq.gmail&order=updated_at.desc'),
    rest(config, 'hms_finance_discovery_runs?select=id,connection_id,source_account,trigger_type,status,messages_found,messages_scanned,candidates_created,candidates_updated,duplicates_found,receipts_skipped,irrelevant_skipped,entity_holds,error_count,error_text,started_at,completed_at,metadata&connector_type=eq.gmail&order=started_at.desc&limit=10'),
    rest(config, 'hms_finance_email_evidence?select=financial_state,status&status=eq.active'),
  ]);
  const evidenceCounts = evidence.reduce((result, item) => {
    result.total += 1;
    result[item.financial_state] = (result[item.financial_state] || 0) + 1;
    return result;
  }, { total: 0 });
  return {
    configuration: gmailConfigurationStatus(),
    connections,
    runs,
    evidenceCounts,
  };
}

export async function activeGmailConnections() {
  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');
  return rest(config, 'hms_finance_source_connections?select=*&connector_type=eq.gmail&status=eq.active&order=updated_at.asc');
}

export async function scanAllActiveConnections(options = {}) {
  const connections = await activeGmailConnections();
  const results = [];
  for (const connection of connections) {
    try { results.push({ ok: true, ...(await scanGmailConnection(connection, options)) }); }
    catch (error) { results.push({ ok: false, sourceAccount: connection.source_account, error: clean(errorMessage(error), 500) }); }
  }
  return results;
}

export async function setGmailConnectionStatus(connectionId, status, deviceId) {
  const config = supabaseConfig();
  if (!config) throw new Error('supabase_not_configured');
  if (!['active', 'paused', 'disconnected'].includes(status)) throw new Error('invalid_connection_status');
  const rows = await rest(config, `hms_finance_source_connections?select=*&id=eq.${encodeURIComponent(connectionId)}&connector_type=eq.gmail&limit=1`);
  const before = rows?.[0];
  if (!before) throw new Error('gmail_connection_not_found');
  if (status === 'disconnected') {
    await rest(config, `hms_finance_connector_credentials?connection_id=eq.${encodeURIComponent(connectionId)}`, {
      method: 'DELETE', prefer: 'return=minimal',
    });
  }
  const updatedRows = await rest(config, `hms_finance_source_connections?id=eq.${encodeURIComponent(connectionId)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status, error_text: null, updated_at: new Date().toISOString() },
  });
  const after = updatedRows?.[0] || null;
  await audit(config, `gmail_payables_connection_${status}`, 'source_connection', connectionId, deviceId, before, after);
  return after;
}
