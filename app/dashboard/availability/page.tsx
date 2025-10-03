// app/dashboard/availability/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AvailabilityParetoLauncher from "../../../components/AvailabilityParetoLauncher";

/* ===== Helpers ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null, d = 1) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;
const nf = new Intl.NumberFormat("es-ES");
const dtf = new Intl.DateTimeFormat("es-ES", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
function fmtDur(sec?: number | null) {
  if (!Number.isFinite(sec as number) || (sec ?? 0) <= 0) return "—";
  const s = Math.trunc(sec as number);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}
function rangeLabel(from?: string | null, to?: string | null) {
  if (!from || !to) return "rango actual";
  const df = new Date(from), dt = new Date(to);
  const ms = Math.max(0, dt.getTime() - df.getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

/* ===== Tipos ===== */
type RowUI = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
};
type ApiResp = { ok: true; rows: RowUI[] } | { ok: false; error: string } | any;

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

export const dynamic = "force-dynamic";

export default function AvailabilityPage() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");

  /* ===== KPIs ===== */
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiErr, setKpiErr] = useState<string | null>(null);
  const [rows, setRows] = useState<RowUI[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setKpiLoading(true);
      setKpiErr(null);
      try {
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        u.searchParams.set("step", "all");
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: ApiResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");
        setRows((data.rows || []).filter((r: RowUI) => r.line_code));
      } catch (e: any) {
        if (!alive) return;
        setKpiErr(e?.message || "Error desconocido");
        setRows([]);
      } finally {
        if (alive) setKpiLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [from, to]);

  const { aAvg, lossAvg, ranking } = useMemo(() => {
    let num = 0, den = 0;
    const list: { line: string; a: number }[] = [];
    for (const r of rows) {
      const a = typeof r.availability === "number" ? clamp01(r.availability) : null;
      if (a != null && r.line_code) {
        const w = Math.max(1, r.planned_runtime_sec ?? 1);
        num += a * w; den += w;
        list.push({ line: r.line_code, a });
      }
    }
    const aAvg = den > 0 ? num / den : null;
    const lossAvg = aAvg == null ? null : 1 - aAvg;
    return { aAvg, lossAvg, ranking: list.sort((a, b) => b.a - a.a) };
  }, [rows]);

  // ✅ Definición ÚNICA de rangeText
  const rangeText = rangeLabel(from, to);

  /* ===== Resumen de Paros - contadores ===== */
  const [countPending, setCountPending] = useState<number | null>(null);
  const [countClassified, setCountClassified] = useState<number | null>(null);
  const [countTotal, setCountTotal] = useState<number | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setCountErr(null);
      try {
        const base = new URL("/api/downtimes", window.location.origin);
        if (from) base.searchParams.set("from", from);
        if (to) base.searchParams.set("to", to);
        base.searchParams.set("limit", "1");

        const rAll = await fetch(base.toString(), { cache: "no-store" });
        const jAll = await rAll.json();
        if (!alive) return;
        if (!jAll?.ok) throw new Error(jAll?.error || "Error total_count");
        setCountTotal(jAll.total_count ?? 0);

        const uPend = new URL(base);
        uPend.searchParams.set("state", "pending");
        const rPend = await fetch(uPend.toString(), { cache: "no-store" });
        const jPend = await rPend.json();
        if (!alive) return;
        if (!jPend?.ok) throw new Error(jPend?.error || "Error pending");
        setCountPending(jPend.total_count ?? 0);

        const uClas = new URL(base);
        uClas.searchParams.set("state", "classified");
        const rClas = await fetch(uClas.toString(), { cache: "no-store" });
        const jClas = await rClas.json();
        if (!alive) return;
        if (!jClas?.ok) throw new Error(jClas?.error || "Error classified");
        setCountClassified(jClas.total_count ?? 0);
      } catch (e: any) {
        if (!alive) return;
        setCountErr(e?.message || "Error cargando contadores");
        setCountTotal(null);
        setCountPending(null);
        setCountClassified(null);
      }
    })();
    return () => { alive = false; };
  }, [from, to]);

  /* ===== Resumen de Paros - tabla ===== */
  const stateParam = sp.get("state");
  const [stateFilter, setStateFilter] = useState<"all" | "pending" | "classified">(
    stateParam === "pending" || stateParam === "classified" ? (stateParam as any) : "all"
  );

  useEffect(() => {
    const u = new URL(window.location.href);
    if (stateFilter === "all") u.searchParams.delete("state");
    else u.searchParams.set("state", stateFilter);
    window.history.replaceState(null, "", u.toString());
  }, [stateFilter]);

  const [tblLoading, setTblLoading] = useState(true);
  const [tblErr, setTblErr] = useState<string | null>(null);
  const [events, setEvents] = useState<DowntimeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * limit;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, limit)));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => {
    let alive = true;
    (async () => {
      setTblLoading(true);
      setTblErr(null);
      try {
        const u = new URL("/api/downtimes", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        if (stateFilter !== "all") u.searchParams.set("state", stateFilter);
        u.searchParams.set("limit", String(limit));
        u.searchParams.set("offset", String(offset));
        const res = await fetch(u.toString(), { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!json?.ok) throw new Error(json?.error || "Error cargando paros");
        setEvents(Array.isArray(json.rows) ? (json.rows as DowntimeRow[]) : []);
        setTotal(Number(json.total_count ?? 0));
      } catch (e: any) {
        if (!alive) return;
        setTblErr(e?.message || "Error cargando paros");
        setEvents([]);
        setTotal(0);
      } finally {
        if (alive) setTblLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [from, to, stateFilter, limit, offset]);

  return (
    <main className="px-5 py-6 md:px-8 md:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Availability (A)</h1>
        <p className="text-sm text-slate-300">
          A mide el % de tiempo planificado en que la línea estuvo disponible en el {rangeText}.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Botón Pareto dentro del card de Availability */}
        <AvailabilityParetoLauncher from={from ?? undefined} to={to ?? undefined}>
          <Card title="Availability (A)" value={kpiLoading ? "…" : pct(aAvg)} hint="Promedio ponderado" />
        </AvailabilityParetoLauncher>

        <Card title="Pérdida no planificada" value={kpiLoading ? "…" : pct(lossAvg)} hint="1 − A" />
        <Card title="Líneas consideradas" value={kpiLoading ? "…" : nf.format(ranking.length)} hint="Con datos en el rango" />
        <Card title="Tiempo analizado" value={rangeText} hint="Según rango seleccionado" />
      </section>

      {/* Resumen de Paros */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">Resumen de Paros</h2>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">Estado:</label>
            <select
              value={stateFilter}
              onChange={(e) => {
                setPage(1);
                setStateFilter(e.target.value as any);
              }}
              className="rounded-lg bg-transparent border border-white/10 px-2 py-1 text-sm text-slate-200"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="classified">Clasificados</option>
            </select>

            <label className="ml-3 text-sm text-slate-300">Filas:</label>
            <select
              value={limit}
              onChange={(e) => {
                setPage(1);
                setLimit(Number(e.target.value));
              }}
              className="rounded-lg bg-transparent border border-white/10 px-2 py-1 text-sm text-slate-200"
            >
              {[10, 15, 20, 30, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <label className="ml-3 text-sm text-slate-300">Página:</label>
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="rounded-lg bg-transparent border border-white/10 px-2 py-1 text-sm text-slate-200"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>{p}/{totalPages}</option>
              ))}
            </select>
          </div>
        </div>

        {countErr && (
          <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200 text-sm">
            {countErr}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <CounterCard title="Pendientes" value={countPending} />
          <CounterCard title="Clasificados" value={countClassified} />
          <CounterCard title="Total" value={countTotal} />
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950/60 text-slate-300">
                <tr className="whitespace-nowrap">
                  <th className="px-2 py-2 w-8" />
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Línea</th>
                  <th className="text-left px-3 py-2">Máquina</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">N2</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">N3</th>
                  <th className="text-right px-3 py-2">Duración</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {tblLoading && (
                  <tr><td colSpan={9} className="px-3 py-4 text-slate-400">Cargando…</td></tr>
                )}
                {!tblLoading && tblErr && (
                  <tr><td colSpan={9} className="px-3 py-4 text-rose-200">{tblErr}</td></tr>
                )}
                {!tblLoading && !tblErr && events.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-4 text-slate-400">Sin paros en el rango seleccionado.</td></tr>
                )}
                {!tblLoading && !tblErr && events.map((e) => <RowExpandable key={e.id} e={e} />)}
              </tbody>
            </table>
          </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-950/60">
          <div className="text-xs text-slate-400">
            {total ? `Mostrando ${Math.min(offset + 1, total)}–${Math.min(offset + limit, total)} de ${total}` : "—"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className={
                "px-3 py-1.5 rounded-lg text-sm border " +
                (canPrev ? "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]" : "border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed")
              }
            >
              ← Anterior
            </button>
            <button
              onClick={() => canNext && setPage((p) => Math.min(totalPages, p + 1))}
              disabled={!canNext}
              className={
                "px-3 py-1.5 rounded-lg text-sm border " +
                (canNext ? "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]" : "border-white/5 bg-white/[0.02] text-slate-500 cursor-not-allowed")
              }
            >
              Siguiente →
            </button>
          </div>
        </div>
        </div>
      </section>

      {/* Ranking por línea */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 mb-3">Ranking por línea</h2>

        {kpiLoading && <div className="text-sm text-slate-400">Cargando…</div>}
        {!kpiLoading && ranking.length === 0 && (
          <div className="text-sm text-slate-400">Sin datos en el rango.</div>
        )}

        {!kpiLoading && ranking.length > 0 && (
          <div className="space-y-3">
            {ranking.map((r, idx) => {
              const u = new URLSearchParams();
              if (from) u.set("from", from);
              if (to) u.set("to", to);
              const href = `/dashboard/availability/${encodeURIComponent(r.line)}${u.toString() ? `?${u.toString()}` : ""}`;
              return (
                <Link
                  key={r.line}
                  href={href}
                  className="group block rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                >
                  <div className="px-3 py-2 flex items-center gap-3">
                    <div className="w-6 text-right text-slate-400 tabular-nums">{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-100 truncate">{r.line}</div>
                        <div className="text-slate-300 tabular-nums">{pct(r.a)}</div>
                      </div>
                      <div className="mt-2 h-2.5 w-full rounded-full overflow-hidden bg-slate-800">
                        <div className="h-full" style={{ width: `${clamp01(r.a) * 100}%`, backgroundColor: "#34d399" }} />
                      </div>
                    </div>
                    <span className="ml-3 hidden md:inline-flex rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-200 group-hover:bg-white/10">
                      Detalle →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {kpiErr && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {kpiErr}
        </div>
      )}
    </main>
  );
}

/* ===== UI bits ===== */
function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
      <div className="text-slate-200/90 text-sm">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function CounterCard({ title, value }: { title: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
      <div className="text-slate-200/90 text-sm">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        {value == null ? "—" : nf.format(value)}
      </div>
      <div className="mt-1 text-xs text-slate-400">Según rango seleccionado</div>
    </div>
  );
}

function RowExpandable({ e }: { e: DowntimeRow }) {
  const [open, setOpen] = useState(false);
  const started = e.started_at ? dtf.format(new Date(e.started_at)) : "—";
  return (
    <>
      <tr className="border-t border-white/10 hover:bg-white/[0.04]">
        <td className="px-2 py-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="h-7 w-7 grid place-items-center rounded-lg border border-white/10 hover:bg-white/10 text-slate-200"
            aria-label="Ver detalle"
            title="Ver detalle"
          >
            {open ? "–" : "+"}
          </button>
        </td>
        <td className="px-3 py-2">{started}</td>
        <td className="px-3 py-2">{e.line_code ?? "—"}</td>
        <td className="px-3 py-2">{e.machine_code ?? "—"}</td>
        <td className="px-3 py-2 hidden md:table-cell">{e.n2_name ?? "—"}</td>
        <td className="px-3 py-2 hidden md:table-cell">{e.n3_name ?? "—"}</td>
        <td className="px-3 py-2 text-right">{fmtDur(e.duration_s)}</td>
        <td className="px-3 py-2">
          {e.state === "pending" ? (
            <span className="text-amber-300/90">Pendiente</span>
          ) : e.state === "classified" ? (
            <span className="text-emerald-300/90">Clasificado</span>
          ) : "—"}
        </td>
        <td className="px-3 py-2">
          <Link
            href={`/pending/${encodeURIComponent(e.id)}`}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900"
          >
            Clasificar →
          </Link>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-white/10 bg-white/[0.03]">
          <td />
          <td colSpan={8} className="px-3 py-3 text-xs text-slate-300">
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <div className="opacity-70">Inicio</div>
                <div className="tabular-nums">{started}</div>
              </div>
              <div>
                <div className="opacity-70">Duración (s)</div>
                <div className="tabular-nums">{e.duration_s ?? "—"}</div>
              </div>
              <div>
                <div className="opacity-70">ID</div>
                <div className="tabular-nums break-all">{e.id}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

