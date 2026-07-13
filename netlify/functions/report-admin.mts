import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const REPORTS = [
  {
    slug: "clinic-status-july-2026",
    title: "Clinic Status and Progress Report - July 2026",
    path: "/reports/clinic-status-july-2026.html",
  },
  {
    slug: "clinic-status-january-2027-projection",
    title: "Clinic Portfolio - January 2027 Projection",
    path: "/reports/clinic-status-january-2027-projection.html",
  },
] as const;

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

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

function authorized(req: Request): boolean {
  const expected = env("REPORT_ADMIN_TOKEN");
  if (!expected) return false;
  const authorization = req.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return constantTimeEqual(expected, supplied);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hashPassword(password: string) {
  const iterations = 210000;
  const salt = randomBytes(24);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return {
    algorithm: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(new Uint8Array(derived)),
  };
}

async function getSettings(report: (typeof REPORTS)[number]) {
  const key = `settings/${report.slug}.json`;
  const existing = await store().get(key, { type: "json" });
  if (existing) return { ...DEFAULT_SETTINGS, ...existing, ...report };
  const initial = {
    ...DEFAULT_SETTINGS,
    ...report,
    updatedAt: new Date().toISOString(),
  };
  await store().setJSON(key, initial);
  return initial;
}

function publicSettings(settings: any) {
  const { password, ...safe } = settings;
  return {
    ...safe,
    passwordConfigured: Boolean(password?.hash),
  };
}

async function listEvents(limit: number, reportSlug: string) {
  const accessStore = store();
  const listing = await accessStore.list({ prefix: "events/" });
  const keys = listing.blobs
    .map((item) => item.key)
    .filter((key) => !reportSlug || key.includes(`_${reportSlug}_`))
    .sort()
    .reverse()
    .slice(0, limit);

  const events = await Promise.all(
    keys.map(async (key) => {
      try {
        return await accessStore.get(key, { type: "json" });
      } catch {
        return null;
      }
    }),
  );
  return events.filter(Boolean);
}

async function saveSettings(body: any) {
  const slug = clean(body?.slug, 160);
  const report = REPORTS.find((item) => item.slug === slug);
  if (!report) throw new Error("Unknown report");

  const current = await getSettings(report);
  const allowedModes = new Set(["open_anonymous", "open_identity", "password"]);
  const mode = allowedModes.has(body?.mode) ? body.mode : current.mode;
  const requireName = Boolean(body?.requireName);
  const requireEmail = Boolean(body?.requireEmail);
  const sessionMinutes = Math.max(15, Math.min(10080, Number(body?.sessionMinutes) || 480));
  const revokeSessions = Boolean(body?.revokeSessions);
  const passwordInput = clean(body?.password, 500);
  const clearPassword = Boolean(body?.clearPassword);

  let password = current.password || null;
  if (clearPassword) password = null;
  if (passwordInput) password = await hashPassword(passwordInput);
  if (mode === "password" && !password?.hash) {
    throw new Error("Set a password before enabling password protection");
  }

  const updated = {
    ...current,
    ...report,
    mode,
    requireName,
    requireEmail,
    sessionMinutes,
    password,
    version: revokeSessions ? Number(current.version || 1) + 1 : Number(current.version || 1),
    updatedAt: new Date().toISOString(),
  };
  await store().setJSON(`settings/${report.slug}.json`, updated);
  return publicSettings(updated);
}

async function deleteEvents(reportSlug: string) {
  const accessStore = store();
  const listing = await accessStore.list({ prefix: "events/" });
  const keys = listing.blobs
    .map((item) => item.key)
    .filter((key) => !reportSlug || key.includes(`_${reportSlug}_`));
  await Promise.all(keys.map((key) => accessStore.delete(key)));
  return keys.length;
}

export default async (req: Request, _context: Context) => {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "overview";

  try {
    if (req.method === "GET" && action === "overview") {
      const settings = await Promise.all(REPORTS.map(getSettings));
      const events = await listEvents(250, "");
      return json({
        reports: settings.map(publicSettings),
        events,
        generatedAt: new Date().toISOString(),
      });
    }

    if (req.method === "GET" && action === "settings") {
      const settings = await Promise.all(REPORTS.map(getSettings));
      return json({ reports: settings.map(publicSettings) });
    }

    if (req.method === "GET" && action === "logs") {
      const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || 250));
      const reportSlug = clean(url.searchParams.get("report"), 160);
      return json({ events: await listEvents(limit, reportSlug) });
    }

    if (req.method === "POST" && action === "settings") {
      const body = await req.json();
      return json({ report: await saveSettings(body) });
    }

    if (req.method === "POST" && action === "delete-logs") {
      const body = await req.json();
      const reportSlug = clean(body?.reportSlug, 160);
      return json({ deleted: await deleteEvents(reportSlug) });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Report admin API error", error);
    return json({ error: error instanceof Error ? error.message : "Request failed" }, 400);
  }
};

export const config: Config = {
  path: "/api/report-admin",
};
