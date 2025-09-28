"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type MetricKey = "availability" | "performance" | "quality" | "oee";

type KpiRow = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  trend_pp?: number | null;
  spark?: number[] | null;
};
type KpisResponse = {
  ok: boolean;
  rows?: KpiRow[];
  error?: string;
};

export const dynamic = "force-dynamic";

const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null) => `${(clamp01(n) * 100).toFixed(1)}%`;

const METRIC_TITLES: Record<MetricKey, { title: string; color: string }> = {
  availability: { title: "Disponibilidad", color: "text-emerald-300" },
  performance: { title: "Rendimiento",  color: "text-sky-300" },
  quality:     { title: "Calidad",       color: "text-amber-300" },
  oee:         { title: "OEE",           color: "text-fuchsia-300" },
};

export default function MetricPage({ params }: { params: { metric?: string } }) {
  const m = (params.metric || "").toLowerCase();
  const metric = (["availability", "performance", "quality", "oee"].includes(m)
    ? (m as MetricKey)
    : null);

  const [rows, setRows] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/kpis?step=all`);
        const json = (await res.json()) as KpisResponse;
        if (!mounted) return;
        if (!json.ok) {
          setErr(json.error || "Error al cargar KPIs");
          setRows([]);
          return;
        }
        setRows(json.rows || []);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setRows([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const ordered = useMemo(() => {
    if (!metric) return [];
    const key = metric as keyof KpiRow;
    return (rows || [])
      .slice()
      .sort((a, b) => clamp01((b[key] as number) ?? 0) - clamp01((a[key] as number) ?? 0));
  }, [rows, metric]);

  if (!metric) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-200">
          Métrica inválida. Rutas válidas:
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><Link className="underline" href="/dashboard/availability">/dashboard/availability</Link></li>
            <li><Link className="underline" href="/dashboard/performance">/dashboard/performance</Link></li>
            <li><Link className="underline" href="/dashboard/quality">/dashboard/quality</Link></li>
            <li><Link className="underline" href="/dashboard/oee">/dashboard/oee</Link></li>
          </ul>
        </div>
      </main>
    );
  }

  const { title, color } = METRIC_TITLES[metric];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 text-slate-100">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span className="mx-2">/</span>
            <span className={`font-medium ${color}`}>{title}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{title} · ranking por línea</h1>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5">
          ← Volver
        </Link>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Líneas</h2>
          <div className="text-sm text-slate-400">
            {loading ? "Cargando…" : `${ordered.length} resultado${ordered.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70">
              <tr className="text-slate-400 whitespace-nowrap">
                <th className="text-left py-2 pr-4">Línea</th>
                <th className="text-right py-2 px-4 w-28">A</th>
                <th className="text-right py-2 px-4 w-28">P</th>
                <th className="text-right py-2 px-4 w-28">Q</th>
                <th className="text-right py-2 px-4 w-28">OEE</th>
                <th className="text-right py-2 px-4 w-36">{title}</th>
                <th className="py-2 pl-4 w-40 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={7}>Cargando…</td>
                </tr>
              )}
              {!loading && ordered.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={7}>Sin datos.</td>
                </tr>
              )}
              {!loading && ordered.map((r) => {
                const code = (r.line_code || "—").toUpperCase();
                return (
                  <tr key={code} className="border-t border-white/10 hover:bg-white/[0.06] transition-colors">
                    <td className="py-3 pr-4 font-medium">{code}</td>
                    <td className="py-3 px-4 text-right">{pct(r.availability)}</td>
                    <td className="py-3 px-4 text-right">{pct(r.performance)}</td>
                    <td className="py-3 px-4 text-right">{pct(r.quality)}</td>
                    <td className="py-3 px-4 text-right">{pct(r.oee)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${color}`}>{pct(r[metric])}</td>
                    <td className="py-3 pl-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/${params.metric}/${encodeURIComponent(code)}`}
                          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-3 py-1.5 text-xs font-medium"
                        >
                          Ver detalle de línea →
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        Próximo paso: Nivel 2 → <code>/dashboard/{params.metric}/[line]</code> (detalle por línea).
      </div>
    </main>
  );
}

