"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

type Stage = "checking" | "recovery" | "done" | "error";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [stage, setStage] = useState<Stage>("checking");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // URL completa y helpers
      const href =
        typeof window !== "undefined" ? window.location.href : "http://localhost";
      const url = new URL(href);
      const hash = url.hash || "";                // p.ej. #access_token=...&type=recovery
      const q = url.searchParams;                 // p.ej. ?code=...&type=recovery

      // Detectar tipo y errores desde query o hash
      const hParams = new URLSearchParams(hash.replace(/^#/, ""));
      const type = q.get("type") || hParams.get("type");
      const err = q.get("error") || hParams.get("error");
      const errCode = q.get("error_code") || hParams.get("error_code");
      const errDesc = q.get("error_description") || hParams.get("error_description");

      if (err || errCode) {
        if (mounted) {
          setMsg(errDesc || "El enlace es inválido o ha expirado. Solicita uno nuevo.");
          setStage("error");
        }
        return;
      }

      try {
        // ===== Intercambiar el enlace por sesión =====
        // 1) Formato nuevo (PKCE): ?code=...
        // 2) Formato antiguo (fragment): #access_token=...
        const code = q.get("code");
        let exchError: any = null;

        if (code) {
          ({ error: exchError } = await supabase.auth.exchangeCodeForSession({ code }));
        } else if (hash) {
          ({ error: exchError } = await supabase.auth.exchangeCodeForSession(hash));
        } else {
          throw new Error("No auth params found in URL");
        }
        if (exchError) throw exchError;

        const { data } = await supabase.auth.getSession();
        const hasSession = !!data.session;

        if (type === "recovery") {
          if (mounted) {
            if (hasSession) setStage("recovery");
            else {
              setMsg("No se pudo validar la sesión de recuperación. Solicita un nuevo enlace.");
              setStage("error");
            }
          }
          return;
        }

        // Otros tipos (signup/magiclink/verify)
        if (mounted) {
          setStage("done");
          router.replace(hasSession ? "/dashboard" : "/login");
        }
      } catch (e: any) {
        console.error(e);
        if (mounted) {
          setMsg(e?.message ?? "No pudimos procesar el enlace. Solicita uno nuevo.");
          setStage("error");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (pwd.length < 8) return setMsg("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return setMsg("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return setMsg(error.message);

    setStage("done");
    await supabase.auth.signOut();          // cerrar sesión de recuperación
    router.replace("/login?reset=ok");      // volver al login con aviso
  };

  // ======= UI =======

  if (stage === "checking") {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-slate-600 text-sm">Procesando autenticación…</div>
      </main>
    );
  }

  if (stage === "error") {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow">
          <h1 className="text-xl font-semibold mb-2">Enlace inválido</h1>
          <p className="text-sm text-slate-600 mb-4">
            {msg ?? "El enlace es inv
