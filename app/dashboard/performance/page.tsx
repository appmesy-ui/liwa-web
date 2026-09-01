// app/dashboard/performance/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Gauge, GaugeCircle, SlidersHorizontal, CalendarClock, Info } from "lucide-react";

export const dynamic = "force-dynamic";

/* ===== Tipos alineados con /api/kpis (resumen UI) ==== */
type RowUI = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null; // 0–1
  quality: number | null;
  oee: number | null;
};

type ApiResp =
  | { ok: true; rows: RowUI[]; meta?: any }
  | { ok: false; error: string }
  | any;

/* ===== Utils ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null, d = 1) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;
const nf = new Intl.NumberFormat("es-ES");

function bandForP(p: number) {
  const v = clamp01(p);
  if (v >= 0.95) return { key: "high", label: "Óptimo", bg: "bg-emerald-500/20", bar: "linear-gradient(90deg,#10b981,#34d399)", txt: "text-emerald-300", ring: "ring-emerald-400/50" };
  if (v >= 0.90) return { key: "mid", label: "Atención", bg: "bg-amber-500/15", bar: "linear-gradient(90deg,#f59e0b,#fbbf24)", txt: "text-amber-300", ring: "ring-amber-400/40" };
  return { key: "low", label: "Crítico", bg: "bg-rose-500/20", bar: "linear-gradient(90deg,#ef4444,#f43f5e)", txt: "text-rose-300", ring: "ring-rose-400/40" };
}

/* ===== Página ===== */
export default function PerformancePage() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const org_id = sp.get("org_id");
  const plant_id = sp.get("plant_id");

  // construir ?from&to&org_id&plant_id para reutilizar en los links
  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (org_id) u.set("org_id", org_id);
    if (plant_id) u.set("plant_id", plant_id);
    const s = u.toString();
    return s ? `?${s}` : "";
  }, [from, to, org_id, plant_id]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<RowUI[]>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        if (org_id) u.searchParams.set("org_id", org_id);
        if (plant_id) u.searchParams.set("plant_id", plant_id);
        u.searchParams.set("step", "kpis"); // solo KPIs aquí

        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: ApiResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");

        setRows((data.rows || []).filter((r) => !!r.line_code));
      } catch (e: any) {
        setErr(e?.message || "Error desconocido");
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [from, to, org_id, plant_id]);

  /* === Derivaciones === */
  const { pAvg, lossAvg, linesWithP, weightedPlan } = useMemo(() => {
    // promedio ponderado por plan (si no hay, promedio simple)
    let num = 0, den = 0;
    let simpleSum = 0, simpleN = 0;
    const withP: { line: string; p: number; w: number }[] = [];
    for (const r of rows) {
      const p = typeof r.performance === "number" ? clamp01(r.performance) : null;
      if (p != null) {
        const w = Math.max(1, r.planned_runtime_sec ?? 1);
        withP.push({ line: String(r.line_code), p, w });
        num += p * w;
        den += w;
        simpleSum += p; simpleN += 1;
      }
    }
    const pAvg = den > 0 ? num / den : (simpleN > 0 ? simpleSum / simpleN : null);
    const lossAvg = pAvg == null ? null : (1 - pAvg);
    return { pAvg, lossAvg, linesWithP: withP, weightedPlan: den };
  }, [rows]);

  const sorted = useMemo(
    () => [...linesWithP].sort((a, b) => b.p - a.p),
    [linesWithP]
  );

  const linesCount = sorted.length;

  return (
    <main className="liwa-page px-3 sm:px-4 md:px-8 py-5 md:py-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-cyan-400/5 to-transparent p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-100">
              Performance (P)
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Eficiencia de velocidad en el <span className="font-medium">{rangeLabel(from, to)}</span>.
            </p>
          </div>
          {pAvg != null && (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 rounded-lg border border-white/10 px-2 py-1">
              <Info className="w-3.5 h-3.5" />
              Promedio ponderado por plan: <span className="tabular-nums font-medium">{pct(pAvg,1)}</span>
            </div>
          )}
        </div>
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" />
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          title="Performance (P)"
          value={pct(pAvg)}
          hint="Promedio ponderado"
          icon={<Gauge className="w-4 h-4" />}
          accent="from-cyan-500/25 to-cyan-400/10"
          ring="ring-cyan-400/60"
          mini={<MiniDonut value={pAvg ?? 0} color="#22d3ee" center={pct(pAvg)} />}
        />
        <KpiCard
          title="Pérdida por velocidad"
          value={pct(lossAvg)}
          hint="1 − P"
          icon={<GaugeCircle className="w-4 h-4" />}
          accent="from-slate-300/15 to-slate-200/5"
          ring="ring-slate-300/40"
          mini={<MiniDonut value={lossAvg ?? 0} color="#94a3b8" center={pct(lossAvg)} />}
        />
        <KpiCard
          title="Líneas consideradas"
          value={nf.format(linesCount)}
          hint="Con datos en el rango"
          icon={<SlidersHorizontal className="w-4 h-4" />}
          accent="from-sky-400/15 to-sky-300/5"
        />
        <KpiCard
          title="Tiempo planificado"
          value={weightedPlan ? fmtHM(weightedPlan) : "—"}
          hint="Suma ponderación"
          icon={<CalendarClock className="w-4 h-4" />}
          accent="from-cyan-400/10 to-cyan-300/0"
        />
      </section>

      {/* Donut composición */}
      <section className="liwa-panel p-4 md:p-5 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Composición</h2>
            <p className="text-sm text-slate-400">
              Proporción operada al ritmo ideal vs. gap por velocidad.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400/90" /> P
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400/80 ml-3" /> Gap
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="col-span-1 h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Performance (P)", value: clamp01(pAvg ?? 0) },
                    { name: "Pérdida por velocidad", value: clamp01(lossAvg ?? 0) },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell fill="#22d3ee" />
                  <Cell fill="#64748b" />
                </Pie>
                <Tooltip
                  formatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
                  labelFormatter={() => "Composición"}
                  contentStyle={{
                    background: "rgba(2,6,23,.92)",
                    border: "1px solid rgba(255,255,255,.08)",
                    color: "#e2e8f0",
                    borderRadius: 10,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center label */}
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <div className="text-2xl font-semibold tabular-nums">{pct(pAvg)}</div>
                <div className="text-xs text-slate-400">Operado a ritmo ideal</div>
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <LegendItem color="#22d3ee" label="Performance (P)" value={pct(pAvg)} />
            <LegendItem color="#64748b" label="Pérdida por velocidad" value={pct(lossAvg)} />
            <p className="mt-2 text-xs text-slate-400">
              Valores calculados sobre ventanas de turno consolidadas en BD.
            </p>
          </div>
        </div>
      </section>

      {/* Ranking por línea — mejorado */}
      <section className="liwa-panel p-4 md:p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            Ranking por línea
          </h2>
          {pAvg != null && (
            <div className="text-xs text-slate-400">
              Base de comparación: <span className="tabular-nums">{pct(pAvg)}</span>
            </div>
          )}
        </div>

        {loading && <SkeletonList rows={4} />}

        {!loading && sorted.length === 0 && (
          <div className="text-sm text-slate-400">Sin datos en el rango.</div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map((r, idx) => {
              const href = `/dashboard/performance/${encodeURIComponent(r.line)}${qs}`;
              const p = clamp01(r.p);
              const band = bandForP(p);
              const pStr = `${(p * 100).toFixed(1)}%`;
              const delta = pAvg != null ? (p - pAvg) * 100 : null; // puntos porcentuales
              const deltaStr =
                delta == null
                  ? ""
                  : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp`;

              return (
                <Link
                  key={r.line}
                  href={href}
                  className="group block rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.02] to-white/[0.01] hover:from-white/[0.05] hover:to-white/[0.03] transition-colors"
                >
                  <div className="px-3 py-3 flex items-center gap-3">
                    {/* posición */}
                    <div
                      className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg text-xs font-bold ${band.bg} ${band.txt} ring-1 ring-inset ${band.ring}`}
                      title={band.label}
                    >
                      {idx + 1}
                    </div>

                    {/* contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-100 truncate">{r.line}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200 tabular-nums">{pStr}</span>
                          {pAvg != null && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
                                delta! >= 0
                                  ? "bg-emerald-400/15 text-emerald-300"
                                  : "bg-rose-400/15 text-rose-300"
                              }`}
                              title={`Diferencia vs promedio (${pct(pAvg)})`}
                            >
                              {deltaStr}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* barra con gradiente según banda */}
                      <div className="mt-2 h-2.5 w-full rounded-full overflow-hidden bg-slate-800">
                        <div
                          className="h-full transition-all duration-700"
                          style={{
                            width: `${p * 100}%`,
                            background: band.bar,
                          }}
                          title={`Nivel: ${band.label}`}
                        />
                      </div>
                    </div>

                    {/* CTA */}
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

      {err && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}
    </main>
  );
}

/* ====== UI bits ====== */
function KpiCard({
  title,
  value,
  hint,
  icon,
  accent = "from-white/[0.05] to-white/[0.02]",
  ring,
  mini,
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: string; // gradiente suave
  ring?: string;
  mini?: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <div
        className={`rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-4 sm:p-5 backdrop-blur-sm`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-slate-200/90 text-sm">
              {icon ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/5">
                  {icon}
                </span>
              ) : null}
              <span>{title}</span>
            </div>
            <div className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </div>
            {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
          </div>
          {mini}
        </div>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ring-2 ${
          ring || "ring-white/10"
        }`}
      />
    </div>
  );
}

function MiniDonut({
  value,
  color,
  center,
}: {
  value: number;
  color: string;
  center?: string;
}) {
  const v = clamp01(value);
  const data = [
    { name: "v", value: v },
    { name: "rest", value: 1 - v },
  ];
  return (
    <div className="relative w-16 h-16">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius="70%" outerRadius="100%" dataKey="value">
            <Cell fill={color} />
            <Cell fill="#0f172a" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center ? (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="text-xs font-semibold tabular-nums text-slate-100">
            {center}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-300">
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
        >
          <div className="px-3 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="h-3 w-1/3 bg-white/10 rounded animate-pulse" />
              <div className="mt-2 h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-white/10 animate-pulse" />
              </div>
            </div>
            <div className="w-20 h-6 rounded-full bg-white/10 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== helpers presentacionales ===== */
function rangeLabel(from?: string | null, to?: string | null) {
  if (!from || !to) return "rango actual";
  const df = new Date(from),
    dt = new Date(to);
  const ms = Math.max(0, dt.getTime() - df.getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}
function fmtHM(s?: number | null) {
  const v = Math.max(0, Math.floor(Number(s || 0)));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
