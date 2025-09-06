"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SigninPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true); // Track session check

  // Session check to redirect to /dashboard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsLoading(false); // Session check complete
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

  // Custom theme for Supabase Auth UI
  const customTheme = {
    ...ThemeSupa,
    variables: {
      default: {
        colors: {
          brand: "#3b82f6", // Blue accent
          brandAccent: "#2563eb",
          inputBackground: "rgba(255, 255, 255, 0.9)",
          inputBorder: "rgba(203, 213, 225, 0.5)",
          inputText: "#1e293b",
          inputLabelText: "#475569",
          buttonText: "#ffffff",
        },
        radii: {
          borderRadiusButton: "0.5rem",
          inputBorderRadius: "0.5rem",
        },
        fonts: {
          bodyFontFamily: "'Inter', sans-serif",
          buttonFontFamily: "'Inter', sans-serif",
          inputFontFamily: "'Inter', sans-serif",
          labelFontFamily: "'Inter', sans-serif",
        },
      },
    },
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white/30 shadow-2xl backdrop-blur-md border border-white/20 p-8 transform transition-all hover:scale-[1.02] duration-300">
        {/* Logo and Header */}
        <div className="flex flex-col items-center text-center">
          <Image
            src="/liwa.svg"
            alt="</> LIWA"
            width={170}
            height={44}
            priority
            className="mb-4 transform hover:scale-105 transition-transform duration-200"
          />
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
            Welcome to Liwa
          </h1>
          <p className="mt-2 text-sm text-gray-500 max-w-xs">
            Sign in or reset your password to continue.
          </p>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="mt-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-t-blue-500 border-gray-200 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="mt-8">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              appearance={{ theme: customTheme }}
              redirectTo={`${origin}/auth/callback`}
            />
          </div>
        )}
      </div>

      {/* Optional Footer */}
      <footer className="absolute bottom-4 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Liwa. All rights reserved.
      </footer>
    </main>
  );
}
