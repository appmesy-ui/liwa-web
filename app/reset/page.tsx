// app/reset/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function ResetPage() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setStatus("sending");
      setMsg(null);

      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?type=recovery`,
      });

      if (error) {
        setStatus("err");
        setMsg(error.message);
      } else {
        setStatus("ok");
        setMsg("Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.");
      }
    } catch (err: any) {
      setStatus("err");
      setMsg(err?.message ?? "Ha ocurrido un error.");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white/90 shadow-2xl backdrop-blur-md p-8">
        <h1 className="text-xl font-semibold text-slate-800 text-center">Reset password</h1>
        <p className="text-sm text-slate-500 text-center mt-1">
          Ingresa tu email y te enviaremos un enlace para restablecerla.
        </p>

        <form onSubmit={onSubmit} className="space-y-4 mt-6">
          <label className="block text-sm text-slate-600">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="tucorreo@ejemplo.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-lg px-4 py-2 border border-slate-200 bg-slate-900 text-white hover:opacity-90 disabled:opacity-60"
          >
            {status === "sending" ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        {msg && (
          <div
            className={`mt-4 text-sm ${status === "ok" ? "text-green-600" : "text-red-600"}`}
          >
            {msg}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
          <Link href="/signin" className="hover:underline">
            ← Volver a Sign in
          </Link>
          <Link href="/signup" className="hover:underline">
            Crear cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
