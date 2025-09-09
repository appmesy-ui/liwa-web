"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthSync() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      // Sin sesión -> proteger (excepto /signin y /auth/callback)
      if (!session && pathname !== "/signin" && !pathname.startsWith("/auth/callback")) {
        if (!cancelled) router.replace("/signin");
        return;
      }

      // Con sesión -> evitar quedarse en /signin
      if (session && pathname === "/signin") {
        if (!cancelled) router.replace("/dashboard");
      }
    };

    // Chequeo inicial
    check();

    // Escuchar cambios de auth
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Dar tiempo a que se hidrate sesión en cliente
        setTimeout(() => !cancelled && check(), 300);
      } else {
        !cancelled && check();
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, [pathname, router, supabase]);

  return null;
}


