// app/signin/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-10 flex flex-col items-center text-center">
        {/* Logo LIWA */}
        <Image
          src="/liwa-logo.svg"
          alt="LIWA"
          width={220}
          height={70}
          priority
        />

        {/* Texto de bienvenida */}
        <p className="mt-4 text-slate-300 text-sm">
          Inicia sesión para continuar.
        </p>

        {/* Formulario Supabase Auth */}
        <div className="mt-8 w-full">
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
                    brand: "#0EA5E9",
                    brandAccent: "#1E40AF",
                    inputBackground: "#0B1220",
                    inputText: "#E5E7EB",
                    messageText: "#93C5FD",
                    anchorTextColor: "#93C5FD",
                    defaultButtonBackground: "#0EA5E9",
                    defaultButtonBackgroundHover: "#1D4ED8",
                    defaultButtonText: "#FFFFFF",
                  },
                  radii: {
                    borderRadiusButton: "12px",
                    inputBorderRadius: "10px",
                  },
                },
              },
              style: {
                button: {
                  background: "#0EA5E9",
                  color: "#FFFFFF",
                  borderRadius: "12px",
                },
                input: {
                  background: "#0B1220",
                  border: "1px solid #334155",
                  color: "#E5E7EB",
                  borderRadius: "10px",
                },
                anchor: { color: "#93C5FD" },
                message: { color: "#93C5FD" },
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
        </div>
      </div>
    </main>
  );
}
