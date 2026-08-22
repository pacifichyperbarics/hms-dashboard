import type { Config } from "@netlify/functions";

function env(name: string): string {
  return globalThis.Netlify?.env?.get?.(name) || "";
}

function clean(value: unknown, max = 5000): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ").slice(0, max);
  return typeof value === "string" ? value.slice(0, max) : "";
}

function b64Bytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySvix(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get("webhook-id") || "";
  const timestamp = req.headers.get("webhook-timestamp") || "";
  const signatures = req.headers.get("webhook-signature") || "";
  if (!id || !timestamp || !signatures || !secret.startsWith("whsec_")) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const keyBytes = b64Bytes(secret.slice(6));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)));

  for (const item of signatures.split(" ")) {
    const [version, encoded] = item.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      if (sameBytes(expected, b64Bytes(encoded))) return true;
    } catch {}
  }
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_KEY");
  if (!supabaseUrl || !serviceKey) return Response.json({ error: "Database not configured" }, { status: 503 });

  const secretRes = await fetch(`${supabaseUrl}/rest/v1/integration_runtime_secrets_v1?name=eq.agentmail_webhook_secret&select=secret_value`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!secretRes.ok) return Response.json({ error: "Webhook verification unavailable" }, { status: 503 });
  const secretRows = await secretRes.json();
  const webhookSecret = clean(secretRows?.[0]?.secret_value, 200);

  const rawBody = await req.text();
  if (!webhookSecret || !(await verifySvix(req, rawBody, webhookSecret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload?.event_type !== "message.received") return new Response(null, { status: 204 });

  const message = payload?.message || {};
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const attachmentNames = attachments.map((a: any) => clean(a?.filename, 300)).filter(Boolean);
  const attachmentTypes = attachments.map((a: any) => clean(a?.content_type, 120)).filter(Boolean);
  const attachmentMeta = attachments.map((a: any) => ({
    attachment_id: clean(a?.attachment_id, 300),
    filename: clean(a?.filename, 300),
    content_type: clean(a?.content_type, 120),
    size: Number.isFinite(Number(a?.size)) ? Number(a.size) : null,
    inline: String(a?.content_disposition || "").toLowerCase() === "inline",
  }));

  const rawText = clean(message.text || message.extracted_text || htmlToText(clean(message.html, 20000)) || message.preview || "", 20000);
  const receivedAt = clean(message.received_timestamp || message.timestamp || message.created_at, 100) || new Date().toISOString();
  const sourceMessageId = clean(message.message_id || payload?.event_id, 300);

  if (sourceMessageId) {
    const existing = await fetch(`${supabaseUrl}/rest/v1/referral_intake_v5?source_message_id=eq.${encodeURIComponent(sourceMessageId)}&select=id&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (existing.ok) {
      const rows = await existing.json();
      if (Array.isArray(rows) && rows.length) return new Response(null, { status: 204 });
    }
  }

  const row = {
    source_type: "Email",
    source_account: clean(message.inbox_id, 300),
    source_message_id: sourceMessageId,
    source_url: "",
    received_at: receivedAt,
    sender: clean(message.from_ || message.from, 1000),
    subject: clean(message.subject, 1000),
    attachment_name: attachmentNames.join("; ").slice(0, 2000),
    attachment_type: attachmentTypes.join("; ").slice(0, 1000),
    attachment_url: "",
    raw_text: rawText,
    patient_name: "",
    dob: "",
    payer: "",
    provider: "",
    diagnosis: "",
    patient_email: "",
    patient_phone: "",
    extraction_confidence: null,
    review_status: "Needs Review",
    created_by_browser: "agentmail",
    updated_at: new Date().toISOString(),
    attachments: attachmentMeta,
    source_thread_id: clean(message.thread_id, 300),
    source_inbox_id: clean(message.inbox_id, 300),
  };

  const result = await fetch(`${supabaseUrl}/rest/v1/referral_intake_v5`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!result.ok) {
    const detail = await result.text();
    return Response.json({ error: "Failed to create intake item", detail }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};

export const config: Config = {
  path: "/api/referrals/agentmail",
};
