"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [msg, setMsg] = useState<string | null>(null);

  // Redirigir solo una vez
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Solo cuando realmente ocurre SIGNED_IN
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // pequeño margen por seguridad
        setTimeout(goDashOnce, 200);
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, [supabase]);

  // Flash message
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flash = sessionStorage.getItem("signin_flash");
    if (flash === "reset_ok") {
      setMsg("✅ Contraseña actualizada, inicia sesión con la nueva.");
      sessionStorage.removeItem("signin_flash");
    }
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-10 flex flex-col items-center text-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image src="/liwa-logo.svg" alt="LIWA" width={200} height={60} priority className="mx-auto" />
          <p className="mt-2 text-slate-400 text-xs md:text-sm">Inicia sesión para continuar.</p>
        </div>

        {/* Mensaje flash */}
        {msg && (
          <div className="relative w-full rounded-lg bg-green-100/90 text-green-900 text-sm pl-3 pr-9 py-2 text-left border border-green-200">
            {msg}
            <button onClick={() => setMsg(null)} aria-label="Cerrar aviso" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-green-900/80 hover:bg-white/50 hover:text-green-900 transition">
              ✕
            </button>
          </div>
        )}

        {/* Formulario Supabase Auth */}
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
                    brand: "#0EA5E9",
                    brandAccent: "#1E40AF",
                    inputBackground: "#0B1220",
                    inputBorder: "#334155",
                    inputText: "#E5E7EB",
                  },
                  radii: { borderRadiusButton: "14px", inputBorderRadius: "12px" },
                },
              },
            }}
            localization={{
              variables: {
                sign_in: { email_label: "Email", password_label: "Contraseña", button_label: "Entrar" },
                forgotten_password: { link_text: "¿Olvidaste tu contraseña?" },
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}

