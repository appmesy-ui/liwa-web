// app/signup/page.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SignUpPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

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
            src="/liwa-logo.svg"
            alt="LIWA"
            width={200}
            height={60}
            priority
            className="mx-auto"
          />
          <p className="mt-2 text-slate-400 text-xs md:text-sm">
            Crea tu cuenta para empezar.
          </p>
        </div>

        {/* Formulario Supabase - Sign Up */}
        <div className="w-full max-w-sm mx-auto">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            view="sign_up"
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
                  },
                },
              },
            }}
            localization={{
              variables: {
                sign_up: {
                  email_label: "Email",
                  password_label: "Contraseña",
                  button_label: "Crear cuenta",
                  link_text: "¿Ya tienes cuenta? Inicia sesión",
                  confirmation_text:
                    "Revisa tu correo para confirmar y continuar.",
                  // 👇 forzamos placeholders
                  ...( {
                    email_input_placeholder: "Tu email",
                    password_input_placeholder: "Crea una contraseña",
                  } as any ),
                },
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
