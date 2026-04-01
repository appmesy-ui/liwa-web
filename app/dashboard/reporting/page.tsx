// app/dashboard/reporting/page.tsx
"use client";

import Link from "next/link";

export default function ReportingPage() {
  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <section className="max-w-7xl mx-auto px-5 py-10 space-y-8">
        {/* Tabs arriba (Dashboard / Live / Reporting) */}
        <div className="mb-2 flex gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-full text-sm border border-white/10 bg-slate-900/70 hover:bg-slate-800 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/live"
            className="px-4 py-2 rounded-full text-sm border border-white/10 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
          >
            Live
          </Link>
          <span className="px-4 py-2 rounded-full text-sm border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 font-semibold">
            Reporting
          </span>
        </div>

        {/* Cabecera */}
        <header className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Reporting
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">
                Descarga datasets de trabajo listos para Excel: productividad
                por turno y paros detallados. Cada informe está pensado para
                que puedas seguir analizando en hojas de cálculo (pivots,
                gráficos, Pareto, etc.).
              </p>
            </div>

            <div className="text-xs text-slate-500 md:text-right">
              <p>Módulos activos en esta versión:</p>
              <p className="mt-1 font-mono text-emerald-300">
                1. Resumen de turno · 2. Paros y pérdidas
              </p>
            </div>
          </div>
        </header>

        {/* Bloques de navegación (solo 2 reports MVP) */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Resumen de turno */}
          <Link
            href="/dashboard/reporting/turno-resumen"
            className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/70 transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold group-hover:text-emerald-300">
                  1. Resumen de turno
                </h2>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono text-emerald-300 border border-emerald-400/40">
                  CSV listo
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Resumen global de turnos por línea en un rango de fechas:
                Disponibilidad (A), Rendimiento (P), Calidad (Q), OEE,
                unidades producidas, scrap y tiempos clave. Dataset plano
                listo para descargar y seguir trabajando en Excel.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>Salida: tabla de turnos × líneas</span>
              <span className="inline-flex items-center gap-1 text-emerald-300 group-hover:gap-1.5 transition-all">
                Abrir informe
                <span className="text-xs">↗</span>
              </span>
            </div>
          </Link>

          {/* 2. Paros y pérdidas */}
          <Link
            href="/dashboard/reporting/turno-paros"
            className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] hover:border-emerald-400/70 transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold group-hover:text-emerald-300">
                  2. Paros y pérdidas
                </h2>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono text-emerald-300 border border-emerald-400/40">
                  CSV listo
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Lista detallada de eventos de paro en un rango de fechas
                (inicio/fin, duración, tipo planificado/no planificado,
                estado de clasificación y notas). Pensado para construir
                Pareto de pérdidas y análisis por máquina o línea en Excel.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>Salida: tabla de eventos de paro</span>
              <span className="inline-flex items-center gap-1 text-emerald-300 group-hover:gap-1.5 transition-all">
                Abrir informe
                <span className="text-xs">↗</span>
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}

