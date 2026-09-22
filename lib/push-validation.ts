import { ECDH } from "node:crypto";

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Restrict server requests to established browser push services (SSRF defence).
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.hash && (url.pathname.length > 1 || url.search.length > 1) && (
        url.hostname === "fcm.googleapis.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".push.services.mozilla.com") ||
        url.hostname.endsWith(".notify.windows.com")
      );
  } catch { return false; }
}

export function validSubscription(value: unknown): value is WebPushSubscription {
  if (!value || typeof value !== "object") return false;
  const sub = value as Partial<WebPushSubscription>;
  if (!validPushEndpoint(sub.endpoint) || !sub.keys ||
    !/^[A-Za-z0-9_-]{87}$/.test(sub.keys.p256dh ?? "") ||
    !/^[A-Za-z0-9_-]{22}$/.test(sub.keys.auth ?? "")) return false;
  try {
    const key = Buffer.from(sub.keys.p256dh, "base64url");
    return key.length === 65 && key[0] === 4 &&
      ECDH.convertKey(key, "prime256v1").length === 65 &&
      Buffer.from(sub.keys.auth, "base64url").length === 16;
  } catch { return false; }
}

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
