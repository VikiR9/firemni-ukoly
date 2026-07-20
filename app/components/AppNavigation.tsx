"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function AppNavigation() {
  const pathname = usePathname();

  // Client-facing offers intentionally render without the internal app chrome.
  if (pathname === "/login" || pathname.startsWith("/nabidka/")) return null;

  const navItems = [
    { href: "/", label: "Úkoly", icon: "tasks" },
    { href: "/kalkulace", label: "Auto", icon: "car" },
    { href: "/pruzkum", label: "Průzkum", icon: "chart" },
    { href: "/majetek", label: "Majetek", icon: "home" },
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
    if (name === "home") {
      return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
    }
    if (name === "car") {
      return <svg {...common}><path d="m5 17-2-2v-4l2-5h14l2 5v4l-2 2"/><path d="M5 11h14"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/></svg>;
    }
    if (name === "chart") {
      return <svg {...common}><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20V7"/></svg>;
    }
    return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
  };

  return (
    <nav className="border-b border-white/8 bg-[#080d19]/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-3 sm:px-6">
        <div className="flex items-center justify-center gap-1 overflow-x-auto py-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all sm:px-5 ${
                pathname === item.href
                  ? "bg-white text-[#0d1730] shadow-[0_8px_24px_rgba(0,0,0,.22)]"
                  : "text-slate-400 hover:bg-white/6 hover:text-white"
              }`}
            >
              {icon(item.icon)}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
