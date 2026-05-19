"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Error inesperado");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-[400px] mx-auto px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-emerald-600/10 ring-1 ring-emerald-500/20 mb-5">
            <Activity className="size-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Recuperar contraseña</h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            Te enviaremos un enlace para restablecerla.
          </p>
        </div>

        {submitted ? (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 text-sm text-zinc-300">
            Si existe una cuenta asociada a <span className="text-zinc-100">{email}</span>,
            recibirás un correo con instrucciones en breve.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
            {error && (
              <div className="bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}
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
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 transition-all duration-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {loading ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-zinc-600 mt-5">
          <Link href="/auth/signin" className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-2">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
