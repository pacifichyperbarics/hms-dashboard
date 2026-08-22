import type { Config } from "@netlify/functions";

function env(name: string): string {
  return globalThis.Netlify?.env?.get?.(name) || "";
}
function b64(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out;
}

export default async () => {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_KEY");
  const deliverySecret = env("AGENTMAIL_SETUP_TOKEN");
  if (!supabaseUrl || !serviceKey || !deliverySecret) return Response.json({ error: "Server configuration missing" }, { status: 503 });

  const s = await fetch(`${supabaseUrl}/rest/v1/integration_secrets_v1?name=eq.agentmail_api_key&select=iv_b64,ciphertext_b64`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  if (!s.ok) return Response.json({ error: "Credential lookup failed" }, { status: 500 });
  const rows = await s.json();
  if (!rows?.[0]) return Response.json({ error: "AgentMail credential missing" }, { status: 404 });

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deliverySecret));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(rows[0].iv_b64), additionalData: new TextEncoder().encode("agentmail") }, key, b64(rows[0].ciphertext_b64));
  const apiKey = new TextDecoder().decode(plain);

  const oldId = "ep_3IHM6eKuAIo61e1nZ5vQ5dB4eHY";
  await fetch(`https://api.agentmail.to/v0/webhooks/${oldId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  const created = await fetch("https://api.agentmail.to/v0/webhooks", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://hms-dashboard-v2.netlify.app/api/referrals/agentmail",
      event_types: ["message.received"],
      inbox_ids: ["pacific-referral@agentmail.to"],
      headers: { "X-Referral-Intake-Token": deliverySecret }
    })
  });
  const result = await created.json().catch(() => ({}));
  if (!created.ok) return Response.json({ error: "Webhook creation failed", status: created.status }, { status: 500 });
  return Response.json({ ok: true, webhookId: result.webhook_id || null, enabled: result.enabled === true, inbox: "pacific-referral@agentmail.to" });
};

export const config: Config = { path: "/api/agentmail-webhook-configure-once" };
