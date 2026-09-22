"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSession, type User } from "@/lib/auth";
import { LimmitLogo } from "@/lib/logo";
import styles from "./ModuleShell.module.css";

type ModuleItem = {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

export default function ModuleShell({ title, subtitle, section, items, actions, children, user }: {
  title: string;
  subtitle: string;
  section: string;
  items: ModuleItem[];
  actions?: ReactNode;
  children: ReactNode;
  user?: User | null;
}) {
  const router = useRouter();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label={section}>
        <Link href="/" className={styles.brand} aria-label="LIMMIT – úkoly">
          <LimmitLogo height={36} variant="light" />
        </Link>
        <nav className={styles.menu} aria-label={`Zobrazení: ${section}`}>
          <p className={styles.sideLabel}>{section}</p>
          {items.map((item) => item.href ? (
            <Link key={item.label} href={item.href} className={styles.item}>
              {item.icon}<span>{item.label}</span>
            </Link>
          ) : (
            <button key={item.label} type="button" onClick={item.onClick} disabled={item.disabled}
              aria-pressed={item.active} className={`${styles.item} ${item.active ? styles.active : ""}`}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.avatar}>{user?.displayName.slice(0, 1) || "L"}</span>
          <div><strong>{user?.displayName || "LIMMIT"}</strong><small>Pracovní prostor</small></div>
          <button type="button" aria-label="Odhlásit se" title="Odhlásit se" onClick={() => {
            clearSession(); router.push("/login");
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M9 5H4v14h5M10 12h10m-4-4 4 4-4 4" />
            </svg>
          </button>
        </div>
      </aside>
      <div className={styles.body}>
        <div className={styles.mobileBrand}><LimmitLogo height={30} /></div>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>{section}</p><h1>{title}</h1><p className={styles.subtitle}>{subtitle}</p></div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
        <nav className={styles.mobileMenu} aria-label={`Zobrazení: ${section}`}>
          {items.map((item) => item.href ? (
            <Link key={item.label} href={item.href}>{item.label}</Link>
          ) : (
            <button key={item.label} type="button" onClick={item.onClick} disabled={item.disabled}
              aria-pressed={item.active}>{item.icon}{item.label}</button>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
