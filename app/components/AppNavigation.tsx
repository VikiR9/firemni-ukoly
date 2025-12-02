"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function AppNavigation() {
  const pathname = usePathname();

  // Don't show navigation on login page
  if (pathname === "/login") return null;

  const navItems = [
    { href: "/", label: "Úkoly", icon: "📋" },
    { href: "/kalkulace", label: "Kalkulace", icon: "🧮" },
  ];

  return (
    <nav className="bg-zinc-800 border-b border-zinc-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-center gap-2 py-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                pathname === item.href
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "bg-zinc-700 text-gray-300 hover:bg-zinc-600 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
