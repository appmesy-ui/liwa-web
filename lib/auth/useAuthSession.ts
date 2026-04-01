"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabase/client";

export function useAuthSession() {
  const [status, setStatus] = useState<"loading" | "authed" | "unauthed">("loading");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setStatus(data.session ? "authed" : "unauthed");
      } catch {
        if (!cancelled) setStatus("unauthed");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setStatus(session ? "authed" : "unauthed");
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return status;
}
