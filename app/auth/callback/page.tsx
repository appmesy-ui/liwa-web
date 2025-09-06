// app/auth/callback/page.tsx
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
      return { type: get("type"), token_hash: get("token_hash"), code: get("code") };
    };

    (async () => {
      const { type, token_hash, code } = getParams();

      // Recovery con token_hash
      if (type === "recovery" && token_hash) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash } as any);
        if (error) { safeReplace("/signin?reason=recovery_token_invalid"); return; }
        if (mounted) setStage("recovery");
        return;
      }

      // Magic link / OAuth code
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { safeReplace("/signin?reason=code_invalid"); return; }
        safeReplace("/dashboard");
        return;
      }

      // Sin tokens → fallback
      const { data } = await supabase.auth.getSession();
      if (data.session) safeReplace("/dashboard");
      else safeReplace("/signin");
    })();

    return () => { mounted = false; };
  }, [router, supabase]);

  const onSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return alert("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return alert("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return alert(error.message || "No se pudo actualizar la contraseña.");

    // 🔔 Flash message en sessionStorage y redirect limpio
    if (typeof window !== "undefined") {
      sessionStorage.setItem("signin_flash", "reset_ok");
    }
    setStage("done");
    safeReplace("/signin");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/90 shadow-xl backdrop-blur p-6">
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
                <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="********"
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Confirmar contraseña</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  placeholder="********"
                  minLength={8}
                />
              </div>
              <button type="submit" className="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium hover:opacity-90 transition">
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
