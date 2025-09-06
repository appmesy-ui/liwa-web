// app/signin/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Evitar doble redirección
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Chequear sesión activa
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-10 flex flex-col items-center text-center gap-6">
        {/* Logo + subtítulo */}
        <div className="flex flex-col items-center">
          <Image
            src="/liwa-logo.svg" // o /liwa.svg si así lo tienes
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

        {/* Formulario Supabase Auth centrado */}
        <div className="w-full max-w-sm mx-auto">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            view="sign_in"
            redirectTo={
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : "https://liwa-web.vercel.app/auth/callback"
            }
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#0EA5E9",               // base azul
                    brandAccent: "#1E40AF",         // hover/acento
                    inputBackground: "#0B1220",     // campos oscuros
                    inputBorder: "#334155",
                    inputText: "#E5E7EB",
                    messageText: "#93C5FD",
                    anchorTextColor: "#93C5FD",
                    defaultButtonText: "#FFFFFF",
                  },
                  radii: {
                    borderRadiusButton: "14px",
                    inputBorderRadius: "12px",
                  },
                },
              },
              style: {
                button: {
                  background: "linear-gradient(180deg, #52A8FF 0%, #2383E2 100%)",
                  color: "#FFFFFF",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 6px 18px rgba(34,139,230,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
                  height: "44px",
                  transition: "transform .06s ease, box-shadow .2s ease",
                },
                container: {
                  rowGap: "14px",
                },
                input: {
                  background: "#0B1220",
                  border: "1px solid #334155",
                  color: "#E5E7EB",
                  borderRadius: "12px",
                  height: "44px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
                },
                label: {
                  color: "#96A3B3",
                  fontSize: "13px",
                },
                anchor: {
                  color: "#93C5FD",
                  fontSize: "12px",
                  opacity: 0.9,
                },
                message: { color: "#93C5FD", fontSize: "12px" },
              },
              className: {
                button:
                  "hover:brightness-105 active:scale-[0.99] focus:ring-2 focus:ring-sky-400/40 focus:outline-none",
                input:
                  "focus:ring-2 focus:ring-sky-400/30 focus:border-sky-500/60 outline-none",
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: "Email",
                  password_label: "Contraseña",
                  button_label: "Entrar",
                },
                forgotten_password: {
                  link_text: "¿Olvidaste tu contraseña?",
                },
              },
            }}
          />

          {/* Enlaces controlados (nuestro “Forgot your password?” a /reset) */}
          <div className="mt-4 flex items-center justify-between text-xs md:text-sm text-slate-300">
            <Link href="/signup" className="hover:underline">
              Crear cuenta
            </Link>
            <Link href="/reset" className="hover:underline">
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
