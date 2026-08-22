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
  const setup = env("AGENTMAIL_SETUP_TOKEN");
  if (!supabaseUrl || !serviceKey || !setup) return Response.json({ error: "Server configuration missing" }, { status: 503 });

  const s = await fetch(`${supabaseUrl}/rest/v1/integration_secrets_v1?name=eq.agentmail_api_key&select=iv_b64,ciphertext_b64`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  if (!s.ok) return Response.json({ error: "Secret lookup failed" }, { status: 500 });
  const rows = await s.json();
  if (!rows?.[0]) return Response.json({ error: "AgentMail secret missing" }, { status: 404 });

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(setup));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(rows[0].iv_b64), additionalData: new TextEncoder().encode("agentmail") }, key, b64(rows[0].ciphertext_b64));
  const apiKey = new TextDecoder().decode(plain);

  const r = await fetch("https://api.agentmail.to/v0/agent/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ otp_code: "705059" })
  });
  const text = await r.text();
  return new Response(text || JSON.stringify({ ok: r.ok }), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/agentmail-verify-once" };
