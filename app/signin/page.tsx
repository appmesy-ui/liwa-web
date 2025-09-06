// app/signin/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

// 👇 OJO: NO exportamos revalidate ni dynamic aquí.
// Es un client component simple, sin fetch con opciones "next:".

export default function SigninPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  // Si ya hay sesión, mandamos a /dashboard
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-8">
        <div className="flex flex-col items-center">
          <Image src="/liwa.svg" alt="</> LIWA" width={170} height={44} priority />
          <h1 className="mt-4 text-xl font-semibold text-slate-800">Accede a Liwa</h1>
          <p className="mt-1 text-sm text-slate-500">Inicia sesión o recupera tu contraseña.</p>
        </div>

        <div className="mt-6">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{ theme: ThemeSupa }}
            redirectTo={`${origin}/auth/callback`}
          />
        </div>
      </div>
    </main>
  );
}
