"use client";

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

  // Evita redirecciones dobles (parpadeo)
  const alreadyNavigated = useRef(false);
  const safeReplace = (path: string) => {
    if (alreadyNavigated.current) return;
    alreadyNavigated.current = true;
    router.replace(path);
  };

  useEffect(() => {
    let mounted = true;

    const parseUrl = () => {
      const href =
        typeof window !== "undefined" ? window.location.href : "http://localhost";
      const url = new URL(href);
      const q = url.searchParams;           // ?code=...&type=...&token_hash=...
      const hash = url.hash || "";          // #access_token=...&type=...
      const h = new URLSearchParams(hash.replace(/^#/, ""));
      const get = (k: string) => q.get(k) || h.get(k);
      return {
        q,
        hash,
        type: get("type"),
        code: q.get("code"),
        token_hash: get("token_hash"),
      };
    };

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    };

    (async () => {
      const { type, code, token_hash, hash } = parseUrl();

      // 1) Intentar crear sesión por todas las vías
      let exchanged = false;
      try {
        // A) PKCE: ?code=...
        if (!exchanged && code) {
          const r1: any = await supabase.auth.exchangeCodeForSession(code as any);
          if (r1?.error) {
            const r2: any = await supabase.auth.exchangeCodeForSession({ code } as any);
            if (!r2?.error) exchanged = true;
          } else {
            exchanged = true;
          }
        }

        // B) Hash antiguo: #access_token=...
        if (!exchanged && hash) {
          const { error } = await supabase.auth.exchangeCodeForSession(hash as any);
          if (!error) exchanged = true;
        }

        // C) Fallback sin PKCE: ?token_hash=...
        if (!exchanged && token_hash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash,
          } as any);
          if (!error) exchanged = true;
        }
      } catch {
        // ignoramos, seguimos con control de sesión
      }

      const hasSession = await checkSession();

      // 2) Rutas de salida (sin pantallas de error)
      if (type === "recovery") {
        if (hasSession) {
          if (!mounted) return;
          setStage("recovery"); // mostramos formulario de nueva contraseña
          return;
        }
        safeReplace("/login?reason=recovery_no_session");
        return;
      }

      if (hasSession) {
        safeReplace("/dashboard");
        return;
      }

      safeReplace("/login?reason=callback_fail");
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
