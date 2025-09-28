"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

/* ===== Página ===== */
export default function PerformancePage() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");

  // construir ?from&to para reutilizar en los links
  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  }, [from, to]);

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
        u.searchParams.set("step", "all");
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: ApiResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");
        setRows((data.rows || []).filter((r) => r.line_code));
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
  }, [from, to]);

  /* === Derivaciones === */
  const { pAvg, lossAvg, linesWithP } = useMemo(() => {
    // promedio ponderado por plan (si no hay, promedio simple)
    let num = 0, den = 0;
    let simpleSum = 0, simpleN = 0;
    const withP: { line: string; p: number }[] = [];
    for (const r of rows) {
      const p = typeof r.performance === "number" ? clamp01(r.performance) : null;
      if (p != null) {
        withP.push({ line: String(r.line_code), p });
        const w = Math.max(1, r.planned_runtime_sec ?? 1);
        num += p * w; den += w;
        simpleSum += p; simpleN += 1;
      }
    }
    const pAvg = den > 0 ? num / den : (simpleN > 0 ? simpleSum / simpleN : null);
    const lossAvg = pAvg == null ? null : (1 - pAvg);
    return { pAvg, lossAvg, linesWithP: withP };
  }, [rows]);

  const sorted = useMemo(
    () => [...linesWithP].sort((a, b) => b.p - a.p),
    [linesWithP]
  );

  return (
    <main className="px-5 py-6 md:px-8 md:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Performance (P)
        </h1>
        <p className="text-sm text-slate-300">
          P mide la eficiencia de velocidad: qué tan cerca operamos del ritmo ideal durante el{" "}
          <span className="font-medium">{rangeLabel(from, to)}</span>.
        </p>
      </header>

      {/* ===== KPIs ===== */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Performance (P)"
          value={pct(pAvg)}
          hint="Promedio ponderado"
          ring="ring-cyan-400/90"
          mini={<MiniDonut value={pAvg ?? 0} color="#22d3ee" />}
        />
        <KpiCard
          title="Pérdida por velocidad"
          value={pct(lossAvg)}
          hint="1 − P"
          mini={<MiniDonut value={lossAvg ?? 0} color="#94a3b8" />}
        />
        <SimpleCard
          title="Líneas consideradas"
          value={nf.format(sorted.length)}
          hint="Con datos en el rango"
        />
        <SimpleCard
          title="Tiempo analizado"
          value={durationLabel(from, to)}
          hint="Según rango seleccionado"
        />
      </section>

      {/* ===== Donut composición ===== */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 mb-6">
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">Composición</h2>
          <p className="text-sm text-slate-400">
            Proporción operada al ritmo ideal vs. gap por velocidad.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="col-span-1 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Performance (P)", value: clamp01(pAvg ?? 0) },
                    { name: "Pérdida por velocidad", value: clamp01(lossAvg ?? 0) },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="90%"
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
                    background: "rgba(2,6,23,.9)",
                    border: "1px solid rgba(255,255,255,.08)",
                    color: "#e2e8f0",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="col-span-2">
            <LegendItem color="#22d3ee" label="Performance (P)" value={pct(pAvg)} />
            <LegendItem color="#64748b" label="Pérdida por velocidad" value={pct(lossAvg)} />
            <p className="mt-2 text-xs text-slate-400">
              Proporción operada al ritmo ideal vs. gap por velocidad.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Ranking por línea (clicable + CTA Detalle) ===== */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 mb-3">
          Ranking por línea
        </h2>

        {loading && (
          <div className="text-sm text-slate-400">Cargando…</div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="text-sm text-slate-400">Sin datos en el rango.</div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map((r, idx) => {
              const href = `/dashboard/performance/${encodeURIComponent(r.line)}${qs}`;
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
                        <div className="text-slate-300 tabular-nums">{pct(r.p)}</div>
                      </div>
                      <div className="mt-2 h-2.5 w-full rounded-full overflow-hidden bg-slate-800">
                        <div
                          className="h-full"
                          style={{ width: `${clamp01(r.p) * 100}%`, backgroundColor: "#22d3ee" }}
                        />
                      </div>
                    </div>

                    {/* CTA visible en desktop, pero toda la fila ya es enlace */}
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
  ring,
  mini,
}: {
  title: string;
  value: string;
  hint?: string;
  ring?: string;
  mini?: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-slate-200/90 text-sm">{title}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </div>
            {hint ? (
              <div className="mt-1 text-xs text-slate-400">{hint}</div>
            ) : null}
          </div>
          {mini}
        </div>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ring-2 ${ring || "ring-white/10"}`}
      />
    </div>
  );
}

function SimpleCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
      <div className="text-slate-200/90 text-sm">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function MiniDonut({ value, color }: { value: number; color: string }) {
  const v = clamp01(value);
  const data = [
    { name: "v", value: v },
    { name: "rest", value: 1 - v },
  ];
  return (
    <div className="w-14 h-14">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius="70%" outerRadius="100%" dataKey="value">
            <Cell fill={color} />
            <Cell fill="#0f172a" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
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

/* ===== helpers presentacionales ===== */
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

function durationLabel(from?: string | null, to?: string | null) {
  return rangeLabel(from, to);
}
