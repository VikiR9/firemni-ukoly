"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { applicationKey, matchesApplicationKey, preparePushWorker, pushRequest } from "@/lib/push-client";
import styles from "./PushNotifications.module.css";

type Config = { configured: boolean; publicKey: string | null; username: string };
type Device = { id: string; enabled: boolean; last_accepted_at: string | null; last_displayed_at: string | null };
const OWNER_KEY = "limmit:push-owner:v1";

export default function PushNotifications({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [state, setState] = useState<"loading" | "unsupported" | "install" | "ready">("loading");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const refreshing = useRef(false);
  const enabled = permission === "granted" && device?.enabled === true;

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const supported = window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
      if (!supported) {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        setState(ios && !window.matchMedia("(display-mode: standalone)").matches ? "install" : "unsupported");
        return;
      }
      setPermission(Notification.permission);
      const [settings, worker] = await Promise.all([
        pushRequest("/api/push/subscribe") as Promise<Config>, preparePushWorker(),
      ]);
      setConfig(settings); registration.current = worker;
      let subscription = await worker.pushManager.getSubscription();
      let current: Device | null = null;
      if (subscription && settings.publicKey && matchesApplicationKey(subscription, settings.publicKey)) {
        let owner: string | null = null;
        try { owner = localStorage.getItem(OWNER_KEY); } catch {}
        // Refresh an explicitly enabled subscription after the same user signs
        // in again. Switching accounts always requires an explicit button click.
        if (owner === settings.username && Notification.permission === "granted" && settings.configured) {
          await pushRequest("/api/push/subscribe", { subscription: subscription.toJSON() });
        }
        const result = await pushRequest("/api/push/subscribe", { action: "status", endpoint: subscription.endpoint });
        current = result.subscription;
      } else subscription = null;
      setDevice(current); setState("ready"); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stav upozornění nelze načíst.");
      setState("ready");
    } finally { refreshing.current = false; }
  }, []);

  useEffect(() => {
    void refresh();
    const focused = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => { window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); };
  }, [refresh]);

  async function enable() {
    if (!config?.publicKey || !registration.current) return;
    // Call synchronously from the click, before network requests or SW work.
    const permissionRequest = Notification.requestPermission();
    setBusy(true); setError(""); setMessage("");
    try {
      const granted = await permissionRequest;
      setPermission(granted);
      if (granted !== "granted") return;
      let subscription = await registration.current.pushManager.getSubscription();
      if (subscription && !matchesApplicationKey(subscription, config.publicKey)) {
        const removed = await subscription.unsubscribe();
        if (!removed) throw new Error("Původní upozornění se nepodařilo aktualizovat. Zkuste to znovu.");
        subscription = null;
      }
      subscription ??= await registration.current.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey),
      });
      const result = await pushRequest("/api/push/subscribe", { subscription: subscription.toJSON() });
      try { localStorage.setItem(OWNER_KEY, config.username); } catch {}
      setDevice({ id: result.id, enabled: true, last_accepted_at: null, last_displayed_at: null });
      setMessage("Upozornění jsou zapnutá pro tento účet a zařízení.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upozornění se nepodařilo zapnout."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError(""); setMessage("");
    try {
      const subscription = await registration.current?.pushManager.getSubscription();
      if (subscription) {
        await pushRequest("/api/push/subscribe", { action: "unsubscribe", endpoint: subscription.endpoint });
        // Remove the renewal marker as soon as server delivery is disabled.
        try { localStorage.removeItem(OWNER_KEY); } catch {}
        await subscription.unsubscribe();
      }
      setDevice(null); setMessage("Upozornění na tomto zařízení jsou vypnutá.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upozornění se nepodařilo vypnout."); }
    finally { setBusy(false); }
  }

  async function test() {
    if (!device) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await pushRequest("/api/push/send", { subscriptionId: device.id });
      setMessage("Zkouška je naplánovaná. Teď aplikaci zavřete a zamkněte telefon. Upozornění má přijít do 2 minut.");
    } catch (e) { setError(e instanceof Error ? e.message : "Zkoušku se nepodařilo naplánovat."); }
    finally { setBusy(false); }
  }

  if (compact && state === "loading") return null;
  if (compact && enabled) return <div className={styles.active}><span>● Upozornění na tomto zařízení jsou zapnutá</span><Link href="/ucet#upozorneni">Vyzkoušet a nastavit</Link></div>;
  return <section id={compact ? undefined : "upozorneni"} className={`${styles.card} ${compact ? styles.compact : ""}`} aria-label="Upozornění na tomto zařízení">
    <div><h2>Upozornění na tomto zařízení</h2><p>Nové úkoly, jejich změny, přijetí i dokončení a souhrny po termínu i při zavřené aplikaci.</p></div>
    {state === "loading" ? <p role="status">Kontroluji upozornění…</p> :
      state === "install" ? <p>Na iPhonu otevřete LIMMIT pomocí ikony na ploše. Pokud tam není, zvolte v prohlížeči Sdílet → Přidat na plochu.</p> :
      state === "unsupported" ? <p>Tento prohlížeč upozornění nepodporuje. Na iPhonu použijte aplikaci na ploše s iOS 16.4 nebo novějším, na Androidu aktuální Chrome.</p> : <>
        {permission === "denied" ? <p>Oznámení jsou v telefonu nebo prohlížeči zakázaná. Povolte je v nastavení oznámení pro LIMMIT a potom obnovte stav.</p> : null}
        {config && !config.configured ? <p>Serverové odesílání ještě není aktivované. Stav můžete zkontrolovat později.</p> : null}
        <div className={styles.actions}>
          {enabled ? <>
            <strong className={styles.on}>Zapnuto</strong>
            <button disabled={busy} onClick={() => void test()}>Poslat zkušební upozornění</button>
            <button disabled={busy} onClick={() => void disable()}>Vypnout na tomto zařízení</button>
          </> : <button className={styles.primary} disabled={busy || !config?.configured || !registration.current || permission === "denied"} onClick={() => void enable()}>{busy ? "Zapínám…" : "Zapnout upozornění"}</button>}
          <button disabled={busy} onClick={() => void refresh()}>Obnovit stav</button>
        </div>
        {!compact && device?.last_displayed_at ? <p className={styles.detail}>Poslední potvrzené zobrazení: {new Date(device.last_displayed_at).toLocaleString("cs-CZ")}</p> : null}
        {!compact && device?.last_accepted_at && !device.last_displayed_at ? <p className={styles.detail}>Zprávu převzala doručovací služba. Zobrazení na zařízení zatím nebylo potvrzeno.</p> : null}
      </>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {message ? <p className={styles.success} role="status">{message}</p> : null}
    {!compact ? <p className={styles.detail}>Každý den v 8:30 a 14:30 českého času dostanete jeden souhrn svých úkolů po termínu, pokud nějaké máte. Nový úkol oznámíme jeho zpracovatelům, přijetí autorovi. Změny zadání, stavu a nové aktualizace oznámíme autorovi a zpracovatelům kromě původce změny. Dokončení části společného úkolu oznámíme ostatním zpracovatelům; při zapnutém schvalování až po schválení. Historii najdete pod zvonečkem. Nastavení platí pro tento účet a zařízení. Při odhlášení se odesílání zastaví. Zobrazení ovlivňuje režim Soustředění a nastavení oznámení telefonu.</p> : null}
  </section>;
}
