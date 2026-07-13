import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/edge-functions";

const REPORTS: Record<string, { slug: string; title: string }> = {
  "/reports/clinic-status-july-2026.html": {
    slug: "clinic-status-july-2026",
    title: "Clinic Status and Progress Report - July 2026",
  },
  "/reports/clinic-status-january-2027-projection.html": {
    slug: "clinic-status-january-2027-projection",
    title: "Clinic Portfolio - January 2027 Projection",
  },
};

const DEFAULT_SETTINGS = {
  mode: "open_anonymous",
  requireName: false,
  requireEmail: false,
  sessionMinutes: 480,
  password: null,
  version: 1,
};

const encoder = new TextEncoder();

function env(name: string): string {
  return globalThis.Netlify?.env?.get?.(name) || "";
}

function store() {
  return getStore("hms-report-access", { consistency: "strong" });
}

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function escapeHtml(value: unknown): string {
  return clean(value, 1000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of (header || "").split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function textToBase64Url(text: string): string {
  return bytesToBase64Url(encoder.encode(text));
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function hmacBytes(message: string): Promise<Uint8Array> {
  const secret = env("REPORT_SESSION_SECRET");
  if (!secret) throw new Error("REPORT_SESSION_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

async function signedValue(payload: Record<string, unknown>): Promise<string> {
  const encoded = textToBase64Url(JSON.stringify(payload));
  const signature = bytesToBase64Url(await hmacBytes(encoded));
  return `${encoded}.${signature}`;
}

async function verifySignedValue(value: string | undefined): Promise<Record<string, unknown> | null> {
  if (!value || !value.includes(".")) return null;
  try {
    const [encoded, suppliedSignature] = value.split(".", 2);
    const expected = await hmacBytes(encoded);
    const supplied = base64UrlToBytes(suppliedSignature);
    if (expected.length !== supplied.length) return null;
    let different = 0;
    for (let index = 0; index < expected.length; index += 1) {
      different |= expected[index] ^ supplied[index];
    }
    if (different !== 0) return null;
    const payload = JSON.parse(base64UrlToText(encoded));
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function maskIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : "";
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean).slice(0, 4);
    return parts.length ? `${parts.join(":")}::` : "";
  }
  return "";
}

function reportCookieName(slug: string): string {
  return `hms_report_${slug.replaceAll("-", "_")}`;
}

function cookie(value: string, maxAge: number, path = "/"): string {
  return `${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function getSettings(path: string, report: { slug: string; title: string }) {
  const key = `settings/${report.slug}.json`;
  const accessStore = store();
  const existing = await accessStore.get(key, { type: "json" });
  if (existing) {
    return { ...DEFAULT_SETTINGS, ...existing, slug: report.slug, title: report.title, path };
  }
  const initial = {
    ...DEFAULT_SETTINGS,
    slug: report.slug,
    title: report.title,
    path,
    updatedAt: new Date().toISOString(),
  };
  try {
    await accessStore.setJSON(key, initial);
  } catch (error) {
    console.error("Unable to initialize report settings", error);
  }
  return initial;
}

async function verifyPassword(password: string, stored: any): Promise<boolean> {
  if (!stored?.salt || !stored?.hash || !stored?.iterations) return false;
  try {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: base64UrlToBytes(stored.salt),
        iterations: Number(stored.iterations),
        hash: "SHA-256",
      },
      passwordKey,
      256,
    );
    const actual = new Uint8Array(derived);
    const expected = base64UrlToBytes(stored.hash);
    if (actual.length !== expected.length) return false;
    let different = 0;
    for (let index = 0; index < actual.length; index += 1) {
      different |= actual[index] ^ expected[index];
    }
    return different === 0;
  } catch {
    return false;
  }
}

function identityIsValid(settings: any, name: string, email: string): boolean {
  if (settings.requireName && !name.trim()) return false;
  if (settings.requireEmail && !/^\S+@\S+\.\S+$/.test(email.trim())) return false;
  return true;
}

function accessForm(report: any, settings: any, error = ""): Response {
  const passwordRequired = settings.mode === "password";
  const title = passwordRequired ? "Protected report" : "Identify viewer";
  const description = passwordRequired
    ? "Enter the report password to continue."
    : "No password is required. Enter the requested information to continue.";
  const nameField = settings.requireName || settings.requireEmail
    ? `<label>Name${settings.requireName ? " *" : ""}<input name="name" autocomplete="name" ${settings.requireName ? "required" : ""}></label>`
    : "";
  const emailField = settings.requireEmail
    ? `<label>Email *<input type="email" name="email" autocomplete="email" required></label>`
    : "";
  const passwordField = passwordRequired
    ? `<label>Password *<input type="password" name="password" autocomplete="current-password" required autofocus></label>`
    : "";
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : "";

  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#eef3f7;color:#142235;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);background:#fff;border:1px solid #dbe4ed;border-radius:20px;box-shadow:0 18px 46px rgba(27,49,77,.12);overflow:hidden}.head{padding:26px 28px;color:#fff;background:linear-gradient(125deg,#113556,#1b5b84 58%,#2a8586)}.head p{margin:7px 0 0;opacity:.88}.body{padding:27px 28px}h1{margin:0;font-size:1.65rem}label{display:grid;gap:6px;margin:15px 0;color:#34475d;font-size:.86rem;font-weight:700}input{width:100%;box-sizing:border-box;border:1px solid #cfd9e4;border-radius:10px;padding:12px;font:inherit}button{width:100%;margin-top:10px;border:0;border-radius:10px;padding:12px 15px;color:#fff;background:#173b5f;font:inherit;font-weight:800;cursor:pointer}.error{padding:10px 12px;border-radius:9px;color:#942c38;background:#fde5e8}.notice{margin-top:17px;color:#69788b;font-size:.77rem;line-height:1.45}.report{color:#5c6d80;font-size:.84rem}</style></head>
<body><main class="wrap"><section class="card"><div class="head"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="body"><div class="report">${escapeHtml(report.title)}</div>${errorHtml}<form method="post">${nameField}${emailField}${passwordField}<button type="submit">Continue to report</button></form><div class="notice">Access is logged for security and audit purposes. Records may include date and time, approximate location, browser and device information, and the report viewed.</div></div></section></main></body></html>`, {
    status: error ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function geoValue(context: any) {
  const geo = context?.geo || {};
  const country = geo?.country?.code || geo?.country?.name || geo?.country || "";
  const region = geo?.subdivision?.code || geo?.subdivision?.name || geo?.region?.code || geo?.region?.name || geo?.region || "";
  return {
    country: clean(country, 100),
    region: clean(region, 100),
    city: clean(geo?.city, 100),
    timezone: clean(geo?.timezone, 100),
  };
}

function trackerInjection(event: any, updateToken: string): string {
  const payload = JSON.stringify({
    eventId: event.id,
    eventKey: event.key,
    reportSlug: event.reportSlug,
    updateToken,
  }).replaceAll("<", "\\u003c");
  return `<script>(function(){
const base=${payload};
const nav=navigator||{};const scr=window.screen||{};const ua=nav.userAgentData||null;
const details={...base,clientTimeUtc:new Date().toISOString(),viewerLocalTime:new Date().toString(),timezone:(Intl.DateTimeFormat().resolvedOptions().timeZone||""),language:nav.language||"",languages:Array.isArray(nav.languages)?nav.languages.slice(0,10):[],userAgent:nav.userAgent||"",platform:nav.platform||"",vendor:nav.vendor||"",cookiesEnabled:Boolean(nav.cookieEnabled),online:Boolean(nav.onLine),doNotTrack:nav.doNotTrack||"",screen:{width:Number(scr.width)||0,height:Number(scr.height)||0,availWidth:Number(scr.availWidth)||0,availHeight:Number(scr.availHeight)||0,colorDepth:Number(scr.colorDepth)||0,pixelDepth:Number(scr.pixelDepth)||0},viewport:{width:Number(window.innerWidth)||0,height:Number(window.innerHeight)||0},devicePixelRatio:Number(window.devicePixelRatio)||1,maxTouchPoints:Number(nav.maxTouchPoints)||0,colorScheme:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light",userAgentData:ua?{brands:Array.isArray(ua.brands)?ua.brands.slice(0,10):[],mobile:Boolean(ua.mobile),platform:ua.platform||""}:null};
fetch("/api/report-log",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",keepalive:true,body:JSON.stringify(details)}).catch(function(){});
})();</script><div style="max-width:1180px;margin:12px auto 28px;padding:0 20px;color:#738195;font:11px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center">Access to this report is logged for security and audit purposes, including date/time, approximate location, browser, device and report viewed.</div>`;
}

async function logView(req: Request, context: Context, report: any, settings: any, identity: any, visitorId: string, sessionId: string) {
  const now = new Date();
  const id = crypto.randomUUID();
  const date = now.toISOString().slice(0, 10);
  const safeTime = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const key = `events/${date}/${safeTime}_${report.slug}_${id}.json`;
  const headers = req.headers;
  const rawIp = clean((context as any)?.ip || headers.get("x-nf-client-connection-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim(), 100);
  const salt = env("REPORT_IP_SALT");
  const event = {
    id,
    key,
    eventTimeUtc: now.toISOString(),
    eventType: "report_view",
    reportSlug: report.slug,
    reportTitle: report.title,
    reportPath: new URL(req.url).pathname,
    accessMode: settings.mode,
    authenticationResult: settings.mode === "password" ? "valid_session" : "not_required",
    identity: identity?.name || identity?.email ? { name: clean(identity.name, 160), email: clean(identity.email, 254) } : null,
    visitorId,
    sessionId,
    ipMasked: maskIp(rawIp),
    ipHash: rawIp && salt ? await sha256(`${salt}|${rawIp}`) : "",
    geo: geoValue(context),
    server: {
      userAgent: clean(headers.get("user-agent"), 1000),
      acceptLanguage: clean(headers.get("accept-language"), 300),
      referrer: clean(headers.get("referer"), 1000),
      requestId: clean(headers.get("x-nf-request-id"), 200),
    },
    client: null,
  };
  try {
    await store().setJSON(key, event);
  } catch (error) {
    console.error("Unable to write report access event", error);
  }
  const updateToken = bytesToBase64Url(await hmacBytes(`${key}|${id}`));
  return { event, updateToken };
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const report = REPORTS[url.pathname];
  if (!report) return context.next();

  const settings = await getSettings(url.pathname, report);
  const cookies = parseCookies(req.headers.get("cookie"));
  const sessionCookieName = reportCookieName(report.slug);
  let session = await verifySignedValue(cookies[sessionCookieName]);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !session ||
    session.s !== report.slug ||
    Number(session.v) !== Number(settings.version) ||
    Number(session.e) <= nowSeconds
  ) {
    session = null;
  }

  if (req.method === "POST") {
    const form = await req.formData();
    const name = clean(form.get("name"), 160).trim();
    const email = clean(form.get("email"), 254).trim();
    const password = clean(form.get("password"), 500);
    if (!identityIsValid(settings, name, email)) {
      return accessForm(report, settings, "Please complete the required identity fields.");
    }
    if (settings.mode === "password") {
      if (!settings.password) return accessForm(report, settings, "Password protection is not fully configured.");
      if (!(await verifyPassword(password, settings.password))) {
        return accessForm(report, settings, "The password is incorrect.");
      }
    } else if (settings.mode !== "open_identity") {
      return Response.redirect(url.toString(), 303);
    }
    const minutes = Math.max(15, Math.min(10080, Number(settings.sessionMinutes) || 480));
    const payload = {
      s: report.slug,
      v: settings.version,
      e: nowSeconds + minutes * 60,
      name,
      email,
    };
    const signed = await signedValue(payload);
    const response = Response.redirect(url.toString(), 303);
    response.headers.append("Set-Cookie", cookie(`${sessionCookieName}=${signed}`, minutes * 60, "/reports/"));
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  }

  if (settings.mode === "password" && !settings.password) {
    return new Response("Report password protection is not fully configured.", { status: 503 });
  }
  if ((settings.mode === "password" || settings.mode === "open_identity") && !session) {
    return accessForm(report, settings);
  }

  const staticResponse = await context.next();
  const contentType = staticResponse.headers.get("content-type") || "";
  if (!staticResponse.ok || !contentType.includes("text/html")) return staticResponse;

  const visitorId = cookies.hms_vid || crypto.randomUUID();
  const sessionId = cookies.hms_sid || crypto.randomUUID();
  const identity = session ? { name: session.name, email: session.email } : null;
  const { event, updateToken } = await logView(req, context, report, settings, identity, visitorId, sessionId);
  const originalHtml = await staticResponse.text();
  const injection = trackerInjection(event, updateToken);
  const html = /<\/body>/i.test(originalHtml)
    ? originalHtml.replace(/<\/body>/i, `${injection}</body>`)
    : `${originalHtml}${injection}`;
  const headers = new Headers(staticResponse.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store, private");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!cookies.hms_vid) headers.append("Set-Cookie", cookie(`hms_vid=${visitorId}`, 31536000));
  if (!cookies.hms_sid) headers.append("Set-Cookie", cookie(`hms_sid=${sessionId}`, 28800));
  return new Response(html, { status: staticResponse.status, statusText: staticResponse.statusText, headers });
};

export const config: Config = {
  path: Object.keys(REPORTS),
  method: ["GET", "POST"],
  onError: "continue",
};
