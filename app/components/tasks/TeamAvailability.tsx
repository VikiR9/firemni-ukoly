"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./TeamAvailability.module.css";

type Person = {
  username: string;
  display_name: string;
  online: boolean;
  status: "OFFICE" | "HOME_ONLINE" | "HOME_OFFLINE" | "OFFLINE";
};
const labels = {
  OFFICE: "Online · kancelář",
  HOME_ONLINE: "Online · home office",
  HOME_OFFLINE: "Offline · home office",
  OFFLINE: "Offline",
};

export default function TeamAvailability() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch("/api/attendance/availability", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Availability unavailable");
        const data = await response.json();
        if (!Array.isArray(data.people)) throw new Error("Invalid availability");
        if (!disposed) { setPeople(data.people); setError(false); }
      } catch {
        // Do not present stale online states as current availability.
        if (!disposed) { setPeople(null); setError(true); }
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return (
    <section className={s.panel} aria-label="Dostupnost týmu">
      <div className={s.heading}>
        <strong>Kdo je k dispozici</strong>
        <span role="status">{people ? `${people.filter(p => p.online).length} online` : error ? "Dostupnost není dostupná" : "Načítám…"}</span>
        <Link href="/dochazka">Zapnout / vypnout home office ↗</Link>
      </div>
      {people && <ul className={s.people}>
        {people.map(person => <li key={person.username} className={person.online ? s.online : s.offline}>
          <span className={s.dot} aria-hidden="true" />
          <span><strong>{person.display_name}</strong><small>{labels[person.status]}</small></span>
        </li>)}
      </ul>}
    </section>
  );
}
