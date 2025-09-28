// app/dashboard/quality/[line]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

/* =============== Tipos =============== */
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

type KpisResp =
  | { ok: true; rows: RowUI[]; meta?: any }
  | { ok: false; error: string }
  | any;

type DefectRow = {
  defect_code: string;
  defect_name: string;
  category?: string | null;
  units_defective?: number | null; // total piezas con ese defecto (scrap+rework)
  units_scrap?: number | null;
  units_rework?: number | null;
  station?: string | null;
  shift?: string | null;
  last_seen_at?: string | null;
};

type DefectsResp =
  | { ok: true; rows: DefectRow[]; meta?: { units_total?: number } }
  | { ok: false; error: string }
  | any;

/* =============== Utils =============== */
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

/* =============== Estilos =============== */
const C = {
  good: "#10B981",    // emerald-500
  scrap: "#F43F5E",   // rose-500
  rework: "#F59E0B",  // amber-500
  goal: "#22C55E",    // emerald-400
  cardBase: "rounded-2xl border p-4 shadow-sm",
  cardSkin: "bg-white/95 border-slate-200 dark:bg-slate-900 dark:border-slate-700",
};

/* =============== Primitives =============== */
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

function BigKpi({ label, value, sub, chip }:{
  label: string; value: string; sub?: string; chip?: React.ReactNode;
}) {
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

function BulletChart({ pct, goalPct = 0.01, tooltip }:{ pct: number; goalPct?: number; tooltip?: string }) {
  const v = Math.max(0, Math.min(1, pct));
  const g = Math.max(0, Math.min(1, goalPct));
  return (
    <div className={`${C.cardBase} ${C.cardSkin}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600 dark:text-slate-300">Progreso hacia objetivo</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Objetivo ≤ {pctTxt(g)}</div>
      </div>
      <div className="relative h-5 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden" title={tooltip}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${v * 100}%`, backgroundColor: C.scrap }} />
        <div className="absolute inset-y-0" style={{ left: `calc(${g * 100}% - 1px)` }}>
          <div className="h-full w-0.5" style={{ backgroundColor: C.goal }} />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>0%</span><span>100%</span>
      </div>
    </div>
  );
}

/* =============== Página =============== */
export default function QualityByLinePage({ params }: { params: { line: string } }) {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const tab = (sp.get("tab") || "resumen").toLowerCase(); // "resumen" | "defectos"

  const qsCommon = (() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  })();

  const lineParam = decodeURIComponent(params.line || "").toUpperCase();

  /* ---- Estado: KPIs línea ---- */
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<RowUI | null>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true); setErr(null);
      try {
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: KpisResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos");
        const r = (data.rows as RowUI[]).find(
          (x) => (x.line_code || "").toUpperCase() === lineParam
        ) || null;
        setRow(r);
      } catch (e: any) { setErr(e?.message || "Error desconocido"); setRow(null); }
      finally { if (alive) setLoading(false); }
    }
    run(); return () => { alive = false; };
  }, [lineParam, from, to]);

  /* ---- Derivaciones KPIs ---- */
  const {
    hasUnits, unitsTotal, unitsGood, unitsScrap, unitsRework,
    qSafe, scrapPct, analyzedLabel, summary,
  } = useMemo(() => {
    const analyzedLabel = fmtDuration(from, to);

    if (!row) {
      return {
        hasUnits: false, unitsTotal: 0, unitsGood: 0, unitsScrap: 0, unitsRework: 0,
        qSafe: null as number | null, scrapPct: null as number | null, analyzedLabel,
        summary: "Sin datos de calidad en el rango seleccionado.",
      };
    }

    // quality válido
    const qValid = typeof row.quality === "number" && isFinite(row.quality as number);
    const qSafe = qValid ? clamp01(row.quality as number) : null;
    const scrapPct = qSafe == null ? null : clamp01(1 - qSafe);

    // unidades
    const t = Math.max(0, Math.floor(row.units_total ?? 0));
    let g = Math.max(0, Math.floor(row.units_good ?? 0));
    let s = Math.max(0, Math.floor(row.units_scrap ?? 0));
    const rw = Math.max(0, Math.floor(row.units_rework ?? 0));
    if (t > 0 && (g + s + rw) > t) s = Math.max(0, t - g - rw);
    const hasUnits = t > 0;

    const summary = hasUnits
      ? `Se produjeron ${nf.format(t)} u; ${nf.format(s)} u (${pctTxt(s / t)}) fueron scrap${rw > 0 ? ` y ${nf.format(rw)} u (${pctTxt(rw / t)}) retrabajadas` : ""}. FPY ${pctTxt(g / t)}.`
      : qSafe == null
        ? "Sin datos de calidad en el rango seleccionado."
        : `Quality ${pctTxt(qSafe)} · Scrap ${pctTxt(1 - qSafe)}.`;

    return {
      hasUnits, unitsTotal: t, unitsGood: g, unitsScrap: s, unitsRework: rw,
      qSafe, scrapPct, analyzedLabel, summary,
    };
  }, [row, from, to]);

  /* ---- Estado: Defectos ---- */
  const [loadingDef, setLoadingDef] = useState(false);
  const [errDef, setErrDef] = useState<string | null>(null);
  const [defRows, setDefRows] = useState<DefectRow[]>([]);
  const [defUnitsTotal, setDefUnitsTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    if (tab !== "defectos") return; // carga bajo demanda
    async function run() {
      setLoadingDef(true); setErrDef(null);
      try {
        const u = new URL("/api/quality/defects", window.location.origin);
        u.searchParams.set("line", lineParam);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data: DefectsResp = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data as any)?.error || "Error de datos de defectos");
        setDefRows(data.rows || []);
        setDefUnitsTotal((data.meta?.units_total ?? null) as number | null);
      } catch (e: any) { setErrDef(e?.message || "Error desconocido"); setDefRows([]); setDefUnitsTotal(null); }
      finally { if (alive) setLoadingDef(false); }
    }
    run(); return () => { alive = false; };
  }, [tab, lineParam, from, to]);

  /* ---- Derivaciones Defectos ---- */
  const defectsModel = useMemo(() => {
    if (!defRows || defRows.length === 0) {
      return {
        totalDef: 0, totalScrap: 0, totalRework: 0, totUnits: defUnitsTotal ?? unitsTotal ?? 0,
        top: [] as Array<{
          name: string; code: string; total: number; pct: number; cumPct: number; scrap?: number; rework?: number;
        }>,
      };
    }
    const totUnits = (defUnitsTotal ?? unitsTotal ?? 0) || 0;
    let totalDef = 0, totalScrap = 0, totalRework = 0;

    const items = defRows.map((d) => {
      const def = Math.max(0, Math.floor(d.units_defective ?? ((d.units_scrap ?? 0) + (d.units_rework ?? 0))));
      const sc = Math.max(0, Math.floor(d.units_scrap ?? 0));
      const rw = Math.max(0, Math.floor(d.units_rework ?? 0));
      totalDef += def; totalScrap += sc; totalRework += rw;
      return {
        code: d.defect_code,
        name: d.defect_name || d.defect_code,
        total: def,
        scrap: sc,
        rework: rw,
      };
    }).filter(x => x.total > 0);

    items.sort((a, b) => b.total - a.total);
    let acc = 0;
    const top = items.slice(0, 10).map((x) => {
      acc += x.total;
      const pct = (totUnits > 0) ? (x.total / totUnits) : 0;
      const cumPct = (totUnits > 0) ? (acc / totUnits) : 0;
      return { ...x, pct, cumPct };
    });

    return { totalDef, totalScrap, totalRework, totUnits, top };
  }, [defRows, defUnitsTotal, unitsTotal]);

  /* ---- Componentes auxiliares ---- */
  function Tabs() {
    const base = `/dashboard/quality/${encodeURIComponent(lineParam)}`;
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);

    const hrefResumen = `${base}?${q.toString()}`;
    q.set("tab", "defectos");
    const hrefDef = `${base}?${q.toString()}`;

    const cls = "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm";
    const active = "bg-white/10 border border-white/10 text-slate-100";
    const idle = "text-slate-300 hover:bg-white/5 border border-transparent";

    return (
      <div className="flex gap-2">
        <Link href={hrefResumen} className={`${cls} ${tab === "resumen" ? active : idle}`}>Resumen</Link>
        <Link href={hrefDef} className={`${cls} ${tab === "defectos" ? active : idle}`}>Defectos</Link>
      </div>
    );
  }

  function Pareto() {
    const top = defectsModel.top;
    if (!top.length) {
      return (
        <div className={`${C.cardBase} ${C.cardSkin} text-sm text-slate-500 dark:text-slate-400`}>
          Sin registros de defectos en el rango seleccionado.
        </div>
      );
    }

    const max = Math.max(...top.map(d => d.total));
    return (
      <div className={`${C.cardBase} ${C.cardSkin}`}>
        <div className="mb-2 text-sm text-slate-600 dark:text-slate-300">Pareto de defectos (Top {top.length})</div>
        <div className="space-y-3">
          {top.map((d, i) => (
            <div key={d.code} className="grid grid-cols-12 items-center gap-3">
              <div className="col-span-5 md:col-span-4">
                <div className="font-medium text-slate-200">{d.name}</div>
                <div className="text-xs text-slate-400">{d.code}</div>
              </div>
              <div className="col-span-7 md:col-span-8">
                <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full" style={{ width: `${(d.total / Math.max(1, max)) * 100}%`, backgroundColor: C.scrap }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span className="tabular-nums">
                    {nf.format(d.total)} u · {pctTxt(d.pct)}
                    {typeof d.scrap === "number" || typeof d.rework === "number"
                      ? ` · S ${nf.format(d.scrap ?? 0)} / R ${nf.format(d.rework ?? 0)}`
                      : ""}
                  </span>
                  <span className="tabular-nums">Acum. {pctTxt(d.cumPct)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Total defectos: <span className="tabular-nums font-medium">{nf.format(defectsModel.totalDef)} u</span>
          {defectsModel.totUnits > 0 ? (
            <> · Impacto: <span className="tabular-nums">{pctTxt(defectsModel.totalDef / defectsModel.totUnits)}</span></>
          ) : null}
        </div>
      </div>
    );
  }

  function DefectsTable() {
    if (!defRows || defRows.length === 0) {
      return null;
    }
    return (
      <div className={`${C.cardBase} ${C.cardSkin}`}>
        <div className="mb-2 text-sm text-slate-600 dark:text-slate-300">Detalle de defectos</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 pr-4">Defecto</th>
                <th className="py-2 px-4">Categoría</th>
                <th className="py-2 px-4 text-right">Total</th>
                <th className="py-2 px-4 text-right">Scrap</th>
                <th className="py-2 px-4 text-right">Retrabajo</th>
                <th className="py-2 px-4">Estación</th>
                <th className="py-2 px-4">Turno</th>
                <th className="py-2 px-4">Última</th>
              </tr>
            </thead>
            <tbody>
              {defRows.map((d) => {
                const total = Math.max(0, Math.floor(d.units_defective ?? ((d.units_scrap ?? 0) + (d.units_rework ?? 0))));
                const scrap = Math.max(0, Math.floor(d.units_scrap ?? 0));
                const rework = Math.max(0, Math.floor(d.units_rework ?? 0));
                return (
                  <tr key={d.defect_code} className="border-t border-white/10">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-200">{d.defect_name || d.defect_code}</div>
                      <div className="text-xs text-slate-400">{d.defect_code}</div>
                    </td>
                    <td className="py-2 px-4">{d.category || "—"}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{nf.format(total)}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{nf.format(scrap)}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{nf.format(rework)}</td>
                    <td className="py-2 px-4">{d.station || "—"}</td>
                    <td className="py-2 px-4">{d.shift || "—"}</td>
                    <td className="py-2 px-4">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-5 py-8 text-slate-100">
      {/* Breadcrumb + Tabs */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">
            <Link href={`/dashboard${qsCommon}`} className="hover:underline">Dashboard</Link>
            <span className="mx-2">/</span>
            <Link href={`/dashboard/quality${qsCommon}`} className="hover:underline">Quality</Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-emerald-300">{lineParam}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">Quality · {lineParam}</h1>
        </div>
        <Tabs />
      </div>

      {/* === TAB RESUMEN === */}
      {tab === "resumen" && (
        <>
          {/* Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <BigKpi
              label="Producción total"
              value={hasUnits ? nf.format(unitsTotal) : "—"}
              sub={hasUnits ? "unidades en el rango" : "unidades no disponibles"}
            />
            <BigKpi
              label="Buenas"
              value={hasUnits ? nf.format(unitsGood) : (qSafe == null ? "—" : pctTxt(qSafe))}
              sub={hasUnits ? `Q = ${pctTxt(unitsGood / Math.max(1, unitsTotal))}` : (qSafe == null ? "sin datos en el rango" : "promedio ponderado")}
            />
            <BigKpi
              label="Scrap"
              value={hasUnits ? nf.format(unitsScrap) : (scrapPct == null ? "—" : pctTxt(scrapPct))}
              sub={hasUnits ? "rechazo total" : (qSafe == null ? "sin datos en el rango" : "1 − Q")}
              chip={scrapPct != null ? <Chip text={hasUnits ? pctTxt(unitsScrap / Math.max(1, unitsTotal)) : pctTxt(scrapPct)} tone="rose" /> : undefined}
            />
            <BigKpi
              label="Retrabajo"
              value={hasUnits ? nf.format(unitsRework) : "—"}
              sub={hasUnits ? `(${pctTxt(unitsRework / Math.max(1, unitsTotal))})` : "no disponible"}
              chip={hasUnits && unitsRework > 0 ? <Chip text={pctTxt(unitsRework / Math.max(1, unitsTotal))} tone="amber" /> : undefined}
            />
            <BigKpi
              label="FPY"
              value={hasUnits ? pctTxt(unitsGood / Math.max(1, unitsTotal)) : (qSafe == null ? "—" : pctTxt(qSafe))}
              sub="First Pass Yield"
            />
          </section>

          {/* Resumen ejecutivo */}
          <p className="text-sm text-slate-300 border-l-4 border-emerald-500 pl-3 mb-4">
            {summary} <span className="text-slate-400">({analyzedLabel})</span>
          </p>

          {/* Panel Scrap + objetivo */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <div className={`${C.cardBase} ${C.cardSkin}`}>
              <div className="flex items-start justify-between">
                <div className="text-sm text-slate-700 dark:text-slate-300">Scrap (línea)</div>
                {scrapPct != null && <Chip text={hasUnits ? pctTxt(unitsScrap / Math.max(1, unitsTotal)) : pctTxt(scrapPct)} tone="rose" />}
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                {scrapPct == null ? "—" : (hasUnits ? pctTxt(unitsScrap / Math.max(1, unitsTotal)) : pctTxt(scrapPct))}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {hasUnits ? `(${nf.format(unitsScrap)} u)` : (scrapPct == null ? "sin datos" : "sin unidades")}
              </div>
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                Objetivo ≤ <span className="font-medium text-emerald-400">1,00%</span>
              </div>
            </div>

            <div className="lg:col-span-2">
              {scrapPct == null ? (
                <div className={`${C.cardBase} ${C.cardSkin} text-sm text-slate-600 dark:text-slate-400`}>
                  Sin datos de calidad en el rango seleccionado.
                </div>
              ) : (
                <BulletChart
                  pct={hasUnits ? (unitsScrap / Math.max(1, unitsTotal)) : scrapPct}
                  goalPct={0.01}
                  tooltip={
                    hasUnits
                      ? `Scrap ${pctTxt(unitsScrap / Math.max(1, unitsTotal))} · ${nf.format(unitsScrap)} u`
                      : `Scrap ${pctTxt(scrapPct)}`
                  }
                />
              )}
            </div>
          </section>

          {err && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              Error: {err}
            </div>
          )}
          {loading && <div className="text-sm text-slate-400">Cargando datos…</div>}
        </>
      )}

      {/* === TAB DEFECTOS === */}
      {tab === "defectos" && (
        <>
          {/* Cards defectos */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <BigKpi
              label="Defectos (total)"
              value={nf.format(defectsModel.totalDef)}
              sub={defectsModel.totUnits > 0 ? `Impacto ${pctTxt(defectsModel.totalDef / defectsModel.totUnits)}` : "sin unidades"}
              chip={<Chip text={defectsModel.totUnits > 0 ? pctTxt(defectsModel.totalDef / defectsModel.totUnits) : "—"} tone="rose" />}
            />
            <BigKpi
              label="Scrap por defectos"
              value={nf.format(defectsModel.totalScrap)}
              sub={defectsModel.totUnits > 0 ? pctTxt(defectsModel.totalScrap / defectsModel.totUnits) : "sin unidades"}
            />
            <BigKpi
              label="Retrabajo"
              value={nf.format(defectsModel.totalRework)}
              sub={defectsModel.totUnits > 0 ? pctTxt(defectsModel.totalRework / defectsModel.totUnits) : "sin unidades"}
              chip={defectsModel.totalRework > 0 ? <Chip text={pctTxt(defectsModel.totalRework / Math.max(1, defectsModel.totUnits))} tone="amber" /> : undefined}
            />
            <BigKpi
              label="Top defecto"
              value={defectsModel.top[0]?.name ?? "—"}
              sub={defectsModel.top[0] ? `${nf.format(defectsModel.top[0].total)} u · ${pctTxt(defectsModel.top[0].pct)}` : "sin datos"}
            />
          </section>

          {/* Pareto + Tabla */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Pareto />
            <DefectsTable />
          </section>

          {errDef && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              Error: {errDef}
            </div>
          )}
          {loadingDef && <div className="text-sm text-slate-400 mt-2">Cargando defectos…</div>}
        </>
      )}
    </main>
  );
}
