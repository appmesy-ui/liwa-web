// app/dashboard/reporting/turno-paros/page.tsx
"use client";

export default function TurnoParosReportPage() {
  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 px-5 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabecera del informe */}
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Informe de turno – Paros detallados
          </h1>
          <p className="text-sm text-slate-400">
            Esta pantalla mostrará todos los eventos de paro de un turno
            concreto (por planta, línea y turno), con detalle para análisis
            y exportación.
          </p>
        </header>

        {/* Filtros (placeholder, luego conectamos con BD) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">
            Filtros del informe
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Aquí irán los selectores de planta, línea, fecha y turno. De momento es
            solo un placeholder para validar el diseño. Más adelante los conectaremos
            con Supabase (plants, lines, v_shift_instances_resolved).
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
              <label className="text-xs text-slate-400">Fecha / turno</label>
              <div className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs flex items-center text-slate-500">
                selector de turno (WIP)
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Acciones</label>
              <div className="flex gap-2">
                <button className="flex-1 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium">
                  Aplicar filtros
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Tabla placeholder de paros */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Paros del turno seleccionado
              </h2>
              <p className="text-xs text-slate-400">
                Aquí listaremos los eventos de la tabla{" "}
                <code className="font-mono">liwa.events</code> filtrados
                por el rango del turno (v_shift_instances_resolved).
              </p>
            </div>

            {/* Botones de export (placeholder) */}
            <div className="flex items-center gap-2">
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
                  <th className="text-left py-2 px-3">Inicio</th>
                  <th className="text-left py-2 px-3">Fin</th>
                  <th className="text-right py-2 px-3">Duración (min)</th>
                  <th className="text-left py-2 px-3">Máquina</th>
                  <th className="text-left py-2 px-3">Planned</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Motivo</th>
                  <th className="text-left py-2 px-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5">
                  <td className="py-2 px-3 text-slate-500" colSpan={8}>
                    Los datos de paros se cargarán aquí cuando conectemos esta pantalla
                    con Supabase. De momento es solo el esqueleto visual del informe.
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
