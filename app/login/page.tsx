"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image src="/liwa.svg" alt="</> LIWA" width={170} height={48} priority />
        </div>

        {/* Título */}
        <h1 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
          Acceso
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Entra con tu email y contraseña
        </p>

        {/* Auth */}
        <div className="mt-6">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#14B8A6",
                    brandAccent: "#0D9488",
                  },
                  radii: {
                    inputBorderRadius: "12px",
                    buttonBorderRadius: "9999px",
                  },
                },
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: "Email",
                  password_label: "Contraseña",
                  button_label: "Entrar",
                  link_text: "¿Ya tienes cuenta? Inicia sesión",
                },
                sign_up: {
                  email_label: "Email",
                  password_label: "Contraseña",
                  button_label: "Crear cuenta",
                  link_text: "¿No tienes cuenta? Regístrate",
                },
                forgotten_password: {
                  link_text: "¿Olvidaste tu contraseña?",
                  button_label: "Restablecer",
                },
              },
            }}
            providers={[]} // solo email + password
            redirectTo={`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}
            onlyThirdPartyProviders={false}
          />
        </div>

        {/* Footer */}
        <p className="text-[11px] text-center text-slate-400 mt-6">
          © {new Date().getFullYear()} TecnoFab — LIWA
        </p>
      </div>
    </main>
  );
}
