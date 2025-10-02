"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/**
 * SignInPage (solo acceso):
 * - No existe opción de "Crear cuenta".
 * - Redirige si ya hay sesión.
 * - Respeta ?next=/ruta para redirección post-login.
 */
export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient();

  // Si viene ?next, usarlo; si no, /dashboard
  const nextRef = useRef(sp.get("next") || "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si ya hay sesión activa, redirigir de inmediato
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) router.replace(nextRef.current);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(nextRef.current);
    } catch (e: any) {
      // Mensaje controlado sin filtrar detalles sensibles
      setErr(
        e?.message?.includes("Invalid login credentials") ||
        e?.message?.toLowerCase?.().includes("invalid")
          ? "Email o contraseña no válidos."
          : "No se pudo iniciar sesión. Inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !loading;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-10 flex flex-col items-center text-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image
            src="/liwa-logo.svg"
            alt="LIWA"
            width={200}
            height={60}
            priority
            className="mx-auto"
          />
          <p className="mt-2 text-slate-400 text-xs md:text-sm">
            Inicia sesión para continuar.
          </p>
        </div>

        {/* Error */}
        {err && (
          <div
            role="alert"
            className="w-full rounded-lg border border-red-800 bg-red-900/30 p-3 text-red-200 text-sm text-left"
          >
            {err}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto text-left">
          <label htmlFor="email" className="block text-sm mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-md bg-slate-800 px-3 py-2 outline-none border border-slate-700 focus:border-sky-600"
            placeholder="you@example.com"
            inputMode="email"
          />

          <label htmlFor="password" className="block text-sm mb-1">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-md bg-slate-800 px-3 py-2 outline-none border border-slate-700 focus:border-sky-600"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-sky-500 px-4 py-2 font-medium hover:bg-sky-600 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Acciones secundarias */}
        <div className="flex flex-col items-center gap-2">
          <a href="/forgot" className="text-slate-400 text-sm hover:underline">
            ¿Olvidaste tu contraseña?
          </a>

          {/* Mensaje informativo para 'solo acceso' */}
          <p className="text-slate-500 text-xs">
            La creación de cuentas está deshabilitada. Solicita acceso a tu administrador.
          </p>
        </div>
      </div>
    </main>
  );
}
