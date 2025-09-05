// app/auth/callback/page.tsx
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
    // Lee el hash que trae Supabase: #access_token=...&type=recovery&...
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    const err = params.get("error");
    const errCode = params.get("error_code");
    const errDesc = params.get("error_description");

    // Si el enlace trae error (p.ej. otp_expired)
    if (err || errCode) {
      setMsg(errDesc || "El enlace es inválido o ha expirado. Solicita uno nuevo.");
      setStage("error");
      return;
    }

    // Pequeña espera para que Supabase procese el hash y cree sesión temporal
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();

      // Flujo de recuperación de contraseña
      if (type === "recovery") {
        if (data.session) {
          setStage("recovery");
        } else {
          setMsg("No se pudo validar la sesión de recuperación. Solicita un nuevo enlace.");
          setStage("error");
        }
        return;
      }

      // Otros flujos (magic link, sign-in, sign-up) — redirige según haya sesión o no
      if (data.session) {
        setStage("done");
        router.replace("/dashboard");
      } else {
        setStage("done");
        router.replace("/login");
      }
    }, 150);

    return () => clearTimeout(t);
  }, [router, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

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
      setMsg(error.message);
      return;
    }

    // Éxito: cierra el flujo y redirige donde prefieras
    setStage("done");
    router.replace("/login"); // o "/dashboard" si deseas entrar directo
  };

  // UI
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
      <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-2xl border bg-white p-6 shadow"
        >
          <h1 className="text-xl font-semibold mb-2">Nueva contraseña</h1>
          <p className="text-sm text-slate-500 mb-4">
            Define tu nueva contraseña para continuar.
          </p>

          <label className="block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            type="password"
            className="mt-1 mb-3 w-full rounded-lg border px-3 py-2"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••"
            required
          />

          <label className="block text-sm font-medium text-slate-700">
            Repetir contraseña
          </label>
          <input
            type="password"
            className="mt-1 mb-3 w-full rounded-lg border px-3 py-2"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="••••••••"
            required
          />

          {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-teal-500 px-4 py-2 font-medium text-white hover:bg-teal-600"
          >
            Guardar contraseña
          </button>
        </form>
      </main>
    );
  }

  // stage === "done"
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <p className="text-slate-600 text-sm">Redirigiendo…</p>
    </main>
  );
}
