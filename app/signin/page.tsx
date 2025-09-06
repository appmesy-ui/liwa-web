// app/signin/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SigninPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Evitar redirección doble
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Chequear sesión + escuchar cambios
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

  // Reset de contraseña (redirige a /auth/callback?type=recovery)
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

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "https://liwa-web.vercel.app";

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      {/* blobs suaves */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-lime-200/40 blur-3xl" />
      </div>

      {/* contenedor centrado */}
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* tarjeta */}
          <div className="rounded-2xl border border-emerald-100 bg-white/90 shadow-xl backdrop-blur">
            <div className="p-8">
              {/* encabezado centrado */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <Image
                    src="/liwa.svg"
                    alt="</> LIWA"
                    width={28}
                    height={28}
                    priority
                    className="h-7 w-7"
                  />
                  <span className="text-lg font-semibold tracking-tight text-slate-900">
                    LIWA
                  </span>
                </div>

                <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight text-slate-900">
                  Accede a Liwa
                </h1>
                <p className="text-center text-sm text-slate-600">
                  Inicia sesión o recupera tu contraseña para continuar.
                </p>
              </div>

              {/* Auth UI (email/password) */}
              <div className="mt-8">
                <Auth
                  supabaseClient={supabase}
                  providers={[]}
                  redirectTo={`${origin}/auth/callback`}
                  view="sign_in"
                  localization={{
                    variables: {
                      sign_in: { email_label: "Email", password_label: "Contraseña" },
                    },
                  }}
                  appearance={{
                    theme: ThemeSupa,
                    variables: {
                      default: {
                        colors: {
                          brand: "#22c55e",        // emerald-500
                          brandAccent: "#16a34a",  // emerald-600
                          inputText: "#0f172a",
                          inputBorder: "#e2e8f0",
                          inputBackground: "#ffffff",
                        },
                        radii: {
                          borderRadiusButton: "0.75rem",
                          inputBorderRadius: "0.75rem",
                        },
                      },
                    },
                    className: {
                      container: "space-y-4",
                      label: "text-slate-700 font-medium",
                      input:
                        "h-11 rounded-xl border-slate-300 focus:ring-2 focus:ring-emerald-400",
                      button:
                        "h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium",
                      anchor:
                        "text-slate-700 hover:text-slate-900 underline underline-offset-4",
                      message: "text-sm",
                    },
                  }}
                />
              </div>

              {/* Reset password manual (UI del snippet de ayer) */}
              <div className="mt-8 border-t border-slate-200 pt-6">
                <h2 className="text-center text-base font-medium text-slate-800">
                  ¿Olvidaste tu contraseña?
                </h2>
                <form className="mt-3 flex gap-2" onSubmit={onSendReset}>
                  <input
                    type="email"
                    className="flex-1 h-11 rounded-xl border border-slate-300 px-3 outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="tu@correo.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="h-11 rounded-xl bg-emerald-600 px-4 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {sending ? "Enviando..." : "Enviar link"}
                  </button>
                </form>
                {resetMsg && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
                    {resetMsg}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* pie */}
          <p className="mt-4 text-center text-xs text-slate-400">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      </div>
    </main>
  );
}
