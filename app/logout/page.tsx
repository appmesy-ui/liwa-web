"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function LogoutPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch {}
      try {
        // Limpia cualquier token local de Supabase en este dominio
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("sb-") || k.includes("supabase")) localStorage.removeItem(k);
        });
      } catch {}
      router.replace("/login");
    })();
  }, [router, supabase]);

  return (
    <main className="min-h-screen grid place-items-center">
      <p className="text-slate-600">Cerrando sesión…</p>
    </main>
  );
}
