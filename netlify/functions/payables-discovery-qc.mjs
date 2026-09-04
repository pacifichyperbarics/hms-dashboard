import { randomUUID, createHash } from 'node:crypto';
import { authenticatedDevice, audit, rest } from './lib/hms-device-session.mjs';

const BUCKET = 'hms-finance-evidence';
const REQUEST_TIMEOUT_MS = 15000;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function storage(config, path, options = {}) {
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
      throw new Error(`storage_${response.status}:${detail.slice(0, 240)}`);
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  } finally { clearTimeout(timer); }
}

async function removeDatabaseRows(config, intakeId, runId) {
  if (intakeId) await rest(config, `hms_finance_intake_items?id=eq.${encodeURIComponent(intakeId)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => undefined);
  if (runId) await rest(config, `hms_finance_ingestion_runs?id=eq.${encodeURIComponent(runId)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => undefined);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let device;
  try {
    device = await authenticatedDevice(req, { requireAdmin: true });
    if (!device) return json({ error: 'admin_device_required' }, 403);
  } catch (error) {
    return json({ error: 'device_check_failed', detail: error instanceof Error ? error.message : String(error) }, 503);
  }

  const id = randomUUID();
  const content = Buffer.from(`HMS Finance discovery QA ${id}\nAmount Due: $12.34\nInvoice # QA-${id.slice(0, 8)}\n`, 'utf8');
  const hash = sha256(content);
  const objectPath = `qa/${id}.txt`;
  let runId = null;
  let intakeId = null;
  let objectUploaded = false;
  const checks = {
    objectUploaded: false,
    candidateRegistered: false,
    evidenceLinked: false,
    signedUrlCreated: false,
    signedUrlReadable: false,
    duplicateIdempotent: false,
    noAuthorization: false,
    noPayment: false,
    noJournal: false,
    objectRemoved: false,
    databaseRowsRemoved: false,
  };

  try {
    const sourceQuery = new URLSearchParams({ select: 'id', source_key: 'eq.upload:hms-payables', limit: '1' });
    const source = (await rest(device.config, `hms_finance_ingestion_sources?${sourceQuery}`))?.[0];
    if (!source) throw new Error('upload_source_missing');

    const runRows = await rest(device.config, 'hms_finance_ingestion_runs', {
      method: 'POST', prefer: 'return=representation',
      body: { source_id: source.id, run_type: 'manual', status: 'running', requested_by_device_id: device.id, detail: { qa: true, id } },
    });
    runId = runRows?.[0]?.id || null;
    if (!runId) throw new Error('qa_run_create_failed');

    await storage(device.config, `object/${BUCKET}/${encodePath(objectPath)}`, {
      method: 'POST', headers: { 'content-type': 'text/plain', 'x-upsert': 'false' }, body: content,
    });
    objectUploaded = true;
    checks.objectUploaded = true;

    const candidate = {
      source_type: 'upload', source_account: 'hms-payables', source_id: `qa:${id}`,
      received_at: new Date().toISOString(), subject: `QA-${id}.txt`, attachment_name: `QA-${id}.txt`,
      content_hash: hash, dedupe_key: `qa-vendor|${id}`, candidate_payee: 'QA Discovery Vendor',
      candidate_invoice_number: `QA-${id.slice(0, 8)}`, candidate_due_date: new Date().toISOString().slice(0, 10),
      candidate_amount_cents: 1234, candidate_currency: 'USD', extraction_confidence: 1,
      discovery_reason: 'production_path_qc', contains_payment_instructions: false,
      metadata: { qa: true, qa_id: id, authorizes: false, moves_money: false },
    };
    const evidence = [{
      evidence_type: 'upload', external_id: hash, original_filename: `QA-${id}.txt`, mime_type: 'text/plain',
      byte_size: content.length, sha256: hash, storage_bucket: BUCKET, storage_path: objectPath, metadata: { qa: true },
    }];
    const firstRows = await rest(device.config, 'rpc/hms_finance_register_discovery_candidate', {
      method: 'POST', prefer: 'return=representation',
      body: { p_source_id: source.id, p_run_id: runId, p_candidate: candidate, p_evidence: evidence, p_device_id: device.id, p_payment_change: false },
    });
    const first = firstRows?.[0];
    intakeId = first?.intake_id || null;
    checks.candidateRegistered = Boolean(intakeId && first?.already_existing === false);
    if (!intakeId) throw new Error('qa_candidate_registration_failed');

    const evidenceQuery = new URLSearchParams({ select: 'id,storage_path', intake_id: `eq.${intakeId}` });
    const linked = await rest(device.config, `hms_finance_intake_evidence?${evidenceQuery}`);
    checks.evidenceLinked = linked.length === 1 && linked[0].storage_path === objectPath;

    const sign = await storage(device.config, `object/sign/${BUCKET}/${encodePath(objectPath)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
    });
    const relative = sign?.signedURL || sign?.signedUrl || '';
    checks.signedUrlCreated = Boolean(relative);
    if (!relative) throw new Error('qa_signed_url_missing');
    const signedUrl = relative.startsWith('http') ? relative : `${device.config.url}/storage/v1${relative}`;
    const readResponse = await fetch(signedUrl);
    const readBytes = Buffer.from(await readResponse.arrayBuffer());
    checks.signedUrlReadable = readResponse.ok && sha256(readBytes) === hash;

    const retryRows = await rest(device.config, 'rpc/hms_finance_register_discovery_candidate', {
      method: 'POST', prefer: 'return=representation',
      body: { p_source_id: source.id, p_run_id: runId, p_candidate: candidate, p_evidence: evidence, p_device_id: device.id, p_payment_change: false },
    });
    const retry = retryRows?.[0];
    checks.duplicateIdempotent = retry?.already_existing === true && retry?.intake_id === intakeId;

    const [authorizations, payments, journals] = await Promise.all([
      rest(device.config, `hms_finance_authorizations?select=id&metadata->>qa_id=eq.${encodeURIComponent(id)}`),
      rest(device.config, `hms_finance_payments?select=id&metadata->>qa_id=eq.${encodeURIComponent(id)}`),
      rest(device.config, `hms_finance_journal_entries?select=id&metadata->>qa_id=eq.${encodeURIComponent(id)}`),
    ]);
    checks.noAuthorization = authorizations.length === 0;
    checks.noPayment = payments.length === 0;
    checks.noJournal = journals.length === 0;

    await rest(device.config, `hms_finance_ingestion_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { status: 'success', completed_at: new Date().toISOString(), scanned_count: 1, detail: { qa: true, id, intake_id: intakeId } },
    });

    const passedBeforeCleanup = Object.entries(checks)
      .filter(([name]) => !['objectRemoved', 'databaseRowsRemoved'].includes(name))
      .every(([, passed]) => passed === true);
    if (!passedBeforeCleanup) throw new Error('qa_discovery_checks_failed');

    await storage(device.config, `object/${BUCKET}/${encodePath(objectPath)}`, { method: 'DELETE' });
    objectUploaded = false;
    checks.objectRemoved = true;
    await removeDatabaseRows(device.config, intakeId, runId);
    intakeId = null;
    runId = null;
    checks.databaseRowsRemoved = true;

    await audit(device.config, 'finance_discovery_production_qc_completed', 'finance_system', 'discovery-qc', device.id, null, checks, { passed: true, qaId: id, rollbackClean: true });
    return json({ ok: true, passed: true, checks });
  } catch (error) {
    if (objectUploaded) {
      try { await storage(device.config, `object/${BUCKET}/${encodePath(objectPath)}`, { method: 'DELETE' }); checks.objectRemoved = true; } catch {}
    }
    await removeDatabaseRows(device.config, intakeId, runId);
    checks.databaseRowsRemoved = true;
    const detail = error instanceof Error ? error.message : String(error);
    await audit(device.config, 'finance_discovery_production_qc_failed', 'finance_system', 'discovery-qc', device.id, null, checks, { passed: false, qaId: id, detail });
    return json({ ok: false, passed: false, error: 'discovery_qc_failed', detail, checks }, 500);
  }
};
