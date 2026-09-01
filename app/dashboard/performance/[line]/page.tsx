// app/dashboard/performance/[line]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Gauge, Clock4, Rocket, ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export const dynamic = "force-dynamic";

/* ===== Tipos ===== */
type SpeedSegment = {
  id: string;
  started_at: string;
  ended_at: string;
  duration_s: number;
  ideal_rate_u_min: number | null;
  actual_rate_u_min: number | null;
  sku?: string | null;
  notes?: string | null;
};

type PerfDetail = {
  line_code: string;
  performance?: number | null; // 0–1
  planned_s?: number | null;   // segundos planificados (turno)
  runtime_s?: number | null;   // segundos efectivos en marcha
  speed_segments?: SpeedSegment[];
};

type ApiResp =
  | { ok: true; data: PerfDetail }
  | { ok: false; error: string }
  | any;

/* ===== Utils ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));

const pct = (n?: number | null, d = 2) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;

const nf = new Intl.NumberFormat("es-ES");

const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Formateo de duración: si <60s mostramos en segundos, si no en h:mm
const fmtHM = (s?: number | null) => {
  const v = Math.max(0, Math.floor(Number(s || 0)));

  // Segmentos muy cortos: mostrar en segundos
  if (v > 0 && v < 60) {
    return `${v}s`;
  }

  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

/* ===== Página ===== */
export default function PerformanceByLinePage({
  params,
}: {
  params: { line: string };
}) {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const org_id = sp.get("org_id");
  const plant_id = sp.get("plant_id");

  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (org_id) u.set("org_id", org_id);
    if (plant_id) u.set("plant_id", plant_id);
    const s = u.toString();
    return s ? `?${s}` : "";
  }, [from, to, org_id, plant_id]);

  const lineParam = decodeURIComponent(params.line || "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<PerfDetail | null>(null);

  useEffect(() => {
    let mounted = true;

    const safeJson = async (res: Response) => {
      try {
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) KPI base desde /api/kpis (misma fuente que el resumen)
        const uK = new URL("/api/kpis", window.location.origin);
        if (from) uK.searchParams.set("from", from);
        if (to) uK.searchParams.set("to", to);
        if (org_id) uK.searchParams.set("org_id", org_id);
        if (plant_id) uK.searchParams.set("plant_id", plant_id);
        uK.searchParams.set("step", "kpis");
        const rK = await fetch(uK.toString(), { cache: "no-store" });
        const jK = (await safeJson(rK)) as any;

        const row = jK?.ok
          ? (jK.rows || []).find(
              (r: any) =>
                (r.line_code || "").toUpperCase() === lineParam.toUpperCase()
            )
          : null;

        const perfFromRow: number | null =
          typeof row?.performance === "number" ? row.performance : null;

        const plannedFromRow: number | null =
          typeof row?.planned_runtime_sec === "number"
            ? row.planned_runtime_sec
            : null;

        // NUEVO: runtime desde la misma vista de KPIs (v_oee_by_shift → v_kpis_ui_cards)
        const runtimeFromRow: number | null =
          typeof row?.run_time_s === "number" ? row.run_time_s : null;

        // 2) Detalle desde /api/performance (segmentos, runtime, etc.)
        const u = new URL("/api/performance", window.location.origin);
        u.searchParams.set("line", lineParam);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        if (org_id) u.searchParams.set("org_id", org_id);
        if (plant_id) u.searchParams.set("plant_id", plant_id);

        const res = await fetch(u.toString(), { cache: "no-store" });
        const json = (await safeJson(res)) as ApiResp | null;

        const det = json?.ok ? ((json as any).data as PerfDetail) : null;

        if (!mounted) return;

        // Construimos el detalle final alineando con los KPIs de turno
        if (det) {
          setDetail({
            ...det,
            performance: det.performance ?? perfFromRow,
            planned_s: plannedFromRow ?? det.planned_s ?? null,
            runtime_s: runtimeFromRow ?? det.runtime_s ?? null,
          });
        } else {
          setDetail({
            line_code: lineParam,
            performance: perfFromRow,
            planned_s: plannedFromRow,
            runtime_s: runtimeFromRow,
            speed_segments: [],
          });
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setDetail({
          line_code: lineParam,
          performance: null,
          planned_s: null,
          runtime_s: null,
          speed_segments: [],
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [lineParam, from, to, org_id, plant_id]);

  const segmentsRaw = useMemo(
    () =>
      (detail?.speed_segments || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        ),
    [detail]
  );

  const perf = clamp01(detail?.performance ?? null);
  const loss = perf == null ? null : clamp01(1 - perf);

  // ====== Datos para sparkline ======
  const chartData = useMemo(() => {
    return segmentsRaw.map((s) => {
      const label = dtf.format(new Date(s.started_at));
      const Pseg =
        s.actual_rate_u_min && s.ideal_rate_u_min && s.ideal_rate_u_min > 0
          ? Math.min(1, Math.max(0, s.actual_rate_u_min / s.ideal_rate_u_min))
          : null;
      return {
        label,
        ideal: s.ideal_rate_u_min ?? null,
        actual: s.actual_rate_u_min ?? null,
        P: Pseg,
      };
    });
  }, [segmentsRaw]);

  /* ====== Paginación de segmentos ====== */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // 10 / 25 / 50

  useEffect(() => {
    // si cambia el rango o la línea, volvemos a página 1
    setPage(1);
  }, [lineParam, from, to, org_id, plant_id]);

  const total = segmentsRaw.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const segments = segmentsRaw.slice(startIdx, endIdx);

  function goto(p: number) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
  }

  return (
    <main className="liwa-page max-w-7xl mx-auto px-4 sm:px-5 md:px-8 py-6 md:py-8 text-slate-100">
      {/* Breadcrumb + back */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-slate-400">
          <Link href={`/dashboard${qs}`} className="hover:underline">
            Dashboard
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/dashboard/performance${qs}`} className="hover:underline">
            Performance
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-cyan-300">
            {detail?.line_code || lineParam}
          </span>
        </div>
        <Link
          href={`/dashboard/performance${qs}`}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </Link>
      </div>

      {/* Resumen KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Card
          title="Performance (P)"
          value={pct(perf)}
          hint="Promedio ponderado"
          icon={<Gauge className="w-4 h-4" />}
          ring="ring-cyan-400/90"
        />
        <Card
          title="Pérdida por velocidad"
          value={pct(loss)}
          hint="1 − P"
        />
        <Card
          title="Tiempo planificado"
          value={fmtHM(detail?.planned_s)}
          icon={<Clock4 className="w-4 h-4" />}
        />
        <Card
          title="Tiempo efectivo en marcha"
          value={fmtHM(detail?.runtime_s)}
          icon={<Rocket className="w-4 h-4" />}
        />
      </div>

      {err && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}

      {/* Composición P vs Gap */}
      <div className="liwa-panel p-4 md:p-5 mb-6">
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Composición</h2>
        </div>
        <Stack100
          leftLabel="Operado (P)"
          leftRatio={clamp01(perf ?? 0)}
          rightLabel="Pérdida por velocidad"
          rightRatio={clamp01(loss ?? 0)}
        />
      </div>

      {/* Sparkline ideal vs real */}
      <div className="liwa-panel p-4 md:p-5 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Ritmo por segmento
          </h2>
          <span className="text-sm text-slate-400">
            {loading ? "Cargando…" : `${total} tramo${total === 1 ? "" : "s"}`}
          </span>
        </div>

        {total > 0 ? (
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  minTickGap={28}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any, n: string) =>
                    n === "P"
                      ? `${(v * 100).toFixed(1)}%`
                      : `${nf.format(v)} u/min`
                  }
                  contentStyle={{
                    background: "rgba(2,6,23,.92)",
                    border: "1px solid rgba(255,255,255,.08)",
                    color: "#e2e8f0",
                    borderRadius: 10,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  name="Ideal (u/min)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Real (u/min)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="P"
                  name="P seg."
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            Sin segmentos en el rango seleccionado.
          </div>
        )}
      </div>

      {/* Segmentos de velocidad (tabla + paginación) */}
      <div className="liwa-panel p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Segmentos de velocidad
          </h2>

          {/* Controles de paginación */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Filas:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>

            <div className="text-xs text-slate-400 tabular-nums">
              {total === 0 ? "0–0" : `${startIdx + 1}–${endIdx}`} de {total}
            </div>

            <div className="inline-flex items-center gap-1">
              <button
                onClick={() => goto(1)}
                disabled={safePage === 1}
                className="rounded-md border border-white/10 px-2 py-1 text-xs disabled:opacity-40 hover:bg-white/5"
                aria-label="Primera página"
              >
                «
              </button>
              <button
                onClick={() => goto(safePage - 1)}
                disabled={safePage === 1}
                className="rounded-md border border-white/10 px-2 py-1 text-xs disabled:opacity-40 hover:bg-white/5"
                aria-label="Anterior"
              >
                ‹
              </button>
              <span className="px-2 text-xs tabular-nums">
                {safePage}/{totalPages}
              </span>
              <button
                onClick={() => goto(safePage + 1)}
                disabled={safePage === totalPages}
                className="rounded-md border border-white/10 px-2 py-1 text-xs disabled:opacity-40 hover:bg-white/5"
                aria-label="Siguiente"
              >
                ›
              </button>
              <button
                onClick={() => goto(totalPages)}
                disabled={safePage === totalPages}
                className="rounded-md border border-white/10 px-2 py-1 text-xs disabled:opacity-40 hover:bg-white/5"
                aria-label="Última página"
              >
                »
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70 sticky top-0">
              <tr className="text-slate-400 whitespace-nowrap">
                <th className="text-left py-2 pr-4">Inicio</th>
                <th className="text-left py-2 px-4">Fin</th>
                <th className="text-right py-2 px-4">Duración</th>
                <th className="text-right py-2 px-4">Ritmo ideal</th>
                <th className="text-right py-2 px-4">Ritmo real</th>
                <th className="text-right py-2 px-4">Gap</th>
                <th className="text-left py-2 px-4">SKU</th>
                <th className="text-left py-2 px-4">Notas</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={8}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && total === 0 && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={8}>
                    Sin segmentos registrados.
                  </td>
                </tr>
              )}
              {!loading &&
                segments.map((s) => {
                  const gap =
                    (s.ideal_rate_u_min ?? 0) > 0 &&
                    s.actual_rate_u_min != null
                      ? Math.max(
                          0,
                          (s.ideal_rate_u_min ?? 0) -
                            (s.actual_rate_u_min ?? 0)
                        )
                      : 0;
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-white/10 hover:bg-white/[0.06] transition-colors"
                    >
                      <td className="py-3 pr-4">
                        {dtf.format(new Date(s.started_at))}
                      </td>
                      <td className="py-3 px-4">
                        {dtf.format(new Date(s.ended_at))}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {fmtHM(s.duration_s)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {s.ideal_rate_u_min == null
                          ? "—"
                          : `${nf.format(s.ideal_rate_u_min)} u/min`}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {s.actual_rate_u_min == null
                          ? "—"
                          : `${nf.format(s.actual_rate_u_min)} u/min`}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {nf.format(gap)} u/min
                      </td>
                      <td className="py-3 px-4">{s.sku || "—"}</td>
                      <td className="py-3 px-4">{s.notes || "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

/* ===== UI bits ===== */
function Card({
  title,
  value,
  hint,
  icon,
  ring = "ring-white/10",
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  ring?: string;
}) {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
        <div className="flex items-center gap-2 text-slate-200/90 text-sm">
          {icon ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/5">
              {icon}
            </span>
          ) : null}
          <span>{title}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
          {value || "—"}
        </div>
        {hint ? (
          <div className="mt-1 text-xs text-slate-400">{hint}</div>
        ) : null}
      </div>
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ring-2 ${ring}`}
      />
    </div>
  );
}

function Stack100({
  leftLabel,
  leftRatio,
  rightLabel,
  rightRatio,
}: {
  leftLabel: string;
  leftRatio: number;
  rightLabel: string;
  rightRatio: number;
}) {
  const l = clamp01(leftRatio);
  const r = clamp01(rightRatio);
  const tot = Math.max(1e-6, l + r);
  const pL = (l / tot) * 100;
  const pR = (r / tot) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-300 mb-2">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="h-4 w-full rounded-full overflow-hidden bg-slate-800">
        <div
          className="h-full"
          style={{ width: `${pL}%`, backgroundColor: "#06b6d4" }}
        />
        <div
          className="h-full"
          style={{ width: `${pR}%`, backgroundColor: "#64748b" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span className="tabular-nums">{pct(l)}</span>
        <span className="tabular-nums">{pct(r)}</span>
      </div>
    </div>
  );
}
