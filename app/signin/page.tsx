// app/signin/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

// Fallback inline, por si no encuentra ningún archivo en /public
function LiwaLogoInline(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 80" width={200} height={60} aria-label="LIWA" {...props}>
      <g transform="translate(8,28) scale(0.65)" stroke="#00B3B3" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M18 2 L6 18 L18 34" />
        <path d="M28 34 L38 2" />
        <path d="M48 2 L60 18 L48 34" />
      </g>
      <text x="65" y="55" fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" fontSize="40">
        <tspan fill="#FFFFFF" fontWeight={800}>LI</tspan>
        <tspan fill="#C9CED6" fontWeight={700} dx={-8}>WA</tspan>
      </text>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Control de redirección
  const redirected = useRef(false);
  const goDashOnce = () => {
    if (redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  };

  // Si falla la primera ruta, probamos otra y luego inline
  const [logoSrc, setLogoSrc] = useState<"liwa-logo" | "liwa" | "inline">("liwa-logo");

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
        {/* Bloque logo + texto */}
        <div className="flex flex-col items-center">
          {logoSrc === "inline" ? (
            <LiwaLogoInline />
          ) : (
            <Image
              src={logoSrc === "liwa-logo" ? "/liwa-logo.svg" : "/liwa.svg"}
              alt="LIWA"
              width={200}
              height={60}
              priority
              className="mx-auto"
              onError={() => setLogoSrc(logoSrc === "liwa-logo" ? "liwa" : "inline")}
            />
          )}

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
                button: { background: "#0EA5E9", color: "#FFFFFF", borderRadius: "12px" },
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
                forgotten_password: { link_text: "¿Olvidaste tu contraseña?" },
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
