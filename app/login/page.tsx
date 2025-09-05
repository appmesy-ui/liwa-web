"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Evitar redirección doble (vibración)
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Chequear sesión y escuchar cambios
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) goDashOnce();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_IN") goDashOnce();
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, [router, supabase]);

  // Reset de contraseña (con redirect a /auth/callback?type=recovery)
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

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setResetMsg("Te enviamos un email con el enlace para restablecer tu contraseña.");
    } catch (err: any) {
      setResetMsg(err?.message || "No pudimos enviar el correo de recuperación.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen overflow-y-scroll flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image src="/liwa.svg" alt="</> LIWA" width={170} height={40} />
          <h1 className="mt-4 text-xl font-semibold">Iniciar sesión</h1>
        </div>

        {/* Auth UI (email/password) */}
        <div className="mt-6">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            redirectTo={
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : "https://liwa-web.vercel.app/auth/callback"
            }
            appearance={{ theme: ThemeSupa }}
            view="sign_in"
            localization={{
              variables: {
                sign_in: { email_label: "Email", password_label: "Contraseña" },
              },
            }}
          />
        </div>

        {/* Reset password manual (controlamos redirectTo) */}
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
