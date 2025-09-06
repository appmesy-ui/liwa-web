// app/dashboard/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

type Stage = "checking" | "ready";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState<string | null>(null);

  // Evitar dobles navegaciones
  const navigated = useRef(false);
  const safeReplace = (path: string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(path);
  };

  // 1) Proteger la ruta: si no hay sesión → /signin
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        safeReplace("/signin");
        return;
      }

      // Usuario autenticado
      const userEmail = data.session.user.email ?? null;
      if (mounted) {
        setEmail(userEmail);
        setStage("ready");
      }
    })();

    // Si en vivo cambia el estado (por ejemplo, cierra sesión en otra pestaña)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) safeReplace("/signin");
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [router, supabase]);

  // 2) Cerrar sesión
  const onLogout = async () => {
    await supabase.auth.signOut();
    safeReplace("/signin");
  };

  if (stage === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur px-8 py-6">
          <p className="text-slate-600">Cargando dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header simple */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
            <p className="text-sm text-slate-600">
              Bienvenido{email ? `, ${email}` : ""}.
            </p>
          </div>

          <button
            onClick={onLogout}
            className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            Cerrar sesión
          </button>
        </header>

        {/* Contenido inicial (placeholder) */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <h2 className="font-medium text-slate-800 mb-2">Estado</h2>
            <p className="text-sm text-slate-600">
              Aquí pondremos tus KPIs iniciales y accesos rápidos.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <h2 className="font-medium text-slate-800 mb-2">Siguiente</h2>
            <p className="text-sm text-slate-600">
              Próximo paso: tarjetas de OEE, paros y acciones rápidas.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
