"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

type Stage = "checking" | "recovery" | "done";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [stage, setStage] = useState<Stage>("checking");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  useEffect(() => {
    let mounted = true;

    const parseUrl = () => {
      const href =
        typeof window !== "undefined" ? window.location.href : "http://localhost";
      const url = new URL(href);
      const q = url.searchParams; // ?code=...&type=recovery&token_hash=...
      const hash = url.hash || ""; // #access_token=...&type=recovery
      const h = new URLSearchParams(hash.replace(/^#/, ""));
      const get = (k: string) => q.get(k) || h.get(k);
      return {
        url,
        q,
        h,
        hash,
        type: get("type"),
        code: q.get("code"),
        token_hash: get("token_hash"),
      };
    };

    (async () => {
      const { type, code, token_hash, hash } = parseUrl();

      // 1) Intentar intercambio de sesión por todos los caminos soportados
      let exchanged = false;
      let lastErr: any = null;

      const checkSession = async () => {
        const { data } = await supabase.auth.getSession();
        return !!data.session;
      };

      // A) PKCE moderno con ?code=...
      if (!exchanged && code) {
        try {
          // Algunas versiones aceptan string, otras { code }
          const r1 = await supabase.auth.exchangeCodeForSession(code as any);
          if (r1?.error) {
            const r2 = await supabase.auth.exchangeCodeForSession({ code } as any);
            if (r2?.error) lastErr = r2.error;
            else exchanged = true;
          } else {
            exchanged = true;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      // B) Flow antiguo con #access_token=...
      if (!exchanged && hash) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(hash);
          if (error) lastErr = error;
          else exchanged = true;
        } catch (e) {
          lastErr = e;
        }
      }

      // C) Fallback SSR: verifyOtp con token_hash (si el email lo trae)
      if (!exchanged && token_hash) {
        try {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash,
          } as any);
          if (error) lastErr = error;
          else exchanged = true;
        } catch (e) {
          lastErr = e;
        }
      }

      // 2) Flujo de salida sin mostrar pantallas de error
      const hasSession = await checkSession();

      // Rama de recuperación: mostrar el form si hay sesión; si no, a login
      if (type === "recovery") {
        if (hasSession) {
          if (!mounted) return;
          setStage("recovery");
          return;
        }
        router.replace("/login?reason=recovery_no_session");
        return;
      }

      // Resto de casos: redirige según sesión
      if (hasSession) {
        router.replace("/dashboard");
        return;
      }

      // Si no hay sesión, vuelve a login con motivo (sin mostrar error en pantalla)
      router.replace("/login?reason=callback_fail");
    })();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  // Submit para cambiar contraseña en modo recovery
  const onSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pwd.length < 8) return alert("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return alert("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return alert(error.message || "No se pudo actualizar la contraseña.");
    router.replace("/login?reset=ok");
  };

  // UI minimalista por estados (sin vista de error)
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
      </div>
    </main>
  );
}
