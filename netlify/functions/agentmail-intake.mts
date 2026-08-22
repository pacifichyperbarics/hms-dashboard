import type { Config } from "@netlify/functions";

const TARGET = "https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/agentmail-intake-v5";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const headers = new Headers({ "Content-Type": req.headers.get("content-type") || "application/json" });
  for (const name of ["svix-id", "svix-timestamp", "svix-signature", "webhook-id", "webhook-timestamp", "webhook-signature"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const result = await fetch(TARGET, { method: "POST", headers, body: rawBody });
    const body = await result.text();
    return new Response(body || null, {
      status: result.status,
      headers: { "Content-Type": result.headers.get("content-type") || "text/plain", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Intake processor unavailable" }, { status: 502 });
  }
};

export const config: Config = { path: "/api/referrals/agentmail" };
