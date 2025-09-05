"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client"; // <-- ruta nueva

export default function LoginPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-4">LIWA — Acceso</h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}  // solo email+password por ahora
          redirectTo={`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}
          onlyThirdPartyProviders={false}
        />
        <p className="text-xs text-gray-500 mt-4">
          Usa tu email y contraseña. (Luego añadimos SSO/Providers)
        </p>
      </div>
    </main>
  );
}
