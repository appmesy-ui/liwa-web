// app/signin/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

function getSiteUrl() {
  // Evita problemas SSR y asegura una URL válida para Supabase
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export default function SigninPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  // Si ya hay sesión, manda al dashboard
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
    <main className="relative min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      {/* blobs decorativos */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-teal-200/40 blur-3xl" />
      </div>

      {/* contenedor centrado */}
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* tarjeta */}
          <div className="rounded-3xl border border-emerald-200/50 bg-white/90 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.25)] backdrop-blur-md">
            <div className="p-8">
              {/* header */}
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
                  <Image
                    src="/liwa.svg"
                    alt="</> LIWA"
                    width={24}
                    height={24}
                    priority
                    className="h-6 w-6"
                  />
                </span>
                <span className="text-xl font-semibold tracking-tight text-slate-900">
                  LIWA
                </span>
              </div>

              <h1 className="mt-6 text-2xl font-semibold leading-none tracking-tight text-slate-900">
                Accede a Liwa
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Inicia sesión o recupera tu contraseña para continuar.
              </p>

              {/* Auth UI */}
              <div className="mt-8">
                <Auth
                  supabaseClient={supabase}
                  providers={[]} // añade proveedores si quieres OAuth
                  redirectTo={`${origin}/auth/callback`}
                  appearance={{
                    theme: ThemeSupa,
                    variables: {
                      default: {
                        colors: {
                          brand: "#10b981",        // emerald-500
                          brandAccent: "#059669",  // emerald-600
                          inputText: "#0f172a",
                          inputBorder: "#e2e8f0",
                          inputBackground: "#ffffff",
                        },
                        radii: {
                          borderRadiusButton: "0.75rem",
                          inputBorderRadius: "0.75rem",
                        },
                        space: {
                          buttonPadding: "0.625rem 1rem",
                          inputPadding: "0.625rem 0.875rem",
                        },
                      },
                    },
                    className: {
                      container: "space-y-4",
                      anchor:
                        "text-slate-700 hover:text-slate-900 underline underline-offset-4",
                      button:
                        "h-10 rounded-xl font-medium shadow-sm hover:shadow transition-shadow",
                      input:
                        "h-10 rounded-xl border-slate-300 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400",
                      label: "text-slate-700 font-medium",
                      message: "text-sm",
                    },
                  }}
                />
              </div>

              {/* footer tarjeta */}
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

          {/* aviso legal */}
          <p className="mt-4 text-center text-xs text-slate-400">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      </div>
    </main>
  );
}
