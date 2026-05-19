"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Credenciales inválidas. Verifica tu email y contraseña.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-[400px] mx-auto px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-emerald-600/10 ring-1 ring-emerald-500/20 mb-5">
            <Activity className="size-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Football AI Analyzer</h1>
          <p className="text-sm text-zinc-500 mt-1.5">Accede a tu cuenta para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
          {error && (
            <div className="bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                placeholder="admin@football-ai.com"
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </form>

        <div className="flex justify-between text-xs text-zinc-600 mt-5">
          <Link href="/auth/forgot" className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-2">
            ¿Olvidaste tu contraseña?
          </Link>
          <Link href="/auth/register" className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-2">
            Regístrate
          </Link>
        </div>
      </div>
    </div>
  );
}
