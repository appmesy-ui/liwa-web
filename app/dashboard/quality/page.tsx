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
    if (v == null || !Number.isFinite(v)) continue;
    const w = Math.max(1, r.planned_runtime_sec ?? 1);
    num += v * w;
    den += w;
  }
  if (!den) return null;
  return num / den;
}

/* ================== Colores y estilos ================== */
const C = {
  good: "#10B981",
  scrap: "#F43F5E",
  cardBase: "rounded-2xl border p-4 shadow-sm",
  cardSkin: "border-white/10 bg-white/[0.04]",
};

/* ================== UI Primitives ================== */
function BigKpi({
  label, value, sub, chip,
}: { label: string; value: string; sub?: string; chip?: React.ReactNode }) {
  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="flex items-start justify-between">
        <div className="text-sm text-slate-300">{label}</div>
        {chip}
      </div>
      <div className="mt-1 text-3xl md:text-4xl font-semibold tracking-tight text-slate-100 tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Chip({ text, tone = "rose" }: { text: string; tone?: "rose" | "emerald" | "slate" }) {
  const map: Record<string, { bg: string; fg: string }> = {
    rose: { bg: "bg-rose-500/10", fg: "text-rose-300" },
    emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-300" },
    slate: { bg: "bg-slate-500/10", fg: "text-slate-300" },
  };
  const c = map[tone];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.fg} tabular-nums`}>
      {text}
    </span>
  );
}

function LineStackBar({ goodRatio, scrapRatio }:{ goodRatio:number; scrapRatio:number }) {
  const good = clamp01(goodRatio), scrap = clamp01(scrapRatio);
  const tot = Math.max(1e-6, good + scrap);
  return (
    <div className="mt-1 h-2.5 w-full rounded-full overflow-hidden bg-slate-800">
      <div className="h-full" style={{ width: `${(good / tot) * 100}%`, backgroundColor: C.good }} />
      <div className="h-full" style={{ width: `${(scrap / tot) * 100}%`, backgroundColor: C.scrap }} />
    </div>
  );
}

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
  qs: string;
}) {
  const usable = rows.filter(
    (r) => (r.units_total ?? 0) > 0 || typeof r.quality === "number"
  );
  if (usable.length === 0) {
    return (
      <div className={`${C.cardBase} ${C.cardSkin}`}>
        <div className="text-sm text-slate-300 mb-1">Top pérdidas por línea</div>
        <div className="text-sm text-slate-400">Sin datos en el rango seleccionado.</div>
      </div>
    );
  }

  const sorted = [...usable].sort((a, b) => {
    const aScrap = a.units_total ? (a.units_scrap ?? 0) / Math.max(1, a.units_total) : (1 - clamp01(a.quality ?? 0));
    const bScrap = b.units_total ? (b.units_scrap ?? 0) / Math.max(1, b.units_total) : (1 - clamp01(b.quality ?? 0));
    return bScrap - aScrap;
  });

  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="text-sm text-slate-300 mb-3">Top pérdidas por línea</div>
      <div className="space-y-3">
        {sorted.map((r, i) => {
          const scrapPct = r.units_total
            ? (r.units_scrap ?? 0) / Math.max(1, r.units_total)
            : (1 - clamp01(r.quality ?? 0));

          const badge = r.units_scrap != null && r.units_total
            ? `Scrap ${pctTxt(scrapPct)} (${nf.format(r.units_scrap)} u)`
            : `Scrap ${pctTxt(scrapPct)}`;

          const href = `/dashboard/quality/${encodeURIComponent(r.line)}${qs}`;

          return (
            <div key={`${r.line}-${i}`} className="flex items-center gap-3">
              <div className="w-6 text-right tabular-nums text-slate-500">{i + 1}</div>
              <Link href={href} className="min-w-24 flex-1 group">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-100 group-hover:underline">
                    {r.line}
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums bg-rose-500/10 text-rose-300">
                    {badge}
                  </span>
                </div>
                <LineStackBar goodRatio={r.goodRatio} scrapRatio={r.scrapRatio} />
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
        if (org_id) u.searchParams.set("org_id", org_id);
        if (plant_id) u.searchParams.set("plant_id", plant_id);
        u.searchParams.set("step", "kpis");

        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: ApiResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");
        setRows((data.rows || []).filter(r => !!r.line_code));
      } catch (e: any) { setError(e?.message || "Error desconocido"); setRows([]); }
      finally { if (alive) setLoading(false); }
    }
    run(); return () => { alive = false; };
  }, [from, to, org_id, plant_id]);

  /* ===== Derivaciones y agregados ===== */
  const {
    qSafe, scrapPct, hasUnits, totalUnits, goodUnits, scrapUnits,
    linesForRank, analyzedLabel, summaryLine,
  } = useMemo(() => {
    const validQ = rows.filter((r) => typeof r.quality === "number" && isFinite(r.quality as number));
    const q = validQ.length ? weightedAvg(validQ, (r) => clamp01(r.quality as number)) : null;
    const qSafe = q == null ? null : clamp01(q);
    const scrapPct = qSafe == null ? null : clamp01(1 - qSafe);

    let tot = 0, good = 0, scrapU = 0;
    for (const r of rows) {
      const t = Math.max(0, Math.floor(r.units_total ?? 0));
      if (t > 0) {
        let g = Math.max(0, Math.floor(r.units_good ?? Math.round(clamp01((r.quality ?? qSafe) ?? 0) * t)));
        let s = Math.max(0, Math.floor(r.units_scrap ?? (t - g)));
        if (g + s > t) s = Math.max(0, t - g);
        tot += t; good += g; scrapU += s;
      }
    }
    const hasUnits = tot > 0;
    const analyzedLabel = fmtDuration(from, to);
    const summary = hasUnits
      ? `Se produjeron ${nf.format(tot)} u; ${nf.format(scrapU)} u (${pctTxt(scrapU / tot)}) fueron scrap. FPY ${pctTxt(good / tot)}.`
      : qSafe == null
        ? `Sin datos de calidad en el rango seleccionado.`
        : `Quality global ${pctTxt(qSafe)}; Scrap ${pctTxt(1 - qSafe)}.`;

    return {
      qSafe, scrapPct, hasUnits, totalUnits: tot, goodUnits: good, scrapUnits: scrapU,
      linesForRank: rows.map(r => ({
        line: r.line_code ?? "?",
        quality: r.quality,
        goodRatio: r.quality ?? 0,
        scrapRatio: 1 - (r.quality ?? 0),
      })),
      analyzedLabel, summaryLine: summary,
    };
  }, [rows, from, to]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="px-4 py-5 md:px-6 md:py-6 space-y-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Quality (Q)</h1>
          <p className="text-sm text-slate-300">
            Q mide la proporción de unidades buenas sobre el total durante el{" "}
            <span className="font-medium">{analyzedLabel}</span>.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <BigKpi label="Producción total" value={hasUnits ? nf.format(totalUnits) : "—"} sub={hasUnits ? "unidades en el rango" : "unidades no disponibles"} />
          <BigKpi label="Buenas" value={hasUnits ? nf.format(goodUnits) : qSafe == null ? "—" : pctTxt(qSafe)} sub={hasUnits ? `Q = ${pctTxt(goodUnits / Math.max(1, totalUnits))}` : qSafe == null ? "sin datos" : "promedio ponderado"} />
          <BigKpi label="Scrap" value={hasUnits ? nf.format(scrapUnits) : scrapPct == null ? "—" : pctTxt(scrapPct)} sub={hasUnits ? "rechazo total" : qSafe == null ? "sin datos" : "1 − Q"} chip={scrapPct != null ? <Chip text={pctTxt(hasUnits ? scrapUnits / Math.max(1, totalUnits) : scrapPct)} tone="rose" /> : undefined} />
          <BigKpi label="FPY" value={hasUnits ? pctTxt(goodUnits / Math.max(1, totalUnits)) : qSafe == null ? "—" : pctTxt(qSafe)} sub="First Pass Yield" />
        </section>

        <p className="text-sm text-slate-300 border-l-4 border-emerald-500 pl-3">
          {summaryLine}
        </p>

        <section>
          <LinesRanking rows={linesForRank} qs={qs} />
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-200">
            Error: {error}
          </div>
        )}
        {loading && <div className="text-sm text-slate-400">Cargando datos…</div>}
      </div>
    </div>
  );
}

