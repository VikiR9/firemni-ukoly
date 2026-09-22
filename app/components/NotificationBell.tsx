"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./tasks/Modal";
import styles from "./NotificationBell.module.css";

type Notice = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null; task_title: string | null; url: string | null };
type Cursor = { before_at: string; before_id: string };
type History = { items: Notice[]; unread_count: number; as_of: string; next_cursor: Cursor | null };

async function request(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upozornění nelze načíst.");
  return data;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false), [unread, setUnread] = useState(0);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const opened = useRef(false), requestVersion = useRef(0);

  const refreshCount = useCallback(async () => {
    if (document.hidden || opened.current) return;
    const version = ++requestVersion.current;
    try {
      const result = await request("/api/notifications?count=1");
      if (version === requestVersion.current && !opened.current) setUnread(result.unread_count);
    } catch { /* The history panel provides retry and error details when opened. */ }
  }, []);

  useEffect(() => {
    const requests = requestVersion;
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), 60000);
    const focus = () => { void refreshCount(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { clearInterval(timer); ++requests.current; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refreshCount]);

  async function load(cursor?: Cursor) {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try {
      const result: History = await request("/api/notifications" + (cursor ? "?" + new URLSearchParams(cursor) : ""));
      if (version !== requestVersion.current) return;
      setHistory(previous => ({ ...result, as_of: cursor && previous ? previous.as_of : result.as_of,
        items: cursor && previous ? [...previous.items, ...result.items.filter(item => !previous.items.some(old => old.id === item.id))] : result.items }));
      setUnread(result.unread_count);
    } catch (e) { if (version === requestVersion.current) setError(e instanceof Error ? e.message : "Historii nelze načíst."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }

  function show() { opened.current = true; setOpen(true); setHistory(null); void load(); }
  function close() { opened.current = false; ++requestVersion.current; setOpen(false); setLoading(false); void refreshCount(); }

  async function read(item?: Notice) {
    if (busy || !history) return;
    setBusy(true); setError("");
    try {
      const result = await request("/api/notifications", item ? { action: "read", id: item.id } : { action: "read_all", through: history.as_of });
      setUnread(result.unread_count);
      setHistory(previous => previous && ({ ...previous, unread_count: result.unread_count, items: previous.items.map(entry =>
        (!item || entry.id === item.id) && !entry.read_at ? { ...entry, read_at: new Date().toISOString() } : entry) }));
      if (item?.url) window.location.assign(item.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Změnu nelze uložit."); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" className={`app-navigation-link ${styles.bell}`} onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-label={`Upozornění${unread ? `, nepřečtených: ${unread}` : ""}`}>
      <span className={styles.icon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {unread > 0 && <span className={styles.count} aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}</span>
      <span className={styles.label}>Zprávy</span>
    </button>
    {open && <Modal title="Historie upozornění" onClose={close} busy={busy}>
      <div className={styles.content}>
      <div className={styles.toolbar}>
        <p>{!history ? "Vaše upozornění" : unread ? `${unread} nepřečtených upozornění` : "Všechna upozornění jsou přečtená"}</p>
        <button type="button" onClick={() => void load()} disabled={loading || busy}>Obnovit</button>
        <button type="button" onClick={() => void read()} disabled={loading || busy || !history || !unread}>Označit vše jako přečtené</button>
      </div>
      <p className={styles.hint}>Vaše upozornění za posledních 90 dní, společná pro všechna zařízení. Klepnutím otevřete úkol.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !history && <p className={styles.empty} role="status">Načítám upozornění…</p>}
      {history?.items.length === 0 && <div className={styles.empty}><strong>Zatím tu nemáte žádné upozornění</strong><p>Nové úkoly, jejich změny a souhrny po termínu se objeví tady, i když máte oznámení na telefonu vypnutá.</p></div>}
      <ul className={styles.list}>{history?.items.map(item => <li key={item.id} className={item.read_at ? styles.read : styles.unread}>
        <button type="button" className={styles.entry} onClick={() => void read(item)} disabled={busy || loading}>
          <div className={styles.meta}><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time><span>{item.read_at ? "Přečteno" : "Nové"}</span></div>
          <strong>{item.title}</strong>{item.task_title && <span className={styles.task}>{item.task_title}</span>}<p>{item.body}</p>
          <span className={styles.action}>{item.url ? item.kind === "overdue" ? "Zobrazit úkoly po termínu →" : "Otevřít úkol →" : "Úkol již není dostupný"}</span>
        </button>
      </li>)}</ul>
      {history?.next_cursor && <button type="button" className={styles.more} disabled={loading || busy} onClick={() => void load(history.next_cursor!)}>{loading ? "Načítám…" : "Načíst starší upozornění"}</button>}
      </div>
    </Modal>}
  </>;
}
