"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const PUBLIC_PREFIXES = ["/login", "/auth/callback"];

export default function AuthSync() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // 🔹 Se dispara una sola vez al montar con el estado real de la sesión
      if (event === "INITIAL_SESSION") {
        if (!session && !isPublic) {
          const next = encodeURIComponent(pathname || "/dashboard");
          router.replace(`/login?next=${next}`);
          return;
        }
        if (session && pathname === "/login") {
          const url = new URL(typeof window !== "undefined" ? window.location.href : "http://x");
          const next = url.searchParams.get("next") || "/dashboard";
          router.replace(next);
        }
      }

      // 🔹 Cambios posteriores (login/logout)
      if (event === "SIGNED_IN") {
        const url = new URL(typeof window !== "undefined" ? window.location.href : "http://x");
        const next = url.searchParams.get("next") || "/dashboard";
        router.replace(next);
      }
      if (event === "SIGNED_OUT") {
        const next = encodeURIComponent(pathname || "/dashboard");
        router.replace(`/login?next=${next}`);
      }
      // TOKEN_REFRESHED / USER_UPDATED → no-op
    });

    return () => sub.subscription.unsubscribe();
  }, [pathname, router, supabase]);

  return null;
}
