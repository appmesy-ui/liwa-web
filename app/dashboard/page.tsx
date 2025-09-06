// app/dashboard/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
    return () => sub?.subscription?.unsubscribe();
  }, [router, supabase]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    safeReplace("/signin");
  };

  if (stage === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl backdrop-blur px-8 py-6">
          <p className="text-slate-300">Cargando dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
  src="/tecnofab.svg"        // o .png si lo tienes así
  alt="TecnoFab"
  width={120}                // ancho fijo
  height={32}                // alto proporcional
  className="h-8 w-auto"     // altura 2rem, ancho auto
  priority
/>
<span className="font-semibold tracking-wide">
  TecnoFab • <span className="text-sky-400">LIWA</span>
</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {email && <span className="hidden sm:block text-slate-300">{email}</span>}
            <button
              onClick={onLogout}
              className="rounded-xl px-4 py-2 font-medium border border-slate-700 bg-slate-900/70 hover:bg-slate-800/80 transition"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400">
            Bienvenido{email ? `, ${email}` : ""}. Vista general de planta.
          </p>
        </div>

        {/* KPIs */}
        <section className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="OEE" value="72.4%" trend="+1.8%" />
          <KpiCard title="Disponibilidad" value="86.1%" trend="-0.6%" />
          <KpiCard title="Rendimiento" value="83.7%" trend="+0.3%" />
        </section>

        {/* Panels */}
        <section className="grid gap-4 sm:grid-cols-2 mt-6">
          <Panel title="Resumen de pérdidas">
            <ul className="text-sm text-slate-300 space-y-2">
              <li className="flex items-center justify-between">
                <span className="text-slate-400">Ajustes de máquina</span>
                <Badge>32 min</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-400">Cambio de formato</span>
                <Badge>18 min</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-400">Falta MMPP</span>
                <Badge>11 min</Badge>
              </li>
            </ul>
          </Panel>

          <Panel title="Acciones rápidas">
            <div className="flex flex-wrap gap-3">
              <Action>Paros sin clasificar</Action>
              <Action>Reporte de turno</Action>
              <Action>Crear acción correctiva</Action>
              <Action>Ver micro-paros</Action>
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

/* Components */
function KpiCard({ title, value, trend }: { title: string; value: string; trend?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 flex items-end gap-2">
        <p className="text-3xl font-semibold text-slate-100">{value}</p>
        {trend && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-sky-400/10 text-sky-300 border border-sky-700/40">
            {trend}
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
          style={{ width: value }}
        />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-slate-100">{title}</h2>
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-sky-400/70 to-blue-600/70" />
      </div>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
      {children}
    </span>
  );
}

function Action({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-xl px-4 py-2 text-sm font-medium border border-slate-700 bg-slate-900/70 hover:bg-slate-800/80 hover:border-sky-700/60 hover:text-sky-200 transition">
      {children}
    </button>
  );
}
