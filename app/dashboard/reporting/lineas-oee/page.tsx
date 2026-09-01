// app/dashboard/reporting/lineas-oee/page.tsx
"use client";

import Link from "next/link";

export default function LineasOeeReportPage() {
  return (
    <main className="liwa-page w-full px-5 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-sm text-slate-400 mb-2">
          <Link href="/dashboard/reporting" className="hover:underline">
            Reporting
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-emerald-300">
            OEE por línea
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Informe – OEE por línea
          </h1>
          <p className="text-sm text-slate-400">
            Ranking y detalle de OEE por línea (Disponibilidad, Rendimiento,
            Calidad, OEE) para un turno o rango de fechas.
          </p>
        </header>

        {/* Filtros (placeholder) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">
            Filtros del informe
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Más adelante conectaremos esta pantalla con los KPIs que ya
            tienes en <code className="font-mono">/api/kpis</code>.
          </p>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Planta</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector de planta (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Rango fechas</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector fechas (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">
                Ordenar por
              </label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                OEE / A / P / Q (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Acciones</label>
              <button className="h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium">
                Aplicar filtros
              </button>
            </div>
          </div>
        </section>

        {/* Tabla ranking líneas (placeholder) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Ranking de líneas por OEE
            </h2>
            <div className="flex gap-2">
              <button className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">
                Exportar a Excel (WIP)
              </button>
              <button className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">
                Exportar a PDF (WIP)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/80 text-slate-300">
                <tr>
                  <th className="text-left py-2 px-3">Línea</th>
                  <th className="text-right py-2 px-3">Disponibilidad</th>
                  <th className="text-right py-2 px-3">Rendimiento</th>
                  <th className="text-right py-2 px-3">Calidad</th>
                  <th className="text-right py-2 px-3">OEE</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5">
                  <td className="py-2 px-3 text-slate-500" colSpan={5}>
                    Aquí se mostrarán las líneas con sus KPIs, usando los
                    mismos datos que el dashboard principal. De momento es solo
                    un esqueleto visual.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
