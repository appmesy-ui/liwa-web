// app/dashboard/quality/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/* ================== Tipos del endpoint ================== */
type RowUI = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  // Unidades (si existen)
  units_total?: number | null;
  units_good?: number | null;
  units_scrap?: number | null;
  units_rework?: number | null;
};

type ApiResp =
  | { ok: true; rows: RowUI[]; meta?: any }
  | { ok: false; error: string }
  | any;

/* ================== Utils ================== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pctTxt = (v: number, dec = 2) => `${(v * 100).toFixed(dec)}%`;
const nf = new Intl.NumberFormat("es-ES");

function parseIsoOrNull(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDuration(from?: string | null, to?: string | null) {
  const df = parseIsoOrNull(from ?? null);
  const dt = parseIsoOrNull(to ?? null);
  if (!df || !dt) return "rango actual";
  const ms = Math.max(0, dt.getTime() - df.getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours} h ${remMin} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days} d ${remH} h` : `${days} d`;
}
function weightedAvg(rows: RowUI[], getter: (r: RowUI) => number | null) {
  let num = 0, den = 0;
  for (const r of rows) {
    const v = getter(r);
    if (v == null) continue;
    const w = r.planned_runtime_sec ?? 1;
    num += v * w;
    den += w;
  }
  if (!den) return null;
  return num / den;
}

/* ================== Colores y estilos ================== */
const C = {
  good: "#10B981",    // emerald-500
  scrap: "#F43F5E",   // rose-500
  rework: "#F59E0B",  // amber-500
  goal: "#22C55E",    // emerald-400
  cardBase: "rounded-2xl border p-4 shadow-sm",
  cardSkin: "bg-white/95 border-slate-200 dark:bg-slate-900 dark:border-slate-700",
};

/* ================== UI Primitives ================== */
function BigKpi({
  label, value, sub, chip,
}: { label: string; value: string; sub?: string; chip?: React.ReactNode }) {
  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="flex items-start justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-300">{label}</div>
        {chip}
      </div>
      <div className="mt-1 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Chip({ text, tone = "rose" }: { text: string; tone?: "rose" | "emerald" | "amber" | "slate" }) {
  const map: Record<string, { bg: string; fg: string }> = {
    rose: { bg: "bg-rose-500/10", fg: "text-rose-300" },
    emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-300" },
    amber: { bg: "bg-amber-500/10", fg: "text-amber-300" },
    slate: { bg: "bg-slate-500/10", fg: "text-slate-300" },
  };
  const c = map[tone];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.fg} tabular-nums`}>
      {text}
    </span>
  );
}

/* ===== BulletChart (barra 100% con objetivo) ===== */
function BulletChart({
  pct, goalPct = 0.01, // 1% por defecto
  labelLeft = "0%", labelRight = "100%",
  tooltip,
}: {
  pct: number;           // proporción 0–1 (scrap)
  goalPct?: number;      // objetivo 0–1
  labelLeft?: string;
  labelRight?: string;
  tooltip?: string;
}) {
  const v = Math.max(0, Math.min(1, pct));
  const g = Math.max(0, Math.min(1, goalPct));
  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600 dark:text-slate-300">Progreso hacia objetivo</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Objetivo ≤ {pctTxt(g)}</div>
      </div>

      <div className="relative h-5 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden" title={tooltip}>
        {/* scrap */}
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${v * 100}%`, backgroundColor: C.scrap }}
        />
        {/* marca de objetivo */}
        <div
          className="absolute inset-y-0"
          style={{ left: `calc(${g * 100}% - 1px)` }}
        >
          <div className="h-full w-0.5" style={{ backgroundColor: C.goal }} />
        </div>
      </div>

      <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{labelLeft}</span>
        <span>{labelRight}</span>
      </div>
    </div>
  );
}

function LineStackBar({ goodRatio, scrapRatio }:{ goodRatio:number; scrapRatio:number }) {
  const good = clamp01(goodRatio), scrap = clamp01(scrapRatio);
  const tot = Math.max(1e-6, good + scrap);
  return (
    <div className="mt-1 h-2.5 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
      <div className="h-full" style={{ width: `${(good / tot) * 100}%`, backgroundColor: C.good }} />
      <div className="h-full" style={{ width: `${(scrap / tot) * 100}%`, backgroundColor: C.scrap }} />
    </div>
  );
}

/* ===== Ranking (link a detalle de calidad por línea) ===== */
function LinesRanking({
  rows, qs,
}: {
  rows: {
    line: string;
    units_total?: number;
    units_good?: number;
    units_scrap?: number;
    quality?: number | null;
    goodRatio: number;
    scrapRatio: number;
  }[];
  qs: string; // "?from=...&to=..." preservado
}) {
  const usable = rows.filter(
    (r) => (r.units_total ?? 0) > 0 || typeof r.quality === "number"
  );
  if (usable.length === 0) {
    return (
      <div className={`${C.cardBase} ${C.cardSkin}`}>
        <div className="text-sm text-slate-600 dark:text-slate-300 mb-1">Top pérdidas por línea</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">Sin datos en el rango seleccionado.</div>
      </div>
    );
  }

  const sorted = [...usable].sort((a, b) => (b.units_scrap ?? 0) - (a.units_scrap ?? 0));
  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">Top pérdidas por línea</div>
      <div className="space-y-3">
        {sorted.map((r, i) => {
          const scrapPct = r.units_total
            ? (r.units_scrap ?? 0) / Math.max(1, r.units_total)
            : (1 - clamp01(r.quality ?? 0));
          const badge = r.units_scrap != null
            ? `Scrap ${pctTxt(scrapPct)} (${nf.format(r.units_scrap)} u)`
            : `Scrap ${pctTxt(scrapPct)}`;

          const href = `/dashboard/quality/${encodeURIComponent(r.line)}${qs}`;

          return (
            <div key={r.line} className="flex items-center gap-3">
              <div className="w-6 text-right tabular-nums text-slate-400 dark:text-slate-500">{i + 1}</div>

              {/* bloque principal clickable hacia detalle */}
              <Link href={href} className="min-w-24 flex-1 group">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:underline">
                    {r.line}
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums bg-rose-500/10 text-rose-300">
                    {badge}
                  </span>
                </div>
                <LineStackBar goodRatio={r.goodRatio} scrapRatio={r.scrapRatio} />
              </Link>

              {/* CTA ahora va al detalle de calidad */}
              <Link
                href={href}
                className="hidden md:inline-flex rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
                title="Ver detalle de calidad de esta línea"
              >
                Detalle →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================== Página ================== */
export default function QualityPage() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");

  // construir ?from&to para reutilizar en los links
  const qs = (() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  })();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowUI[]>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true); setError(null);
      try {
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: ApiResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");
        setRows(data.rows || []);
      } catch (e: any) { setError(e?.message || "Error desconocido"); }
      finally { if (alive) setLoading(false); }
    }
    run(); return () => { alive = false; };
  }, [from, to]);

  /* ===== Derivaciones y agregados (con “sin datos” real) ===== */
  const {
    qSafe, scrapPct, hasUnits, totalUnits, goodUnits, scrapUnits, reworkUnits,
    ratios, linesForRank, analyzedLabel, summaryLine,
  } = useMemo(() => {
    const validQ = rows.filter((r) => typeof r.quality === "number" && isFinite(r.quality as number));
    const q = validQ.length ? weightedAvg(validQ, (r) => clamp01(r.quality as number)) : null;
    const qSafe = q == null ? null : clamp01(q);
    const scrapPct = qSafe == null ? null : clamp01(1 - qSafe);

    // Unidades
    let tot = 0, good = 0, scrapU = 0, rework = 0;
    for (const r of rows) {
      const t = Math.max(0, Math.floor(r.units_total ?? 0));
      if (t > 0) {
        const rw = Math.max(0, Math.floor(r.units_rework ?? 0));
        let g = Math.max(0, Math.floor(r.units_good ?? Math.round(clamp01((r.quality ?? qSafe) ?? 0) * t)));
        let s = Math.max(0, Math.floor(r.units_scrap ?? (t - g - rw)));
        if (g + s + rw > t) s = Math.max(0, t - g - rw);
        tot += t; good += g; scrapU += s; rework += rw;
      }
    }
    const hasUnits = tot > 0;

    const donutGood = hasUnits ? good / tot : (qSafe ?? 0);
    const donutScrap = hasUnits ? scrapU / tot : (qSafe == null ? 0 : (1 - qSafe));
    const donutRework = hasUnits ? rework / tot : 0;

    const lines = rows
      .filter((r) => r.line_code)
      .filter((r) => (r.units_total ?? 0) > 0 || typeof r.quality === "number")
      .map((r) => {
        const t = Math.max(0, Math.floor(r.units_total ?? 0));
        const qRow =
          typeof r.quality === "number" && isFinite(r.quality as number)
            ? clamp01(r.quality as number)
            : 0;
        let gRatio = qRow, sRatio = 1 - qRow;
        let gU: number | undefined, sU: number | undefined;
        if (t > 0) {
          const rw = Math.max(0, Math.floor(r.units_rework ?? 0));
          const g = Math.max(0, Math.floor(r.units_good ?? Math.round(qRow * t)));
          const s = Math.max(0, Math.floor(r.units_scrap ?? (t - g - rw)));
          const totRow = Math.max(1, g + s + rw);
          gRatio = g / totRow; sRatio = s / totRow;
          gU = g; sU = s;
        }
        return {
          line: r.line_code as string,
          units_total: t || undefined,
          units_good: gU,
          units_scrap: sU,
          quality: qRow,
          goodRatio: gRatio,
          scrapRatio: sRatio,
        };
      });

    const analyzedLabel = fmtDuration(from, to);
    const summary = hasUnits
      ? `Se produjeron ${nf.format(tot)} u; ${nf.format(scrapU)} u (${pctTxt(donutScrap)}) fueron scrap${rework > 0 ? ` y ${nf.format(rework)} u (${pctTxt(donutRework)}) retrabajadas` : ""}. FPY ${pctTxt(good / tot)}.`
      : qSafe == null
        ? `Sin datos de calidad en el rango seleccionado.`
        : `Quality global ${pctTxt(qSafe)}; Scrap ${pctTxt(1 - qSafe)}.`;

    return {
      qSafe,
      scrapPct,
      hasUnits,
      totalUnits: tot,
      goodUnits: good,
      scrapUnits: scrapU,
      reworkUnits: rework,
      ratios: { good: donutGood, scrap: donutScrap, rework: donutRework },
      linesForRank: lines,
      analyzedLabel,
      summaryLine: summary,
    };
  }, [rows, from, to]);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Quality (Q)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Q mide la proporción de unidades buenas sobre el total durante el <span className="font-medium">{analyzedLabel}</span>.
        </p>
      </header>

      {/* Franja ejecutiva de KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <BigKpi
          label="Producción total"
          value={hasUnits ? nf.format(totalUnits) : "—"}
          sub={hasUnits ? "unidades en el rango" : "unidades no disponibles"}
        />
        <BigKpi
          label="Buenas"
          value={
            hasUnits
              ? nf.format(goodUnits)
              : qSafe == null
              ? "—"
              : pctTxt(qSafe)
          }
          sub={
            hasUnits
              ? `Q = ${pctTxt(goodUnits / Math.max(1, totalUnits))}`
              : qSafe == null
              ? "sin datos en el rango"
              : "promedio ponderado"
          }
        />
        <BigKpi
          label="Scrap"
          value={
            hasUnits
              ? nf.format(scrapUnits)
              : scrapPct == null
              ? "—"
              : pctTxt(scrapPct)
          }
          sub={hasUnits ? "rechazo total" : qSafe == null ? "sin datos en el rango" : "1 − Q"}
          chip={
            scrapPct != null ? <Chip text={pctTxt(hasUnits ? ratios.scrap : scrapPct)} tone="rose" /> : undefined
          }
        />
        <BigKpi
          label="Retrabajo"
          value={hasUnits ? nf.format(reworkUnits) : "—"}
          sub={hasUnits ? `(${pctTxt(ratios.rework)})` : "no disponible"}
          chip={hasUnits && reworkUnits > 0 ? <Chip text={`${pctTxt(ratios.rework)}`} tone="amber" /> : undefined}
        />
        <BigKpi
          label="FPY"
          value={
            hasUnits
              ? pctTxt(goodUnits / Math.max(1, totalUnits))
              : qSafe == null
              ? "—"
              : pctTxt(qSafe)
          }
          sub="First Pass Yield"
        />
      </section>

      {/* Frase ejecutiva */}
      <p className="text-sm text-slate-700 dark:text-slate-300 border-l-4 border-emerald-500 pl-3">
        {summaryLine}
      </p>

      {/* Scrap Panel v2 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${C.cardBase} ${C.cardSkin}`}>
          <div className="flex items-start justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">Scrap (global)</div>
            {scrapPct != null ? <Chip text={pctTxt(ratios.scrap)} tone="rose" /> : null}
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {scrapPct == null ? "—" : pctTxt(ratios.scrap)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {hasUnits ? `(${nf.format(scrapUnits)} u)` : scrapPct == null ? "sin datos" : "sin unidades"}
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Objetivo ≤ <span className="font-medium text-emerald-400">1,00%</span>
          </div>
        </div>

        <div className="lg:col-span-2">
          {scrapPct == null ? (
            <div className={`${C.cardBase} ${C.cardSkin} text-sm text-slate-500 dark:text-slate-400`}>
              Sin datos de calidad en el rango seleccionado.
            </div>
          ) : (
            <>
              <BulletChart
                pct={ratios.scrap}
                goalPct={0.01}
                labelLeft="0%"
                labelRight="100%"
                tooltip={
                  hasUnits
                    ? `Scrap ${pctTxt(ratios.scrap)} · ${nf.format(scrapUnits)} u`
                    : `Scrap ${pctTxt(ratios.scrap)}`
                }
              />
              {/* micro-stats */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-300">
                  <strong className="font-semibold">Buenas</strong>
                  <span className="tabular-nums">
                    {hasUnits ? `${nf.format(goodUnits)} u` : qSafe == null ? "—" : pctTxt(qSafe)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-300">
                  <strong className="font-semibold">Scrap</strong>
                  <span className="tabular-nums">
                    {pctTxt(ratios.scrap)}{hasUnits ? ` · ${nf.format(scrapUnits)} u` : ""}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-300">
                  <strong className="font-semibold">Scrap / 1.000</strong>
                  <span className="tabular-nums">
                    {hasUnits && totalUnits > 0 ? ((scrapUnits / totalUnits) * 1000).toFixed(1) : "—"}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Ranking por línea con link a DETALLE (no a paros) */}
      <section>
        <LinesRanking rows={linesForRank} qs={qs} />
      </section>

      {/* Estado de carga / error */}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          Error: {error}
        </div>
      ) : null}
      {loading ? <div className="text-sm text-slate-500 dark:text-slate-400">Cargando datos…</div> : null}
    </div>
  );
}

