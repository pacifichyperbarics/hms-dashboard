import type { Config } from "@netlify/functions";

function env(name: string): string {
  return globalThis.Netlify?.env?.get?.(name) || "";
}

function clean(value: unknown, max = 5000): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ").slice(0, max);
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

  const authRes = await fetch(`${supabaseUrl}/rest/v1/integration_secrets_v1?name=eq.referral_webhook_token_hash&select=ciphertext_b64`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!authRes.ok) return Response.json({ error: "Webhook authentication unavailable" }, { status: 503 });
  const authRows = await authRes.json();
  const expectedHash = clean(authRows?.[0]?.ciphertext_b64, 100);
  const suppliedToken = req.headers.get("x-referral-intake-token") || "";
  if (!expectedHash || !suppliedToken || (await sha256Hex(suppliedToken)) !== expectedHash) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
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
