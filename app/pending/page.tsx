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

type ApiResp =
  | { ok: true; rows: any[]; total_count?: number; source?: string }
  | { ok: false; error: string }
  | any;

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
  if (min < 15)
    return "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30";
  if (min < 60)
    return "bg-amber-600/20 text-amber-300 border border-amber-600/30";
  return "bg-rose-600/20 text-rose-300 border border-rose-600/30";
}

function dayStartISO(d: string) {
  const x = new Date(d + "T00:00:00");
  return x.toISOString();
}
function dayEndISO(d: string) {
  const x = new Date(d + "T23:59:59.999");
  return x.toISOString();
}

function safeOpenPicker(el: HTMLInputElement | null) {
  if (!el) return;
  try {
    // @ts-ignore
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  } catch {
    el.focus();
  }
}

export default function PendingPage() {
  const router = useRouter();
  const [lineFilter, setLineFilter] = useState<string>("ALL");
  const [query, setQuery] = useState<string>("");
  const [fromDay, setFromDay] = useState<string>("");
  const [toDay, setToDay] = useState<string>("");

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("state", "pending");
      params.set("limit", "1000");
      if (fromDay) params.set("from", dayStartISO(fromDay));
      if (toDay) params.set("to", dayEndISO(toDay));

      const res = await fetch(`/api/downtimes?${params.toString()}`, { cache: "no-store" });
      const json: ApiResp = await res.json();
      if (!json?.ok) throw new Error((json as any)?.error ?? "Error API");

      const mapped: PendingRow[] = (json.rows ?? []).map((r: any) => ({
        id: r.id,
        line_code: r.line_code ?? (r.line_id ? String(r.line_id).slice(0, 8) : null),
        machine_code: r.machine_code ?? (r.machine_id ? String(r.machine_id).slice(0, 8) : null),
        started_at: r.started_at ?? null,
        ended_at: r.ended_at ?? null,
        duration_min: r.duration_s != null ? Math.round(Number(r.duration_s) / 60) : null,
        lvl1: null,
        lvl2: r.n2_name ?? null,
        lvl3: r.n3_name ?? null,
        classified: r.state === "classified",
      }));

      const sorted = mapped.slice().sort((a, b) => {
        const ta = a.ended_at ? new Date(a.ended_at).getTime() : 0;
        const tb = b.ended_at ? new Date(b.ended_at).getTime() : 0;
        return ta - tb;
      });

      setRows(sorted);
      console.log("[PENDING] source:", json.source, "total_count:", json.total_count, "rows:", sorted.length);
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
  }, []);

  const uniqueLines = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.line_code && set.add(r.line_code));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const byLine =
      lineFilter === "ALL" ? rows : rows.filter((r) => (r.line_code || "") === lineFilter);

    const q = query.trim().toLowerCase();
    if (!q) return byLine;
    return byLine.filter((r) => {
      return (
        (r.machine_code || "").toLowerCase().includes(q) ||
        (r.line_code || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, lineFilter]);

  function exportCSV() {
    const headers = ["id", "line_code", "machine_code", "started_at", "ended_at", "duration_min", "classified"];
    const body = filtered.map((r) =>
      [r.id, r.line_code ?? "", r.machine_code ?? "", r.started_at ?? "", r.ended_at ?? "", r.duration_min ?? "", r.classified ?? ""]
        .map((x) => (typeof x === "string" && x.includes(",") ? `"${x.replace(/"/g, '""')}"` : String(x)))
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
      <header className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 border border-slate-700"
            >
              ← Volver
            </button>
            <div className="text-2xl font-semibold">Paros pendientes</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400"
            >
              Recargar
            </button>
            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60"
            >
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
        {/* filtros */}
        {/* ... igual que antes ... */}

        <div className="mt-4">
          {/* Tabla desktop */}
          <div className="hidden md:block rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/70 text-slate-400">
                <tr>
                  <th className="text-left px-4 py-3">Línea</th>
                  <th className="text-left px-2 py-3">Máquina</th>
                  <th className="text-left px-2 py-3">Inicio</th>
                  <th className="text-left px-2 py-3">Fin</th>
                  <th className="text-left px-2 py-3">Duración</th>
                  <th className="text-right px-4 py-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-slate-400">
                      Sin pendientes para el criterio actual.
                    </td>
                  </tr>
                )}

                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-t border-slate-800/60">
                      {/* skeletons */}
                    </tr>
                  ))}

                {!loading && filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-900/60 transition">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-lg bg-slate-800 text-slate-200">
                        {r.line_code ?? "—"}
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

          {/* Mobile igual que estaba */}
        </div>
      </section>
    </main>
  );
}

