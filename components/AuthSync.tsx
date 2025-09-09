// components/AuthSync.tsx
"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client"; // ajusta ruta si usas alias "@/"

export default function AuthSync() {
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await fetch("/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ event, session }),
        });
      }
    );
    return () => subscription?.unsubscribe();
  }, [supabase]);

  return null;
}
