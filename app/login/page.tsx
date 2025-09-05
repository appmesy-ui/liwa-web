"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client"; // <= debe ser ../../

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
        {/* Logo + título */}
        <div className="flex flex-col items-center mb-4">
          <Image src="/liwa.svg" alt="LIWA" width={128} height={32} priority />
          <h1 className="text-2xl font-semibold mt-3">LIWA — Acceso</h1>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "#14B8A6",       // teal
                  brandAccent: "#0D9488", // teal más oscuro
                },
                radii: {
                  inputBorderRadius: "12px",
                  buttonBorderRadius: "12px",
                },
              },
            },
          }}
          providers={[]} // seguimos con email+password
          redirectTo={`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}
          onlyThirdPartyProviders={false}
        />

        <p className="text-xs text-gray-500 mt-4 text-center">
          Usa tu email y contraseña.
        </p>
      </div>
    </main>
  );
}
