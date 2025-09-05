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
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const type = params.get("type");
      const err = params.get("error");
      const errCode = params.get("error_code");
      const errDesc = params.get("error_description");

      if (err || errCode) {
        if (mounted) {
          setMsg(errDesc || "El enlace es inválido o ha expirado. Solicita uno nuevo.");
          setStage("error");
        }
        return;
      }

      try {
        // 👈 PASO CLAVE: crea sesión en el navegador a partir del hash del email
        const { error: exchError } = await supabase.auth.exchangeCodeForSession(hash);
        if (exchError) throw exchError;

        const { data } = await supabase.auth.getSession();
        const hasSession = !!data.session;

        if (type === "recovery") {
          if (mounted) setStage(hasSession ? "recovery" : "error");
          if (!hasSession && mounted) setMsg("No se pudo validar la sesión de recuperación. Solicita un nuevo enlace.");
          return;
        }

        // Otros tipos (signup/magiclink/verify) → decide adónde enviar
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

    return () => { mounted = false; };
  }, [router, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (pwd.length < 8) return setMsg("La contraseña debe tener al menos 8 caracteres.");
    if (pwd !== pwd2) return setMsg("Las contraseñas no coinciden.");

    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return setMsg(error.message);

    setStage("done");
    // 👇 cierra sesión y vuelve al login
    await supabase.auth.signOut();
    router.replace("/login?reset=ok");
  };

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
            {msg ?? "El enlace es inválido o ha expirado. Solicita uno nuevo desde la página de acceso."}
          </p>
          <button
            onClick={() => router.replace("/login")}
            className="w-full rounded-full bg-teal-500 px-4 py-2 font-medium text-white hover:bg-teal-600"
          >
            Ir al acceso
          </button>
        </div>
      </main>
    );
  }

  if (stage === "recovery") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border bg-white p-6 shadow">
          <h1 className="text-xl font-semibold mb-2">Nueva contraseña</h1>
          <p className="text-sm text-slate-500 mb-4">Define tu nueva contraseña para continuar.</p>

          <label className="block text-sm font-medium text-slate-700">Contraseña</label>
          <input
            type="password"
            className="mt-1 mb-3 w-full rounded-lg border px-3 py-2"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />

          <label className="block text-sm font-medium text-slate-700">Repetir contraseña</label>
          <input
            type="password"
            className="mt-1 mb-3 w-full rounded-lg border px-3 py-2"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />

          {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

          <button type="submit" className="w-full rounded-full bg-teal-500 px-4 py-2 font-medium text-white hover:bg-teal-600">
            Guardar contraseña
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <p className="text-slate-600 text-sm">Redirigiendo…</p>
    </main>
  );
}
