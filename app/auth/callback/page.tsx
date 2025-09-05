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
      try {
        // URL actual
        const href =
          typeof window !== "undefined" ? window.location.href : "http://localhost";
        const url = new URL(href);

        // Dos formatos posibles:
        // - PKCE nuevo en query (?code=...&type=recovery)
        // - Fragmento antiguo en hash (#access_token=...&type=recovery)
        const q = url.searchParams;
        const hash = url.hash || "";
        const hParams = new URLSearchParams(hash.replace(/^#/, ""));

        const type = q.get("type") || hParams.get("type");
        const err = q.get("error") || hParams.get("error");
        const errCode = q.get("error_code") || hParams.get("error_code");
        const errDesc =
          q.get("error_description") || hParams.get("error_description");

        // Si viene error en el enlace
        if (err || errCode) {
          if (mounted) {
            setMsg(errDesc || "El enlace es inválido o ha expirado. Solicita uno nuevo.");
            setStage("error");
          }
          return;
        }

        // === Intercambiar el enlace por sesión ===
        let exchError: any = null;
        const code = q.get("code");

        if (code) {
          // Tu versión de supabase-js espera string aquí
          ({ error: exchError } = await supabase.auth.exchangeCodeForSession(code));
        } else if (hash) {
          // Formato antiguo: pasa el hash completo como string
          ({ error: exchError } = await supabase.auth.exchangeCodeForSession(hash));
        } else {
          throw new Error("No auth params found in URL");
        }
        if (exchError) throw exchError;

        // ¿Tenemos sesión ya creada?
        const { data } = await supabase.auth.getSession();
        const hasSession = !!data.session;

        // Rama especial: recuperación de contraseña
        if (type === "recovery") {
          if (!mounted) return;
          if (hasSession) {
            setStage("recovery");
          } else {
            setMsg("No se pudo validar la sesión de recuperación. Solicita un nuevo enlace.");
            setStage("error");
          }
          return;
        }

        // Normal: login/callback
        if (!mounted) return;
        setStage("done");
        router.replace(hasSession ? "/dashboard" : "/login");
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

  // Submit para cambiar contraseña en modo recovery
  const onSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pwd.length < 8) {
      setMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setMsg(error.message || "No se pudo actualizar la contraseña.");
      return;
    }

    // Opcional: cerrar sesión/limpiar y llevar a login con flag
    setMsg("¡Contraseña actualizada! Redirigiendo a inicio de sesión…");
    setStage("done");
    router.replace("/login?reset=ok");
  };

  // UI mínima por estados
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur p-6">
        {stage === "checking" && (
          <div className="text-center">
            <h1 className="text-xl font-semibold">Procesando enlace…</h1>
            <p className="text-slate-600 mt-2">Un momento por favor.</p>
          </div>
        )}

        {stage === "recovery" && (
          <div>
            <h1 className="text-xl font-semibold">Restablecer contraseña</h1>
            <p className="text-slate-600 mt-2">
              Ingresa tu nueva contraseña y confírmala.
            </p>

            <form className="mt-4 space-y-4" onSubmit={onSubmitNewPassword}>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="********"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  placeholder="********"
                />
              </div>

              {msg && (
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">
                  {msg}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium hover:opacity-90 transition"
              >
                Guardar contraseña
              </button>
            </form>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center">
            <h1 className="text-xl font-semibold">Listo</h1>
            <p className="text-slate-600 mt-2">Redirigiendo…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="text-center">
            <h1 className="text-xl font-semibold">No se pudo procesar</h1>
            <p className="text-slate-600 mt-2">
              {msg || "El enlace no es válido o ha expirado."}
            </p>
            <button
              className="mt-4 rounded-xl border border-slate-300 px-4 py-2 hover:bg-slate-50"
              onClick={() => router.replace("/login")}
            >
              Volver a iniciar sesión
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
