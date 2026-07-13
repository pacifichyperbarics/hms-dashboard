import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const encoder = new TextEncoder();
const REPORT_SLUGS = new Set([
  "clinic-status-july-2026",
  "clinic-status-january-2027-projection",
]);

function env(name: string): string {
  return globalThis.Netlify?.env?.get?.(name) || "";
}

function store() {
  return getStore("hms-report-access", { consistency: "strong" });
}

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(minimum, Math.min(maximum, number));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function hmacBytes(message: string): Promise<Uint8Array> {
  const secret = env("REPORT_SESSION_SECRET");
  if (!secret) throw new Error("REPORT_SESSION_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

function sanitizeClient(input: any) {
  const screen = input?.screen || {};
  const viewport = input?.viewport || {};
  const uaData = input?.userAgentData || null;
  return {
    clientTimeUtc: clean(input?.clientTimeUtc, 80),
    viewerLocalTime: clean(input?.viewerLocalTime, 160),
    timezone: clean(input?.timezone, 100),
    language: clean(input?.language, 40),
    languages: Array.isArray(input?.languages)
      ? input.languages.slice(0, 10).map((value: unknown) => clean(value, 40))
      : [],
    userAgent: clean(input?.userAgent, 1000),
    platform: clean(input?.platform, 120),
    vendor: clean(input?.vendor, 160),
    cookiesEnabled: Boolean(input?.cookiesEnabled),
    online: Boolean(input?.online),
    doNotTrack: clean(input?.doNotTrack, 20),
    screen: {
      width: boundedNumber(screen.width, 0, 20000),
      height: boundedNumber(screen.height, 0, 20000),
      availWidth: boundedNumber(screen.availWidth, 0, 20000),
      availHeight: boundedNumber(screen.availHeight, 0, 20000),
      colorDepth: boundedNumber(screen.colorDepth, 0, 128),
      pixelDepth: boundedNumber(screen.pixelDepth, 0, 128),
    },
    viewport: {
      width: boundedNumber(viewport.width, 0, 20000),
      height: boundedNumber(viewport.height, 0, 20000),
    },
    devicePixelRatio: boundedNumber(input?.devicePixelRatio, 0, 20),
    maxTouchPoints: boundedNumber(input?.maxTouchPoints, 0, 100),
    colorScheme: input?.colorScheme === "dark" ? "dark" : "light",
    userAgentData: uaData && typeof uaData === "object"
      ? {
          brands: Array.isArray(uaData.brands)
            ? uaData.brands.slice(0, 10).map((brand: any) => ({
                brand: clean(brand?.brand, 100),
                version: clean(brand?.version, 40),
              }))
            : [],
          mobile: Boolean(uaData.mobile),
          platform: clean(uaData.platform, 100),
        }
      : null,
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 30000) {
    return new Response("Payload too large", { status: 413 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = clean(body?.eventId, 80);
  const eventKey = clean(body?.eventKey, 700);
  const reportSlug = clean(body?.reportSlug, 160);
  const updateToken = clean(body?.updateToken, 200);

  if (
    !eventId ||
    !eventKey ||
    !updateToken ||
    !REPORT_SLUGS.has(reportSlug) ||
    !/^events\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_.-]+\.json$/.test(eventKey)
  ) {
    return new Response("Invalid event", { status: 400 });
  }

  try {
    const expected = bytesToBase64Url(await hmacBytes(`${eventKey}|${eventId}`));
    if (!constantTimeEqual(expected, updateToken)) {
      return new Response("Forbidden", { status: 403 });
    }

    const accessStore = store();
    const event = await accessStore.get(eventKey, { type: "json" });
    if (!event) return new Response("Event not found", { status: 404 });
    if (event.id !== eventId || event.reportSlug !== reportSlug) {
      return new Response("Event mismatch", { status: 403 });
    }

    event.client = sanitizeClient(body);
    event.clientRecordedAtUtc = new Date().toISOString();
    await accessStore.setJSON(eventKey, event);

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    console.error("Unable to update report access event", error);
    return new Response("Logging unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/report-log",
};
