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

    (async () => {
      // util: leer tipo desde query o hash
      const getTypeFromUrl = () => {
        const href =
          typeof window !== "undefined" ? window.location.href : "http://localhost";
        const url = new URL(href);
        const q = url.searchParams;
        const hash = url.hash || "";
        const hParams = new URLSearchParams(hash.replace(/^#/, ""));
        return { q, hash, type: q.get("type") || hParams.get("type") };
      };

      try {
        const href =
          typeof window !== "undefined" ? window.location.href : "http://localhost";
        const url = new URL(href);

        const { q, hash, type } = getTypeFromUrl();

        // === Intercambiar el enlace por sesión (manejo doble versión) ===
        let exchError: any = null;
        const code = q.get("code");

        if (code) {
          // tu lib actual espera string; si más adelante cambiara, probamos objeto como plan B
          const res1 = await supabase.auth.exchangeCodeForSession(code as any);
          if (res1?.error) {
            // intento B por si la lib requiere { code }
            const res2 = await supabase.auth.exchangeCodeForSession({ code } as any);
            exchError = res2?.error || null;
          }
        } else if (hash) {
          const { error } = await supabase.auth.exchangeCodeForSession(hash);
          exchError = error || null;
        } else {
          exchError = new Error("No auth params found in URL");
        }

        if (exchError) throw exchError;

        const { data } = await supabase.auth.getSession();
        const hasSession = !!data.session;

        if (type === "recovery") {
          if (!mounted) return;
          if (hasSession) {
            setStage("recovery");
            return;
          }
          // sin sesión → manda a login sin mostrar error
          router.replace("/login?reason=recovery_no_session");
          return;
        }

        if (!mounted) return;
        setStage("done");
        router.replace(hasSession ? "/dashboard" : "/login");
      } catch (e) {
        // === Fallback silencioso, sin mostrar pantalla de error ===
        try {
          const { data } = await supabase.auth.getSession();
          const hasSession = !!data.session;

          const { type } = (function () {
            const href =
              typeof window !== "undefined" ? window.location.href : "http://localhost";
            const url = new URL(href);
            const q = url.searchParams;
            const hash = url.hash || "";
            const hParams = new URLSearchParams(hash.replace(/^#/, ""));
            return { type: q.get("type") || hParams.get("type") };
          })();

          if (hasSession) {
            if (type === "recovery") {
              if (!mounted) return;
              setStage("recovery"); // muestra form de password
              return;
            }
            router.replace("/dashboard");
            return;
          }

          // sin sesión: volvemos a login con motivo; NO mostramos error en pantalla
          router.replace("/login?reason=pkce_mismatch");
          return;
        } catch {
          router.replace("/login?reason=callback_fail");
          return;
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
    if (pwd.length < 8) return alert("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return alert("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return alert(error.message || "No se pudo actualizar la contraseña.");
    router.replace("/login?reset=ok");
  };

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
