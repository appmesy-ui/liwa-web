"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [mode, setMode] = useState<"checking" | "update" | "done" | "error">(
    "checking"
  );
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 1) Detectar si venimos de un recovery (el hash trae type=recovery)
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery")) {
      // Modo: actualizar contraseña
      setMode("update");
      return;
    }

    // Si no es recovery, comprobamos sesión y redirigimos
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setMode("done");
        router.replace("/dashboard");
      } else {
        setMode("done");
        router.replace("/login");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Enviar nueva contraseña
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }

    setMode("done");
    router.replace("/dashboard"); // listo: redirigimos al dashboard
  };

  if (mode === "checking") {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-slate-600 text-sm">Procesando autenticación…</div>
      </main>
    );
  }

  if (mode === "update") {
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <label className="block text-sm font-medium text-slate-700">
            Repetir contraseña
          </label>
          <input
            type="password"
            className="mt-1 mb-3 w-full rounded-lg border px-3 py-2"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && (
            <p className="text-sm text-red-600 mb-3">
              {error}
            </p>
          )}

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

  // mode === "done" o "error"
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <p className="text-slate-600 text-sm">Redirigiendo…</p>
    </main>
  );
}
