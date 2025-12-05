// app/dashboard/reporting/page.tsx
"use client";

import Link from "next/link";

export default function ReportingPage() {
  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <section className="max-w-7xl mx-auto px-5 py-10">
        {/* Tabs arriba (Dashboard / Live / Reporting) */}
        <div className="mb-8 flex gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-full text-sm border border-white/10 bg-slate-900/70 hover:bg-slate-800"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/live"
            className="px-4 py-2 rounded-full text-sm border border-white/10 bg-slate-900/40 hover:bg-slate-800/60"
          >
            Live
          </Link>
          <span className="px-4 py-2 rounded-full text-sm border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 font-semibold">
            Reporting
          </span>
        </div>

        {/* Cabecera */}
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Reporting</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Aquí vamos a construir los informes descargables (Excel / PDF) por
            bloques: resumen de turno, líneas, máquinas, paros y producción.
          </p>
        </header>

        {/* Cuatro bloques de navegación */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Resumen de turno */}
          <Link
            href="/dashboard/reporting/turno-resumen"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/60 transition-colors group"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-emerald-300">
              1. Resumen de turno
            </h2>
            <p className="text-sm text-slate-400">
              Resumen global del turno (A, P, Q, OEE, unidades y tiempo) con
              posibilidad de exportar solo este bloque.
            </p>
          </Link>

          {/* 2. OEE por línea */}
          <Link
            href="/dashboard/reporting/lineas-oee"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/60 transition-colors group"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-emerald-300">
              2. OEE por línea
            </h2>
            <p className="text-sm text-slate-400">
              Tabla/detalle por línea con sus KPIs (A, P, Q, OEE) y opción de
              exportar.
            </p>
          </Link>

          {/* 3. OEE por máquina */}
          <Link
            href="/dashboard/reporting/maquinas-oee"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/60 transition-colors group"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-emerald-300">
              3. OEE por máquina
            </h2>
            <p className="text-sm text-slate-400">
              Detalle de rendimiento y OEE por máquina dentro de cada línea.
            </p>
          </Link>

          {/* 4. Paros y pérdidas */}
          <Link
            href="/dashboard/reporting/turno-paros"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/60 transition-colors group"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-emerald-300">
              4. Paros y pérdidas
            </h2>
            <p className="text-sm text-slate-400">
              Lista o pareto de paros clasificados (N1, N2, N3) con sus tiempos
              y posibilidad de exportar.
            </p>
          </Link>
        </div>

        <div className="mt-10 text-sm text-slate-500">
          <p>
            Paso siguiente: conectar cada bloque con los datos reales del turno
            y añadir botones de exportación a Excel / PDF por bloque.
          </p>
        </div>
      </section>
    </main>
  );
}

