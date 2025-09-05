"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabase/client";

/**
 * Devuelve el estado de autenticación del usuario y evita carreras:
 * - 'loading' mientras consulta
 * - 'authed' si hay sesión
 * - 'unauthed' si no hay sesión
 */
export function useAuthSession() {
  const supabase = getSupabaseBrowserClient();
  const [status, setStatus] = useState<"loading" | "authed" | "unauthed">("loading");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted.current) return;
        setStatus(data.session ? "authed" : "unauthed");
      } catch {
        if (!mounted.current) return;
        setStatus("unauthed");
      }
    })();

    // Nos suscribimos solo para ACTUALIZAR estado, no para navegar
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      setStatus(session ? "authed" : "unauthed");
    });

    return () => {
      mounted.current = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  return status;
}
