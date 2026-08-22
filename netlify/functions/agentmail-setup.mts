import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const setup = globalThis.Netlify?.env?.get?.("AGENTMAIL_SETUP_TOKEN") || "";
  const url = new URL(req.url);
  if (!setup || url.searchParams.get("token") !== setup) return new Response("Unauthorized", { status: 401 });

  const response = await fetch("https://api.agentmail.to/v0/agent/sign-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      human_email: "info@pacifichyperbarics.com",
      username: "pacific-referral",
      source: "chatgpt",
      referrer: "hms-referral-dashboard"
    })
  });
  const body = await response.text();
  return new Response(body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/agentmail-setup" };
