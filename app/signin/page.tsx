// app/signin/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

function getSiteUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export default function SigninPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) router.replace("/dashboard");
    })();
    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const origin = getSiteUrl();

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50">
      {/* fondo sutil */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-6rem] h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>

      {/* TARJETA CENTRADA */}
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl border border-emerald-200/50 bg-white/90 shadow-[0_20px_60px_-20px_rgba(16,185,129,0.35)] backdrop-blur">
            <div className="p-8">
              {/* Logo grande y marca */}
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                  <Image
                    src="/liwa.svg"
                    alt="</> LIWA"
                    width={40}
                    height={40}
                    priority
                    className="h-10 w-10"
                  />
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                  LIWA
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Accede para continuar
                </p>
              </div>

              {/* Auth UI compacto */}
              <div className="mt-7">
                <Auth
                  supabaseClient={supabase}
                  providers={[]} // agrega Google si quieres: ["google"]
                  redirectTo={`${origin}/auth/callback`}
                  appearance={{
                    theme: ThemeSupa,
                    variables: {
                      default: {
                        colors: {
                          brand: "#10b981",       // emerald-500
                          brandAccent: "#059669", // emerald-600
                          inputText: "#0f172a",
                          inputBorder: "#e2e8f0",
                          inputBackground: "#ffffff",
                        },
                        radii: {
                          borderRadiusButton: "0.875rem",
                          inputBorderRadius: "0.875rem",
                        },
                        space: {
                          buttonPadding: "0.625rem 1rem",
                          inputPadding: "0.625rem 0.875rem",
                        },
                      },
                    },
                    className: {
                      container: "space-y-3",
                      label: "text-slate-700 text-sm font-medium",
                      input:
                        "h-10 rounded-xl border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300",
                      button:
                        "h-10 rounded-xl font-medium shadow-sm hover:shadow transition-shadow",
                      anchor:
                        "text-emerald-700 hover:text-emerald-900 underline underline-offset-4",
                      message: "text-sm",
                    },
                  }}
                />
              </div>

              {/* ayuda */}
              <p className="mt-6 text-center text-xs text-slate-500">
                ¿Problemas para ingresar?{" "}
                <a
                  href="mailto:soporte@liwa.app"
                  className="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900"
                >
                  Contacta soporte
                </a>
              </p>
            </div>
          </div>

          {/* mini disclaimer */}
          <p className="mt-4 text-center text-xs text-slate-400">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      </div>
    </main>
  );
}
