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
    <main className="relative min-h-screen bg-[#0d1117] text-slate-200">
      {/* contenedor centrado */}
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* logo */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#161b22] ring-1 ring-[#30363d]">
              <Image
                src="/liwa.svg"
                alt="LIWA"
                width={28}
                height={28}
                className="opacity-90"
                priority
              />
            </div>
          </div>

          {/* título */}
          <h1 className="mb-3 text-center text-xl font-semibold text-slate-100">
            Sign in to LIWA
          </h1>

          {/* tarjeta estilo GitHub */}
          <div className="rounded-md border border-[#30363d] bg-[#161b22] shadow-lg">
            <div className="p-6">
              <Auth
                supabaseClient={supabase}
                providers={[]} // añade ["google"] si quieres OAuth
                redirectTo={`${origin}/auth/callback`}
                appearance={{
                  theme: ThemeSupa,
                  variables: {
                    default: {
                      colors: {
                        brand: "#238636",        // botón verde GitHub
                        brandAccent: "#2ea043",  // hover
                        inputText: "#e6edf3",    // texto input
                        inputBackground: "#0d1117",
                        inputBorder: "#30363d",
                        messageText: "#e6edf3",
                        anchorTextColor: "#58a6ff",
                      },
                      radii: {
                        inputBorderRadius: "6px",
                        borderRadiusButton: "6px",
                      },
                      space: {
                        buttonPadding: "0.625rem 1rem",
                        inputPadding: "0.625rem 0.75rem",
                      },
                    },
                  },
                  className: {
                    container: "space-y-4",
                    label: "text-slate-200 text-sm font-medium",
                    input:
                      "h-10 bg-[#0d1117] border-[#30363d] text-slate-100 placeholder-slate-400 " +
                      "focus:ring-2 focus:ring-[#1f6feb] focus:border-[#1f6feb]",
                    button:
                      "h-10 w-full bg-[#238636] hover:bg-[#2ea043] text-white font-medium " +
                      "shadow-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#2ea043]",
                    anchor:
                      "text-[#58a6ff] hover:underline underline-offset-2",
                    message: "text-sm",
                  },
                }}
              />
            </div>
          </div>

          {/* bloque inferior con enlaces (como GitHub) */}
          <div className="mt-4 rounded-md border border-[#30363d] bg-[#0d1117] px-6 py-4 text-sm text-slate-300">
            New to LIWA?{" "}
            <a
              href="/signup"
              className="text-[#58a6ff] hover:underline underline-offset-2"
            >
              Create an account
            </a>
          </div>

          {/* footer mínimo */}
          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} TecnoFab · All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
