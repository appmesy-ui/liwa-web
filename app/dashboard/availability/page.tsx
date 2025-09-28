"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
// ⬇️ Importa el launcher (ruta relativa desde /app/dashboard/availability/page.tsx)
import AvailabilityParetoLauncher from "../../../components/AvailabilityParetoLauncher";

export const dynamic = "force-dynamic";

type RowUI = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;
  quality: number | null;
  oee: number | null;
  planned_s?: number | null;
  unplanned_s?: number | null;
  runtime_s?: number | null;
};

type ApiResp =
  | { ok: true; rows: RowUI[]; meta?: any }
  | { ok: false; error: string }
  | any;

const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null, d = 1) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;
const nf = new Intl.NumberFormat("es-ES");

export default function AvailabilityPage() {
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
    return () => { alive = false; };
  }, [from, to]);

  // Derivaciones
  const { aAvg, lossAvg, list } = useMemo(() => {
    let num = 0, den = 0, simpleSum = 0, simpleN = 0;
    const list: { line: string; a: number }[] = [];
    for (const r of rows) {
      const a = typeof r.availability === "number" ? clamp01(r.availability) : null;
      if (a != null) {
        list.push({ line: String(r.line_code), a });
        const w = Math.max(1, r.planned_runtime_sec ?? 1);
        num += a * w; den += w;
        simpleSum += a; simpleN += 1;
      }
    }
    const aAvg = den > 0 ? num / den : (simpleN > 0 ? simpleSum / simpleN : null);
    const lossAvg = aAvg == null ? null : (1 - aAvg);
    return { aAvg, lossAvg, list };
  }, [rows]);

  const sorted = useMemo(() => [...list].sort((a, b) => b.a - a.a), [list]);

  return (
    <main className="px-5 py-6 md:px-8 md:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Availability (A)</h1>
        <p className="text-sm text-slate-300">
          A mide el % de tiempo planificado en que la línea estuvo disponible en el {rangeLabel(from, to)}.
        </p>
      </header>

      {/* KPIs principales */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* ⬇️ La tarjeta de Availability ahora abre el modal al hacer clic */}
        <AvailabilityParetoLauncher from={from ?? undefined} to={to ?? undefined}>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 hover:border-slate-700 transition cursor-pointer">
            <div className="text-slate-200/90 text-sm">Availability (A)</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{pct(aAvg)}</div>
            <div className="mt-1 text-xs text-slate-400">Promedio ponderado</div>
          </div>
        </AvailabilityParetoLauncher>

        <Card title="Pérdida no planificada" value={pct(lossAvg)} hint="1 − A" />
        <Card title="Líneas consideradas" value={nf.format(sorted.length)} hint="Con datos en el rango" />
        <Card title="Tiempo analizado" value={rangeLabel(from, to)} hint="Según rango seleccionado" />
      </section>

      {/* Ranking */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 mb-3">Ranking por línea</h2>

        {loading && <div className="text-sm text-slate-400">Cargando…</div>}
        {!loading && sorted.length === 0 && <div className="text-sm text-slate-400">Sin datos en el rango.</div>}

        {!loading && sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map((r, idx) => {
              const href = `/dashboard/availability/${encodeURIComponent(r.line)}${qs}`;
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
                        <div
                          className="h-full"
                          style={{ width: `${clamp01(r.a) * 100}%`, backgroundColor: "#34d399" }}
                        />
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

      {err && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}
    </main>
  );
}

/* UI bits */
function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
      <div className="text-slate-200/90 text-sm">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
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

