"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { validateCredentials, saveSession } from "@/lib/auth";

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

    const user = validateCredentials(username, password);
    if (!user) {
      setError("Neplatné přihlašovací údaje");
      setLoading(false);
      return;
    }

    saveSession(user);
    
    // Set OneSignal external user ID for targeted notifications
    try {
      if (typeof window !== 'undefined' && (window as any).OneSignalDeferred) {
        (window as any).OneSignalDeferred.push(async function(OneSignal: any) {
          await OneSignal.login(user.displayName);
          console.log('OneSignal user ID set:', user.displayName);
        });
      }
    } catch (e) {
      console.warn("OneSignal login failed:", e);
    }

    router.push("/");
    router.refresh();
  };



  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
      <div className="bg-zinc-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Firemní úkoly
        </h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          Přihlaste se svým jménem
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Jméno
            </label>
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
            <label className="block text-sm text-gray-300 mb-2">
              Heslo
            </label>
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
            <div className="bg-red-600/20 border border-red-600 rounded-lg px-4 py-3 text-sm text-red-200">
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

        <div className="mt-8 pt-6 border-t border-zinc-700">
          <p className="text-xs text-gray-500 text-center">
            Uživatelé: Milan (majitel), Miloš, Karina, Kateřina, Vendula, Viktor, Nikola
          </p>
        </div>
      </div>
    </div>
  );
}
