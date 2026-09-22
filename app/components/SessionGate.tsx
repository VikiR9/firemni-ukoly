"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { saveSession } from "@/lib/auth";
export default function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicPage = pathname === "/login" || pathname.startsWith("/nabidka/");
  const [checkedPath, setCheckedPath] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (publicPage) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        if (!res.ok) throw new Error("Přihlášení nelze ověřit. Čekám na obnovení spojení…");
        const result = await res.json();
        if (!active) return;
        if (!result.user) {
          localStorage.removeItem("firemni-ukoly:session");
          window.location.replace("/login?next=" + encodeURIComponent(pathname + window.location.search));
          setCheckedPath("");
          return;
        }
        if (result.must_change_password && pathname !== "/zmena-hesla") {
          setCheckedPath("");
          window.location.replace("/zmena-hesla");
          return;
        }
        if (!result.must_change_password && pathname === "/zmena-hesla") {
          window.location.replace("/");
          return;
        }
        saveSession(result.user);
        setCheckedPath(pathname);
        setError("");
      } catch (e) { if (active) { setCheckedPath(""); setError(e instanceof Error ? e.message : "Ověření selhalo."); } }
      finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    const focus = () => { if (!document.hidden) void check(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [pathname, publicPage]);
  if (publicPage) return children;
  if (checkedPath !== pathname) return <main style={{ padding: 40 }} role="status">{error || "Ověřuji přihlášení…"}</main>;
  return children;
}
