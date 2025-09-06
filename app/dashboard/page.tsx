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

  const navigated = useRef(false);
  const safeReplace = (path: string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(path);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        safeReplace("/signin");
        return;
      }
      if (mounted) {
        setEmail(data.session.user.email ?? null);
        setStage("ready");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) safeReplace("/signin");
    });

    return () => {
      sub?.subscription?.unsubscribe();
      navigated.current = false;
    };
  }, [router, supabase]);

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
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
            <p className="text-sm text-slate-600">Bienvenido{email ? `, ${email}` : ""}.</p>
          </div>
          <button
            onClick={onLogout}
            className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            Cerrar sesión
          </button>
        </header>

        {/* KPIs estáticos (placeholder) */}
        <section className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="OEE" value="72.4%" subtitle="Último turno" />
          <KpiCard title="Disponibilidad" value="86.1%" subtitle="Paros plan/no plan" />
          <KpiCard title="Rendimiento" value="83.7%" subtitle="Vs ciclo ideal" />
        </section>

        {/* Placeholder de secciones */}
        <section className="grid gap-4 sm:grid-cols-2 mt-6">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <h2 className="font-medium text-slate-800 mb-2">Resumen</h2>
            <p className="text-sm text-slate-600">
              Aquí irán tarjetas con top pérdidas, micro-paros y calidad.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <h2 className="font-medium text-slate-800 mb-2">Acciones rápidas</h2>
            <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
              <li>Ver paros sin clasificar</li>
              <li>Descargar reporte de turno</li>
              <li>Crear acción correctiva</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-3xl font-semibold text-slate-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}
