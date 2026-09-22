"use client";
import { useEffect, useState } from "react";
import s from "./Workspace.module.css";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [hint, setHint] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    // Initial browser-only display mode cannot be known during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const ready = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  return (
    <div>
      <button
        className={compact ? s.secondary : s.sideButton}
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          } else setHint(!hint);
        }}
      >
        {compact ? "↓" : "↓  Nainstalovat aplikaci"}
      </button>
      {hint && (
        <p className={s.installHint}>
          V menu prohlížeče zvolte „Nainstalovat aplikaci“. Na iPhonu: Sdílet →
          Přidat na plochu.
        </p>
      )}
    </div>
  );
}
