"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { useAuthSession } from "../../lib/auth/useAuthSession";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const status = useAuthSession();

  // Anti doble navegación
  const navigated = useRef(false);
  const safeReplace = (path: string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(path);
  };

  // Si YA está autenticado, redirige UNA vez y no renderices el formulario
  if (status === "authed") {
    safeReplace("/dashboard");
    return (
      <main className="min-h-screen overflow-y-scroll grid place-items-center">
        <p className="text-slate-600">Entrando…</p>
      </main>
    );
  }

  // Cargando estado → skeleton (no muestres login aún para evitar flash)
  if (status === "loading") {
    return (
      <main className="min-h-screen overflow-y-scroll grid place-items-center">
        <p className="text-slate-600">Comprobando sesión…</p>
      </main>
    );
  }

  // status === "unauthed" → ahora sí muestra el login
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginMsg(null);
    if (!email || !pwd) {
      setLoginMsg("Escribe tu email y contraseña.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      });
      if (error) throw error;

      // Cuando cambie el estado a 'authed', el render superior hará el replace (sin bucles)
    } catch (err: any) {
      setLoginMsg(err?.message || "No pudimos iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const onSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    if (!resetEmail) {
      setResetMsg("Escribe tu email.");
      return;
    }
    try {
      setSending(true);
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://liwa-web.vercel.app";

      await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${origin}/auth/callback?type=recovery`,
      });
      setResetMsg(
        "Te enviamos un email con el enlace para restablecer tu contraseña."
      );
    } catch (err: any) {
      setResetMsg(err?.message || "No pudimos enviar el correo de recuperación.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen overflow-y-scroll flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-8">
        <div className="flex flex-col items-center">
          <Image src="/liwa.svg" alt="</> LIWA" width={170} height={40} />
          <h1 className="mt-4 text-xl font-semibold">Iniciar sesión</h1>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSignIn}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="********"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {loginMsg && (
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">
              {loginMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-8 border-t pt-6">
          <h2 className="text-base font-medium">¿Olvidaste tu contraseña?</h2>
          <form className="mt-3 flex gap-2" onSubmit={onSendReset}>
            <input
              type="email"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="tu@correo.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-xl bg-slate-900 text-white px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {sending ? "Enviando..." : "Enviar link"}
            </button>
          </form>
          {resetMsg && (
            <p className="mt-2 text-sm text-slate-700 bg-slate-50 rounded-lg p-2">
              {resetMsg}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
