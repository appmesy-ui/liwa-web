// app/dashboard/availability/[line]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

/* ===== Helpers ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));

const pct = (n?: number | null, d = 1) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;

const nf = new Intl.NumberFormat("es-ES");

const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const fmtHM = (sec?: number | null) => {
  if (!Number.isFinite(sec as number)) return "—";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

/* ===== Tipos ===== */
type KpiRow = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;
  quality: number | null;
  oee: number | null;
};

type KpisResponse =
  | { ok: true; rows: KpiRow[] }
  | { ok: false; error: string }
  | any;

type DowntimeRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  line_code: string | null;
  machine_code: string | null;
  state?: "pending" | "classified" | null;
  n2_name?: string | null;
  n3_name?: string | null;
};

/* ===== Página ===== */
export default function AvailabilityByLinePage({
  params,
}: {
  params: { line: string };
}) {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");

  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  }, [from, to]);

  const lineParam = decodeURIComponent(params.line || "").toUpperCase();

  /* ===== Estado KPI (lo que alimenta las CARDS) ===== */
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiErr, setKpiErr] = useState<string | null>(null);
  const [kpiRow, setKpiRow] = useState<KpiRow | null>(null);

  // totales KPI derivados
  const planned_s = Math.max(
    0,
    Math.floor(Number(kpiRow?.planned_runtime_sec ?? 0))
  );
  const aKpi = clamp01(kpiRow?.availability ?? null);
  const unplanned_kpi_s =
    planned_s > 0 ? Math.max(0, Math.round(planned_s * (1 - aKpi))) : 0;
  const runtime_kpi_s = Math.max(0, planned_s - unplanned_kpi_s);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setKpiLoading(true);
        setKpiErr(null);

        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        u.searchParams.set("step", "kpis");
        u.searchParams.set("line", lineParam);

        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: KpisResponse = await res.json();

        if (!alive) return;
        if (!data || data.ok !== true)
          throw new Error((data as any)?.error || "Error de KPI");

        const row: KpiRow | undefined = (data.rows || [])[0];
        setKpiRow(row ?? null);
      } catch (e: any) {
        if (!alive) return;
        setKpiErr(e?.message || "Error de KPI");
        setKpiRow(null);
      } finally {
        if (alive) setKpiLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lineParam, from, to]);

  /* ===== Tabla de paros (TODOS, paginado) ===== */
  const [tblLoading, setTblLoading] = useState(true);
  const [tblErr, setTblErr] = useState<string | null>(null);
  const [events, setEvents] = useState<DowntimeRow[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);

  const [limit, setLimit] = useState(15);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * limit;

  const totalPages = Math.max(
    1,
    Math.ceil(Math.max(0, totalEvents) / Math.max(1, limit))
  );
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // carga la página actual
  useEffect(() => {
    let alive = true;
    (async () => {
      setTblLoading(true);
      setTblErr(null);
      try {
        const u = new URL("/api/downtimes", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        u.searchParams.set("line", lineParam);
        u.searchParams.set("limit", String(limit));
        u.searchParams.set("offset", String(offset));

        const res = await fetch(u.toString(), { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        if (!j?.ok) throw new Error(j?.error || "Error cargando paros");

        setEvents(Array.isArray(j.rows) ? (j.rows as DowntimeRow[]) : []);
        setTotalEvents(Number(j.total_count ?? 0));
      } catch (e: any) {
        if (!alive) return;
        setTblErr(e?.message || "Error cargando paros");
        setEvents([]);
        setTotalEvents(0);
      } finally {
        if (alive) setTblLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lineParam, from, to, limit, offset]);

  /* ===== UI ===== */
  return (
    <main className="liwa-page max-w-7xl mx-auto px-5 py-8 text-slate-100">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">
            <Link href={`/dashboard${qs}`} className="hover:underline">
              Dashboard
            </Link>
            <span className="mx-2">/</span>
            <Link href={`/dashboard/availability${qs}`} className="hover:underline">
              Disponibilidad
            </Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-emerald-300">{lineParam}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">
            Disponibilidad · {lineParam}
          </h1>
        </div>
        <Link
          href={`/dashboard/availability${qs}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          ← Volver a ranking
        </Link>
      </div>

      {/* KPI CARDS (siempre desde KPI de /api/kpis) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
        <CardMini
          title="Disponibilidad"
          value={kpiLoading ? "…" : pct(aKpi)}
          hint="A = Tiempo operativo ÷ Planificado"
        />
        <CardMini
          title="Planificado"
          value={kpiLoading ? "…" : fmtHM(planned_s)}
          hint="Horas programadas en el rango"
        />
        <CardMini
          title="Paro (no planificado)"
          value={kpiLoading ? "…" : fmtHM(unplanned_kpi_s)}
          hint="Paro = (1 − A) × Planificado"
        />
        <CardMini
          title="Tiempo operativo"
          value={kpiLoading ? "…" : fmtHM(runtime_kpi_s)}
          hint="Tiempo operativo = Planificado − Paro"
        />
      </div>

      {kpiErr && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {kpiErr}
        </div>
      )}

      {/* Tabla de paros (paginada) */}
      <div className="liwa-panel p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Paros recientes (no planificados)
          </h2>
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-400">
              {tblLoading ? "Cargando…" : `${totalEvents} evento${totalEvents === 1 ? "" : "s"}`}
            </div>
            <label className="ml-3 text-sm text-slate-300">Filas:</label>
            <select
              value={limit}
              onChange={(e) => {
                setPage(1);
                setLimit(Number(e.target.value));
              }}
              className="rounded-lg bg-transparent border border-white/10 px-2 py-1 text-sm text-slate-200"
            >
              {[10, 15, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label className="ml-3 text-sm text-slate-300">Página:</label>
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="rounded-lg bg-transparent border border-white/10 px-2 py-1 text-sm text-slate-200"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  {p}/{totalPages}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70">
              <tr className="text-slate-400 whitespace-nowrap">
                <th className="text-left py-2 pr-4">Fecha</th>
                <th className="text-left py-2 px-4">Máquina</th>
                <th className="text-left py-2 px-4">N2</th>
                <th className="text-left py-2 px-4">N3</th>
                <th className="text-right py-2 px-4 w-28">Duración</th>
                <th className="text-right py-2 px-4 w-32">Estado</th>
              </tr>
            </thead>
            <tbody>
              {tblLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-400">
                    Cargando…
                  </td>
                </tr>
              )}
              {!tblLoading && tblErr && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-rose-200">
                    {tblErr}
                  </td>
                </tr>
              )}
              {!tblLoading && !tblErr && events.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-400">
                    Sin paros en el rango seleccionado.
                  </td>
                </tr>
              )}
              {!tblLoading &&
                !tblErr &&
                events.map((e) => {
                  const state = e.state === "classified" ? "Clasificado" : "Pendiente";
                  const stateCls =
                    e.state === "classified" ? "text-emerald-300" : "text-amber-300";
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-white/10 hover:bg-white/[0.06] transition-colors"
                    >
                      <td className="py-3 pr-4">{dtf.format(new Date(e.started_at))}</td>
                      <td className="py-3 px-4">{e.machine_code || "—"}</td>
                      <td className="py-3 px-4">{e.n2_name || "—"}</td>
                      <td className="py-3 px-4">{e.n3_name || "—"}</td>
                      <td className="py-3 px-4 text-right">
                        {fmtHM(Number(e.duration_s || 0))}
                      </td>
                      <td className={`py-3 px-4 text-right ${stateCls}`}>{state}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-950/60 mt-3 rounded-lg">
          <div className="text-xs text-slate-400">
            {totalEvents
              ? `Mostrando ${Math.min(offset + 1, totalEvents)}–${Math.min(
                  offset + limit,
                  totalEvents
                )} de ${totalEvents}`
              : "—"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className={
                "px-3 py-1.5 rounded-lg text-sm border " +
                (canPrev
                  ? "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]"
                  : "border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed")
              }
            >
              ← Anterior
            </button>
            <button
              onClick={() => canNext && setPage((p) => Math.min(totalPages, p + 1))}
              disabled={!canNext}
              className={
                "px-3 py-1.5 rounded-lg text-sm border " +
                (canNext
                  ? "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]"
                  : "border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed")
              }
            >
              Siguiente →
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href={`/pending?line=${encodeURIComponent(lineParam)}${qs ? `&${qs.slice(1)}` : ""}`}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium px-4 py-2"
          >
            Clasificar paros →
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ===== UI bits ===== */
function CardMini({
  title,
  value,
  hint,
  ring = "ring-white/10",
}: {
  title: string;
  value: string;
  hint?: string;
  ring?: string;
}) {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
        <div className="text-slate-200/90 text-sm">{title}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
          {value || "—"}
        </div>
        {hint ? (
          <div className="mt-1 text-[11px] leading-tight text-slate-400">
            {hint}
          </div>
        ) : null}
      </div>
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ring-2 ${ring}`}
      />
    </div>
  );
}
