import "server-only";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { supabase } from "./supabaseClient";
import { gatewaySecret } from "./server-session";
import { validSubscription } from "./push-validation";

export function pushConfig() {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.PUSH_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !process.env.PUSH_WORKER_SECRET) return null;
  return { publicKey, privateKey, subject };
}

export function workerAuthorized(header: string | null) {
  const secret = process.env.PUSH_WORKER_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function pushAction(action: string, data: Record<string, unknown> = {}, token = "") {
  const { data: result, error } = await supabase.rpc("web_push_gateway", {
    p_secret: gatewaySecret(), p_token: token, p_action: action, p_data: data,
  });
  if (error) throw new Error("Služba upozornění není nyní dostupná.");
  return result;
}

type Delivery = {
  id: string; lease_id: string; receipt_token: string;
  endpoint: string; p256dh: string; auth: string;
  title: string; body: string; task_id: string | null;
  kind: string; expires_at: string;
};

export async function dispatchPush() {
  const config = pushConfig();
  if (!config) throw new Error("Odesílání upozornění není nastavené.");
  const result = await pushAction("claim");
  const deliveries: Delivery[] = result.deliveries;
  let accepted = 0, retryOrFailed = 0;
  // Bounded batches fit the server runtime. Failed attempts remain in the DB.
  for (let offset = 0; offset < deliveries.length; offset += 4) {
    await Promise.all(deliveries.slice(offset, offset + 4).map(async delivery => {
      let status = 0;
      const subscription = { endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth } };
      if (!validSubscription(subscription)) status = 410;
      else {
        try {
          const response = await webpush.sendNotification(subscription, JSON.stringify({
            title: delivery.title, body: delivery.body, tag: `limmit-${delivery.id}`,
            url: delivery.kind === "overdue" ? "/?filter=overdue" : delivery.task_id ? `/?task=${delivery.task_id}` : "/ucet#upozorneni",
            receipt: { id: delivery.id, token: delivery.receipt_token },
          }), {
            vapidDetails: config,
            TTL: Math.max(0, Math.min(86400, Math.floor((Date.parse(delivery.expires_at) - Date.now()) / 1000))),
            urgency: "high", timeout: 7000,
          });
          status = response.statusCode;
        } catch (error) {
          status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) || 0 : 0;
        }
      }
      await pushAction("complete", { id: delivery.id, lease_id: delivery.lease_id, status });
      if (status >= 200 && status < 300) accepted++; else retryOrFailed++;
    }));
  }
  return { processed: deliveries.length, accepted, retryOrFailed };
}

export async function dispatchPushSafely() {
  if (!pushConfig()) return;
  try { await dispatchPush(); }
  catch { console.error("Push dispatch deferred to scheduled retry."); }
}
