// app/dashboard/reporting/maquinas-oee/page.tsx
"use client";

import Link from "next/link";

export default function MaquinasOeeReportPage() {
  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 px-5 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-sm text-slate-400 mb-2">
          <Link href="/dashboard/reporting" className="hover:underline">
            Reporting
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-emerald-300">
            OEE por máquina
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Informe – OEE por máquina
          </h1>
          <p className="text-sm text-slate-400">
            Detalle de OEE por máquina dentro de una línea: buenas para ver
            cuellos de botella y máquinas problemáticas.
          </p>
        </header>

        {/* Filtros (placeholder) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">
            Filtros del informe
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Más adelante conectaremos planta, línea y rango temporal con las
            tablas <code className="font-mono">machines</code>,{" "}
            <code className="font-mono">lines</code> y KPIs calculados.
          </p>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Planta</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector de planta (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Línea</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector de línea (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Rango fechas</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector fechas (WIP)
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

        {/* Tabla máquinas (placeholder) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              OEE por máquina de la línea seleccionada
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
                  <th className="text-left py-2 px-3">Máquina</th>
                  <th className="text-right py-2 px-3">Disponibilidad</th>
                  <th className="text-right py-2 px-3">Rendimiento</th>
                  <th className="text-right py-2 px-3">Calidad</th>
                  <th className="text-right py-2 px-3">OEE</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5">
                  <td className="py-2 px-3 text-slate-500" colSpan={5}>
                    Aquí aparecerán las máquinas de la línea seleccionada con
                    sus KPIs de OEE. De momento es solo la estructura visual del
                    informe.
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
