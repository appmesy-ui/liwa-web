// app/pending/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PendingRow = {
  id: string;
  line_code: string | null;
  machine_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean | null;
};

type ApiResp = { ok: boolean; rows?: PendingRow[]; error?: string } | any;

const dtf = new Intl.DateTimeFormat("es-ES", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function hmsFromMin(min: number | null) {
  if (min == null || isNaN(min)) return "—";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function chipColorByMinutes(min: number | null) {
  if (min == null) return "bg-slate-700 text-slate-200";
  if (min < 15) return "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30";
  if (min < 60) return "bg-amber-600/20 text-amber-300 border border-amber-600/30";
  return "bg-rose-600/20 text-rose-300 border border-rose-600/30";
}

export default function PendingPage() {
  const router = useRouter();

  // rango
  const [fromISO, setFromISO] = useState("");
  const [toISO, setToISO] = useState("");

  // filtros
  const [lineFilter, setLineFilter] = useState<string>("ALL");
  const [query, setQuery] = useState<string>("");

  // datos
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // presets rango inicial 24h
  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - 24 * 3600 * 1000);
    setToISO(to.toISOString());
    setFromISO(from.toISOString());
  }, []);

  async function load() {
    if (!fromISO || !toISO) return;
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({
        from: fromISO,
        to: toISO,
        limit: "400",
        ...(lineFilter !== "ALL" ? { line: lineFilter } : {}),
      }).toString();

      const res = await fetch(`/api/pending?${qs}`);
      const json: ApiResp = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Error cargando pendientes");
      setRows(json.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Error inesperado");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromISO, toISO, lineFilter]);

  const uniqueLines = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.line_code && set.add(r.line_code));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      return (
        (r.machine_code || "").toLowerCase().includes(q) ||
        (r.line_code || "").toLowerCase().includes(q) ||
        (r.lvl1 || "").toLowerCase().includes(q) ||
        (r.lvl2 || "").toLowerCase().includes(q) ||
        (r.lvl3 || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  function setPresetHours(h: number) {
    const to = new Date();
    const from = new Date(Date.now() - h * 3600 * 1000);
    setToISO(to.toISOString());
    setFromISO(from.toISOString());
  }

  function exportCSV() {
    const headers = [
      "id",
      "line_code",
      "machine_code",
      "started_at",
      "ended_at",
      "duration_min",
      "lvl1",
      "lvl2",
      "lvl3",
      "classified",
    ];
    const body = filtered.map((r) =>
      [
        r.id,
        r.line_code ?? "",
        r.machine_code ?? "",
        r.started_at ?? "",
        r.ended_at ?? "",
        r.duration_min ?? "",
        r.lvl1 ?? "",
        r.lvl2 ?? "",
        r.lvl3 ?? "",
        r.classified ?? "",
      ]
        .map((x) =>
          typeof x === "string" && x.includes(",") ? `"${x.replace(/"/g, '""')}"` : String(x)
        )
        .join(",")
    );
    const csv = [headers.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pending_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <header
        className="
          sticky top-0 z-20
          bg-slate-950 border-b border-slate-800
          px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3
        "
      >
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-xl bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 border border-slate-700"
              title="Volver al Dashboard"
            >
              ← Volver
            </button>
            <div className="text-2xl font-semibold">Paros pendientes</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPresetHours(24)}
              className={`px-3 py-1.5 rounded-lg border ${
                Math.abs(new Date(toISO).getTime() - new Date(fromISO).getTime() - 24 * 3600 * 1000) < 1000
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              24h
            </button>
            <button
              onClick={() => setPresetHours(48)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60"
            >
              48h
            </button>
            <button
              onClick={() => setPresetHours(24 * 7)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60"
            >
              7d
            </button>

            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400"
              title="Recargar"
            >
              Recargar
            </button>

            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60"
              title="Exportar CSV"
            >
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      {/* Filtros, lista */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Todas las líneas</option>
              {Array.from(new Set(rows.map(r => r.line_code).filter(Boolean) as string[]))
                .sort()
                .map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
            </select>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: línea, máquina o motivo…"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm w-full sm:w-72 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="text-sm text-slate-400">
            {loading ? "Cargando…" : `${filtered.length} items`}
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {err}
          </div>
        )}

        <div className="mt-4">
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/70 text-slate-400">
                <tr>
                  <th className="text-left px-4 py-3">Línea</th>
                  <th className="text-left px-2 py-3">Máquina</th>
                  <th className="text-left px-2 py-3">Inicio</th>
                  <th className="text-left px-2 py-3">Fin</th>
                  <th className="text-left px-2 py-3">Duración</th>
                  <th className="text-left px-2 py-3">Motivo</th>
                  <th className="text-right px-4 py-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-slate-400">
                      Sin pendientes para el rango/criterio actual.
                    </td>
                  </tr>
                )}

                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-t border-slate-800/60">
                      <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-800 rounded" /></td>
                      <td className="px-2 py-4"><div className="h-4 w-24 bg-slate-800 rounded" /></td>
                      <td className="px-2 py-4"><div className="h-4 w-28 bg-slate-800 rounded" /></td>
                      <td className="px-2 py-4"><div className="h-4 w-28 bg-slate-800 rounded" /></td>
                      <td className="px-2 py-4"><div className="h-4 w-16 bg-slate-800 rounded" /></td>
                      <td className="px-2 py-4"><div className="h-4 w-40 bg-slate-800 rounded" /></td>
                      <td className="px-4 py-4 text-right"><div className="h-8 w-24 bg-slate-800 rounded-lg" /></td>
                    </tr>
                  ))}

                {!loading &&
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-900/60 transition">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs rounded-lg bg-slate-800 text-slate-200">
                            {r.line_code ?? "—"}
                          </span>
                          <span className="text-slate-400">#{r.id.slice(0, 6)}</span>
                        </span>
                      </td>
                      <td className="px-2 py-3">{r.machine_code ?? "—"}</td>
                      <td className="px-2 py-3">{r.started_at ? dtf.format(new Date(r.started_at)) : "—"}</td>
                      <td className="px-2 py-3">{r.ended_at ? dtf.format(new Date(r.ended_at)) : "—"}</td>
                      <td className="px-2 py-3">
                        <span className={"px-2 py-0.5 rounded-md text-xs " + chipColorByMinutes(r.duration_min)}>
                          {hmsFromMin(r.duration_min)}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.lvl1 && <span className="px-2 py-0.5 text-xs rounded-md bg-slate-800/80 border border-slate-700">{r.lvl1}</span>}
                          {r.lvl2 && <span className="px-2 py-0.5 text-xs rounded-md bg-slate-800/60 border border-slate-700">{r.lvl2}</span>}
                          {r.lvl3 ? (
                            <span className="px-2 py-0.5 text-xs rounded-md bg-emerald-600/20 border border-emerald-600/30 text-emerald-300">{r.lvl3}</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs rounded-md bg-amber-600/20 border border-amber-600/30 text-amber-300">falta L3</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => router.push(`/pending/${r.id}`)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-4 py-2 transition"
                        >
                          Clasificar →
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 gap-3">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skm-${i}`} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="h-4 w-28 bg-slate-800 rounded mb-3" />
                  <div className="h-4 w-full bg-slate-800 rounded mb-2" />
                  <div className="h-4 w-2/3 bg-slate-800 rounded" />
                </div>
              ))}

            {!loading && filtered.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-400">
                Sin pendientes para el rango/criterio actual.
              </div>
            )}

            {!loading &&
              filtered.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs rounded-lg bg-slate-800">{r.line_code ?? "—"}</span>
                      <span className="text-slate-400">{r.machine_code ?? "—"}</span>
                    </div>
                    <span className={"px-2 py-0.5 rounded-md text-xs " + chipColorByMinutes(r.duration_min)}>
                      {hmsFromMin(r.duration_min)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    <div><span className="text-slate-400">Inicio: </span>{r.started_at ? dtf.format(new Date(r.started_at)) : "—"}</div>
                    <div><span className="text-slate-400">Fin:&nbsp;&nbsp;&nbsp;&nbsp;</span>{r.ended_at ? dtf.format(new Date(r.ended_at)) : "—"}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.lvl1 && <span className="px-2 py-0.5 text-xs rounded-md bg-slate-800/80 border border-slate-700">{r.lvl1}</span>}
                      {r.lvl2 && <span className="px-2 py-0.5 text-xs rounded-md bg-slate-800/60 border border-slate-700">{r.lvl2}</span>}
                      {r.lvl3 ? (
                        <span className="px-2 py-0.5 text-xs rounded-md bg-emerald-600/20 border border-emerald-600/30 text-emerald-300">{r.lvl3}</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-md bg-amber-600/20 border border-amber-600/30 text-amber-300">falta L3</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 text-right">
                    <button
                      onClick={() => router.push(`/pending/${r.id}`)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-4 py-2 transition"
                    >
                      Clasificar →
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
