// app/auth/callback/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = false;

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

type Stage = "checking" | "recovery" | "done";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [stage, setStage] = useState<Stage>("checking");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  // evitar redirecciones dobles
  const navigated = useRef(false);
  const safeReplace = (path: string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(path);
  };

  useEffect(() => {
    let mounted = true;

    const getParams = () => {
      const href = typeof window !== "undefined" ? window.location.href : "http://localhost";
      const url = new URL(href);
      const q = url.searchParams;
      const hash = url.hash || "";
      const h = new URLSearchParams(hash.replace(/^#/, ""));
      const get = (k: string) => q.get(k) || h.get(k);
      return {
        type: get("type"),
        token_hash: get("token_hash"),
      };
    };

    (async () => {
      const { type, token_hash } = getParams();

      // Solo atendemos recuperación con token_hash (flujo fiable)
      if (type !== "recovery" || !token_hash) {
        safeReplace("/login");
        return;
      }

      // 1) Verificar el token y crear sesión temporal de recuperación
      const { error } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash,
      } as any);

      if (error) {
        safeReplace("/login?reason=recovery_token_invalid");
        return;
      }

      // 2) Mostrar formulario de nueva contraseña
      if (mounted) setStage("recovery");
    })();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  // Guardar nueva contraseña
  const onSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return alert("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return alert("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return alert(error.message || "No se pudo actualizar la contraseña.");
    safeReplace("/login?reset=ok");
  };

  return (
    <main className="min-h-screen overflow-y-scroll flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-6">
        {stage === "checking" && (
          <div className="text-center">
            <h1 className="text-xl font-semibold">Procesando enlace…</h1>
            <p className="text-slate-600 mt-2">Un momento por favor.</p>
          </div>
        )}

        {stage === "recovery" && (
          <div>
            <h1 className="text-xl font-semibold">Crear nueva contraseña</h1>
            <p className="text-slate-600 mt-2">Ingresa tu nueva contraseña y confírmala.</p>

            <form className="mt-4 space-y-4" onSubmit={onSubmitNewPassword}>
              <div>
                <l
