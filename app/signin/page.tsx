// app/signin/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SigninPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  // Si ya hay sesión, manda al dashboard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace("/dashboard");
    });
    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* adorno sutil */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      {/* contenedor centrado */}
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* tarjeta */}
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-xl backdrop-blur-md">
            <div className="p-8">
              {/* encabezado */}
              <div className="flex items-center gap-3">
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
                  providers={[]}
                  redirectTo={`${origin}/auth/callback`}
                  // Estilo moderno
                  appearance={{
                    theme: ThemeSupa,
                    variables: {
                      default: {
                        colors: {
                          brand: "#0ea5e9", // cyan-500
                          brandAccent: "#0284c7", // sky-600
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
                      anchor:
                        "text-slate-700 hover:text-slate-900 underline underline-offset-4",
                      button:
                        "bg-sky-500 hover:bg-sky-600 text-white h-10 rounded-xl",
                      input:
                        "h-10 rounded-xl border-slate-300 focus:ring-2 focus:ring-sky-400",
                      label: "text-slate-700 font-medium",
                      message: "text-sm",
                    },
                  }}
                />
              </div>

              {/* pie */}
              <p className="mt-6 text-center text-xs text-slate-500">
                ¿Problemas para ingresar?{" "}
                <a
                  href="mailto:soporte@liwa.app"
                  className="font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900"
                >
                  Contacta soporte
                </a>
              </p>
            </div>
          </div>

          {/* aviso pequeño */}
          <p className="mt-4 text-center text-xs text-slate-400">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      </div>
    </main>
  );
}
