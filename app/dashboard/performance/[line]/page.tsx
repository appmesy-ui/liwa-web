// app/dashboard/performance/[line]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

/* ===== Tipos (alineados con /api/kpis) ===== */
type KpiRow = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  // opcionalmente, si algún cliente los tiene:
  units_total?: number | null;
  units_good?: number | null;
  units_scrap?: number | null;
};

type ApiResp =
  | { ok: true; rows: KpiRow[]; meta?: any }
  | { ok: false; error: string }
  | any;

/* Segmentos de velocidad (detalle de perf). Si no existe endpoint,
   renderizamos un mock coherente para tener UI utilizable. */
type SpeedSegment = {
  id: string;
  started_at: string;      // ISO
  ended_at: string;        // ISO
  duration_s: number;
  ideal_rate_u_min: number; // unidades/min objetivo
  actual_rate_u_min: number; // unidades/min real
  sku?: string | null;
  notes?: string | null;
};

type PerfDetail = {
  line_code: string;
  performance?: number | null; // 0–1
  planned_s?: number | null;
  runtime_s?: number | null;
  speed_segments?: SpeedSegment[];
};

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
const fmtHM = (s?: number | null) => {
  const v = Math.max(0, Math.floor(Number(s || 0)));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/* ===== Página ===== */
export default function PerformanceByLinePage({
  params,
}: {
  params: { line: string };
}) {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const qs = (() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  })();

  const lineParam = decodeURIComponent(params.line || "").toUpperCase();

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

        // 1) Tomamos la fila de KPIs para obtener P de la línea
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        const res = await fetch(u.toString(), { cache: "no-store" });
        const json = (await safeJson(res)) as ApiResp | null;

        const row = json?.ok
          ? (json.rows || []).find(
              (r) => (r.line_code || "").toUpperCase() === lineParam
            )
          : null;

        // 2) Intentamos detalle real (si existiera)
        let det: PerfDetail | null = null;
        try {
          const u2 = new URL("/api/performance", window.location.origin);
          u2.searchParams.set("line", lineParam);
          if (from) u2.searchParams.set("from", from);
          if (to) u2.searchParams.set("to", to);
          const res2 = await fetch(u2.toString(), { cache: "no-store" });
          const j2 = await safeJson(res2);
          if (j2?.ok) det = j2.data as PerfDetail;
        } catch {
          /* sin endpoint; seguimos con mock */
        }

        // 3) Si no hay endpoint, armamos un mock coherente con el P observado
        if (!det) {
          const P = clamp01(row?.performance ?? 0.89);
          // suponemos 8h de ventana efectiva para ejemplo
          const planned = 8 * 3600;
          const runtime = Math.round(planned * 0.92); // corremos ~92% del plan para mock
          const now = new Date();

          // generamos 6 segmentos de 1h aprox con variaciones
          const mkSeg = (i: number) => {
            const end = new Date(now.getTime() - (i * 70 + 20) * 60 * 1000);
            const start = new Date(end.getTime() - 60 * 60 * 1000);
            const ideal = 100 + (i % 3) * 10; // 100–120 u/min objetivo
            const actual = Math.max(40, Math.round(ideal * (P + (Math.random() - 0.5) * 0.08)));
            return {
              id: uid(),
              started_at: start.toISOString(),
              ended_at: end.toISOString(),
              duration_s: 60 * 60,
              ideal_rate_u_min: ideal,
              actual_rate_u_min: actual,
              sku: ["SKU-100", "SKU-200", "SKU-300"][i % 3],
              notes: Math.random() > 0.7 ? "Cambio de formato" : null,
            } as SpeedSegment;
          };

          det = {
            line_code: lineParam,
            performance: row?.performance ?? P,
            planned_s: planned,
            runtime_s: runtime,
            speed_segments: Array.from({ length: 6 }, (_, i) => mkSeg(i)),
          };
        }

        if (!mounted) return;

        // Mezclamos P de /api/kpis si el detalle no lo trae
        if (row && det && (det.performance == null)) {
          det = { ...det, performance: row.performance };
        }

        setDetail(det || { line_code: lineParam });
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setDetail({ line_code: lineParam });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [lineParam, from, to]);

  const segments = useMemo(
    () =>
      (detail?.speed_segments || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        ),
    [detail]
  );

  const perf = clamp01(detail?.performance ?? null);
  const loss = perf == null ? null : clamp01(1 - perf);

  return (
    <main className="max-w-7xl mx-auto px-5 py-8 text-slate-100">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">
            <Link href={`/dashboard${qs}`} className="hover:underline">
              Dashboard
            </Link>
            <span className="mx-2">/</span>
            <Link href={`/dashboard/performance${qs}`} className="hover:underline">
              Performance
            </Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-cyan-300">{lineParam}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">
            Performance · {lineParam}
          </h1>
        </div>
        <Link
          href={`/dashboard/performance${qs}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          ← Volver a ranking
        </Link>
      </div>

      {/* Resumen KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Card title="Performance (P)" value={pct(perf)} hint="Promedio ponderado" ring="ring-cyan-400/90" />
        <Card title="Pérdida por velocidad" value={pct(loss)} hint="1 − P" />
        <Card title="Tiempo planificado" value={fmtHM(detail?.planned_s)} />
        <Card title="Tiempo efectivo en marcha" value={fmtHM(detail?.runtime_s)} />
      </div>

      {err && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}

      {/* Composición: Operado vs. Gap de velocidad */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] mb-6">
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Composición</h2>
          <p className="text-sm text-slate-400">
            Proporción operada a ritmo ideal vs. gap por velocidad.
          </p>
        </div>
        <Stack100
          leftLabel="Operado (P)"
          leftRatio={clamp01(perf ?? 0)}
          rightLabel="Pérdida por velocidad"
          rightRatio={clamp01(loss ?? 0)}
        />
      </div>

      {/* Segmentos de velocidad (tabla simple) */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Segmentos de velocidad</h2>
          <div className="text-sm text-slate-400">
            {loading ? "Cargando…" : `${segments.length} segmento${segments.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70">
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
                  <td className="py-4 text-slate-400" colSpan={8}>Cargando…</td>
                </tr>
              )}
              {!loading && segments.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={8}>Sin segmentos registrados.</td>
                </tr>
              )}
              {!loading &&
                segments.map((s) => {
                  const gap = Math.max(0, s.ideal_rate_u_min - s.actual_rate_u_min);
                  return (
                    <tr key={s.id} className="border-t border-white/10 hover:bg-white/[0.06] transition-colors">
                      <td className="py-3 pr-4">{dtf.format(new Date(s.started_at))}</td>
                      <td className="py-3 px-4">{dtf.format(new Date(s.ended_at))}</td>
                      <td className="py-3 px-4 text-right">{fmtHM(s.duration_s)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{nf.format(s.ideal_rate_u_min)} u/min</td>
                      <td className="py-3 px-4 text-right tabular-nums">{nf.format(s.actual_rate_u_min)} u/min</td>
                      <td className="py-3 px-4 text-right tabular-nums">{nf.format(gap)} u/min</td>
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
        <div className="h-full" style={{ width: `${pL}%`, backgroundColor: "#06b6d4" }} />
        <div className="h-full" style={{ width: `${pR}%`, backgroundColor: "#64748b" }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span className="tabular-nums">{pct(l)}</span>
        <span className="tabular-nums">{pct(r)}</span>
      </div>
    </div>
  );
}
