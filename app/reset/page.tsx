// app/reset/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function ResetPage() {
  const supabase = getSupabaseBrowserClient();

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
            Recupera el acceso a tu cuenta.
          </p>
        </div>

        {/* Formulario Supabase - Reset password */}
        <div className="w-full max-w-sm mx-auto">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            view="forgotten_password"
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
                  background:
                    "linear-gradient(180deg, #52A8FF 0%, #2383E2 100%)",
                  color: "#FFFFFF",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 6px 18px rgba(34,139,230,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
                  height: "44px",
                },
                container: { rowGap: "14px" },
                input: {
                  background: "#0B1220",
                  border: "1px solid #334155",
                  color: "#E5E7EB",
                  borderRadius: "12px",
                  height: "44px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
                },
                label: { color: "#96A3B3", fontSize: "13px" },
                anchor: { color: "#93C5FD", fontSize: "12px", opacity: 0.9 },
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
                forgotten_password: {
                  email_label: "Email",
                  button_label: "Enviar enlace",
                  confirmation_text:
                    "Te enviamos un enlace para restablecer tu contraseña.",
                },
              },
            }}
          />

          {/* Enlaces de navegación */}
          <div className="mt-4 text-center space-x-4">
            <Link href="/signin" className="text-sky-300 text-sm hover:underline">
              Volver a iniciar sesión
            </Link>
            <span className="text-slate-600">•</span>
            <Link href="/signup" className="text-sky-300 text-sm hover:underline">
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
