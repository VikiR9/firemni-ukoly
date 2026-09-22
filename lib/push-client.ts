"use client";

let workerReady: Promise<ServiceWorkerRegistration> | null = null;

export function preparePushWorker() {
  workerReady ??= (async () => {
    // Retain the previous URL/scope so installed PWAs update the same worker.
    const registration = await navigator.serviceWorker.register("/OneSignalSDKWorker.js", {
      scope: "/", updateViaCache: "none",
    });
    await registration.update();
    const worker = registration.installing ?? registration.waiting;
    if (worker && worker.state !== "activated") {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Aktualizace aplikace trvá déle. Zkuste to znovu.")); }, 20000);
        const cleanup = () => { clearTimeout(timeout); worker.removeEventListener("statechange", changed); };
        const changed = () => {
          if (worker.state === "activated") { cleanup(); resolve(); }
          else if (worker.state === "redundant") { cleanup(); reject(new Error("Aktualizace aplikace se nezdařila.")); }
        };
        worker.addEventListener("statechange", changed);
        changed();
      });
    }
    if (!registration.active) throw new Error("Aplikace není připravená. Obnovte stránku.");
    return registration;
  })().catch(error => { workerReady = null; throw error; });
  return workerReady;
}

export function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}

export function matchesApplicationKey(subscription: PushSubscription, publicKey: string) {
  const actual = subscription.options.applicationServerKey;
  if (!actual) return false;
  const expected = applicationKey(publicKey), bytes = new Uint8Array(actual);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

export async function pushRequest(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upozornění nejsou nyní dostupná.");
  return data;
}
