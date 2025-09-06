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

  // Evitar redirección doble
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Chequear sesión
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-xl backdrop-blur p-8">
        {/* Logo centrado */}
        <div className="flex flex-col items-center">
          <Image
            src="/tecnofab-logo.svg" // 👈 pon aquí tu logo de TecnoFab
            alt="TecnoFab"
            width={200}
            height={60}
            priority
          />
          <p className="mt-4 text-slate-600 text-center">
            Inicia sesión o recupera tu contraseña para continuar.
          </p>
        </div>

        {/* Auth Supabase */}
        <div className="mt-8">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
              style: {
                button: { background: "#00b38a", borderRadius: "12px" }, // verde corporativo
                input: { borderRadius: "10px" },
              },
            }}
            redirectTo={
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : "https://liwa-web.vercel.app/auth/callback"
            }
            view="sign_in"
            localization={{
              variables: {
                sign_in: {
                  email_label: "Email",
                  password_label: "Contraseña",
                  button_label: "Entrar",
                },
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
