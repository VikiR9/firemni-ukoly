"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import NotificationBell from "./NotificationBell";

export default function AppNavigation() {
  const pathname = usePathname();

  // Client-facing offers intentionally render without the internal app chrome.
  if (pathname === "/login" || pathname === "/zmena-hesla" || pathname.startsWith("/nabidka/")) return null;

  const navItems = [
    { href: "/", label: "Úkoly", icon: "tasks" },
    { href: "/dochazka", label: "Docházka", icon: "calendar" },
    { href: "/kalkulace", label: "Auto", icon: "car" },
    { href: "/pruzkum", label: "Průzkum", icon: "chart" },
    { href: "/majetek", label: "Majetek", icon: "home" },
    { href: "/ucet", label: "Účet", icon: "tasks" },
  ];

  const icon = (name: string) => {
    const common = {
      width: 18,
      height: 18,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      "aria-hidden": true,
    };
    if (name === "calendar") {
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3" />
        </svg>
      );
    }
    if (name === "home") {
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    }
    if (name === "car") {
      return (
        <svg {...common}>
          <path d="m5 17-2-2v-4l2-5h14l2 5v4l-2 2" />
          <path d="M5 11h14" />
          <circle cx="7" cy="15" r="1" />
          <circle cx="17" cy="15" r="1" />
        </svg>
      );
    }
    if (name === "chart") {
      return (
        <svg {...common}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20V7" />
        </svg>
      );
    }
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  };

  return (
    <nav className="app-navigation" aria-label="Moduly aplikace">
      <div className="app-navigation-inner">
        <div className="app-navigation-items">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`app-navigation-link ${pathname === item.href ? "app-navigation-active" : ""}`}
            >
              {icon(item.icon)}
              <span>{item.label}</span>
            </Link>
          ))}
          <NotificationBell />
        </div>
      </div>
    </nav>
  );
}
