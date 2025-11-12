"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { validateCredentials, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const user = validateCredentials(username, password);
    if (!user) {
      setError("Neplatné přihlašovací údaje");
      setLoading(false);
      return;
    }

    saveSession(user);
    // Request browser notification permission as part of the user-initiated login action.
    // Doing this here (before redirect) increases chances browsers accept the prompt
    // because it follows a direct user gesture (form submit).
    try {
      if (typeof Notification !== "undefined") {
        // Ask permission (some browsers require user gesture to show prompt)
        const p = await Notification.requestPermission();
        // If granted, attempt to register service worker and subscribe to push now (still user gesture)
        if (p === "granted" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.register("/sw.js");
            const vapidPublicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "");
            if (vapidPublicKey) {
              // convert base64 to Uint8Array
              const converted = Uint8Array.from(
                atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")),
                (c) => c.charCodeAt(0)
              );
              const existingSub = await registration.pushManager.getSubscription();
              const sub = existingSub ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: converted });
              // send subscription to backend
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.displayName, subscription: sub.toJSON() }),
              });
            }
          } catch (swErr) {
            console.warn("SW/register/subscribe failed:", swErr);
          }
        }
      }
    } catch (e) {
      // ignore errors — not all environments provide Notification API
      // (mobile browsers may behave differently)
      // We don't block login on this.
      // eslint-disable-next-line no-console
      console.warn("Notification permission request failed:", e);
    }

    router.push("/");
    router.refresh();
  };

  // Expose a retry button so users can re-run SW registration & push subscription
  const handleRetrySubscribe = async () => {
    setError("");
    try {
      if (typeof Notification === "undefined") {
        setError("Prohlížeč nepodporuje Notification API");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifikace nebyly povoleny");
        return;
      }

      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        setError("Service Worker není dostupný v tomto prohlížeči");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const vapidPublicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "");
      if (!vapidPublicKey) {
        setError("Chybí VAPID klíč (NEXT_PUBLIC_VAPID_PUBLIC_KEY)");
        return;
      }

      const converted = Uint8Array.from(
        atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0)
      );

      const existingSub = await registration.pushManager.getSubscription();
      const sub = existingSub ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: converted });

      // Use currently entered username if available; otherwise inform user to login first
      const submitUsername = username || null;
      if (!submitUsername) {
        setError("Zadej prosím jméno výše a klikni nejdříve na Přihlásit se (login) nebo zadej jméno sem před retry)");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: submitUsername, subscription: sub.toJSON() }),
      });

      if (!res.ok) {
        const txt = await res.text();
        setError("Chyba při odesílání subscription na server: " + txt);
        return;
      }

      // success
      setError("");
      alert("Subscription odeslána — zkontroluj prosím tabulku push_subscriptions v Supabase");
    } catch (e: any) {
      console.warn("Retry subscribe error:", e);
      setError(String(e?.message ?? e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
      <div className="bg-zinc-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Firemní úkoly
        </h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          Přihlaste se svým jménem
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Jméno
            </label>
            <input
              name="username"
              autoComplete="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="např. Milan, Miloš..."
              className="w-full rounded-lg bg-zinc-700 text-white px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Heslo
            </label>
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg bg-zinc-700 text-white px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {error && (
            <div className="bg-red-600/20 border border-red-600 rounded-lg px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-600 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? "Přihlašování..." : "Přihlásit se"}
          </button>
          <button
            type="button"
            onClick={handleRetrySubscribe}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
          >
            Registrovat notifikace (Retry subscribe)
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-700">
          <p className="text-xs text-gray-500 text-center">
            Uživatelé: Milan (majitel), Miloš, Karina, Kateřina, Vendula, Viktor, Nikola
          </p>
        </div>
      </div>
    </div>
  );
}
