"use client";
import { LimmitLogo } from "@/lib/logo";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/auth";

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

    let user;
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      user = result.user;
      if (result.must_change_password) {
        saveSession(user);
        router.replace("/zmena-hesla");
        router.refresh();
        return;
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Přihlášení se nezdařilo.",
      );
      setLoading(false);
      return;
    }

    saveSession(user);

    const next = new URLSearchParams(window.location.search).get("next");
    const taskLink = /^\/\?task=[0-9a-f-]{36}$/i.test(next ?? "") || next === "/?filter=overdue";
    router.push(taskLink || ["/dochazka", "/absence", "/ucet", "/kalkulace", "/majetek", "/pruzkum"].includes(next ?? "") ? next! : "/");
    router.refresh();
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="flex justify-center mb-6"><LimmitLogo height={48} /></div>
        <h1 className="text-center mb-3">Vítejte v týmu</h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          Přihlaste se svým jménem
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Jméno</label>
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
            <label className="block text-sm text-gray-300 mb-2">Heslo</label>
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
            <div className="bg-red-600/20 border border-red-600 rounded-lg px-4 py-3 text-sm text-red-800">
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
        </form>

        <div className="mt-8 pt-6 border-t border-[#e4e9e8]">
          <p className="text-xs text-gray-500 text-center">
            Milan a Viktor (majitelé), Miloš, Karina, Kateřina, Vendula, Nikola, Lukáš
          </p>
        </div>
      </div>
    </div>
  );
}
