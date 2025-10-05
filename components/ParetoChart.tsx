"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import clsx from "clsx";

type Level = "l1" | "l2";                // 2 niveles: N2 y N3
type ParetoMetric = "minutes" | "count";

type ParetoRow = {
  rank: number;
  name: string;
  minutes: number;
  count: number;
  pct: number;       // % del ítem sobre la base TOTAL
  pct_acc: number;   // % acumulado
};

type ApiResp =
  | { ok: true; rows: Array<{ rank?: number; name?: string; minutes?: number; count?: number; pct?: number; pct_acc?: number }>; meta: any }
  | { ok: true; categories: Array<{ key?: string; label?: string; minutes?: number; count?: number; pct?: number; cumPct?: number }>; meta: any }
  | { ok: false; error: string };

type LineOption = { id: string; code: string | null; name: string | null; label: string; events: number };

const COLOR_BAR = "rgba(56,189,248,0.85)";
const COLOR_LINE = "rgba(99,102,241,0.95)";
const COLOR_GRID = "rgba(255,255,255,0.12)";
const COLOR_REF  = "rgba(250,204,21,0.9)";

export default function ParetoChart({
  from,
  to,
  defaultMetric = "minutes",
  initLineField = "line_code",
  initLine = "",
}: {
  from: string;
  to: string;
  defaultMetric?: ParetoMetric;
  initLineField?: "line_id" | "line_code";
  initLine?: string;   // si viene, el scope será "line"
}) {
  const [level, setLevel] = useState<Level>("l1");
  const [parents, setParents] = useState<{ l1: string | null }>({ l1: null });

  const [metric, setMetric] = useState<ParetoMetric>(defaultMetric);

  const [lineField, setLineField] = useState<"line_id" | "line_code">(initLineField);
  const [line, setLine] = useState<string>(initLine);
  const [lines, setLines] = useState<LineOption[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rowsAll, setRowsAll] = useState<ParetoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // === API CALL ===
  async function fetchPareto(args: {
    level: Level; metric: ParetoMetric; from: string; to: string;
    parent_l1?: string;
    scope: "total" | "line";
    line?: string; line_field?: "line_id" | "line_code";
  }): Promise<ApiResp> {
    const url = new URL("/api/pareto-stops", window.location.origin);
    url.searchParams.set("level", args.level);
    url.searchParams.set("metric", args.metric);
    url.searchParams.set("from", args.from);
    url.searchParams.set("to", args.to);

    // 🔒 reglas del negocio: SOLO no planificados, SOLO clasificados
    url.searchParams.set("planned", "exclude");
    url.searchParams.set("only_classified", "true");

    // base de % sobre TOTAL del rango (no sobre top)
    url.searchParams.set("percent_base", "total");

    // ámbito
    url.searchParams.set("scope", args.scope);
    if (args.scope === "line" && args.line) {
      url.searchParams.set("line", args.line);
      url.searchParams.set("line_field", args.line_field || "line_code");
    }

    if (args.parent_l1) url.searchParams.set("parent_l1", args.parent_l1);

    const res = await fetch(url.toString(), { cache: "no-store" });
    return res.json();
  }

  async function loadData(next?: Partial<{ level: Level; parents: { l1: string | null } }>) {
    setLoading(true); setError(null);
    const lvl = next?.level ?? level;
    const par = next?.parents ?? parents;

    const scope: "total" | "line" = line ? "line" : "total";

    const resp = await fetchPareto({
      level: lvl,
      metric,
      from,
      to,
      parent_l1: par.l1 ?? undefined,
      scope,
      line: scope === "line" ? line : undefined,
      line_field: lineField,
    });

    if (!("ok" in resp) || !resp.ok) {
      setError((resp as any).error || "Error");
      setRowsAll([]);
      setMeta(null);
    } else {
      // normalizar: puede venir "rows" (viejo) o "categories" (nuevo)
      let arr: ParetoRow[] = [];
      if ("rows" in resp && Array.isArray(resp.rows)) {
        arr = resp.rows.map((r, i) => ({
          rank: r.rank ?? i + 1,
          name: r.name ?? "—",
          minutes: Math.round(Number(r.minutes ?? 0)),
          count: Number(r.count ?? 0),
          pct: Number(r.pct ?? 0),
          pct_acc: Number(r.pct_acc ?? 0),
        }));
      } else if ("categories" in resp && Array.isArray(resp.categories)) {
        arr = resp.categories.map((c: any, i: number) => ({
          rank: i + 1,
          name: c.label ?? "—",
          minutes: Math.round(Number(c.minutes ?? 0)),
          count: Number(c.count ?? 0),
          pct: Number(c.pct ?? 0),
          pct_acc: Number(c.cumPct ?? 0),
        }));
      }
      setRowsAll(arr);
      setMeta((resp as any).meta || null);
    }
    setLoading(false);
  }

  async function loadLines() {
    if (!line) return; // solo si estamos en modo línea y el select podría cambiar
    setLoadingLines(true);
    try {
      const qs = new URLSearchParams({
        from, to,
        only_classified: "true",
        planned: "exclude",
      }).toString();
      const res = await fetch(`/api/lines?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const opts: LineOption[] = (data.rows as any[]).map((x) => ({
        id: x.id, code: x.code ?? null, name: x.name ?? null,
        label: x.label, events: x.events ?? 0,
      }));
      setLines(opts);
    } catch {
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadData(); }, [metric, from, to, line, lineField, level, parents.l1]);
  useEffect(() => { loadLines(); }, [from, to]);

  // Drill: click en barra de N2 para ir a N3 (L2)
  function onBarClick(entry: ParetoRow) {
    if (level === "l1") {
      const np = { l1: entry.name };
      setParents(np);
      setLevel("l2");
      // loadData se dispara por el efecto al cambiar level/parents
    }
  }
  function goUp() {
    if (level === "l2") {
      setParents({ l1: null });
      setLevel("l1");
    }
  }

  // Mostrar SOLO hasta cubrir 80% (si nadie llega, mostramos todos)
  const rows80 = useMemo(() => {
    if (!rowsAll.length) return [];
    const sliced = rowsAll.filter((r) => r.pct_acc <= 80 + 1e-6);
    return sliced.length ? sliced : rowsAll;
  }, [rowsAll]);

  const title = useMemo(() => {
    if (level === "l1") return "Pareto L1 — Motivos (N2)";
    return `Pareto L2 — Causas (N3) · ${parents.l1 ?? "-"}`;
  }, [level, parents]);

  const chartData = rows80.map((r) => ({
    name: r.name,
    value: metric === "minutes" ? r.minutes : r.count,
    pct_acc: r.pct_acc,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Drill:</span>
          <div className="flex items-center gap-1">
            <button
              className={clsx("px-2 py-1 rounded-md", level === "l1" ? "bg-white/10" : "bg-white/5 hover:bg-white/10")}
              onClick={() => { setLevel("l1"); setParents({ l1: null }); }}
            >
              L1
            </button>
            <span>›</span>
            <button
              className={clsx("px-2 py-1 rounded-md", level === "l2" ? "bg-white/10" : "bg-white/5 hover:bg-white/10")}
              onClick={() => parents.l1 && setLevel("l2")}
              disabled={!parents.l1}
              title={parents.l1 ? "Ver N3" : "Selecciona N2"}
            >
              L2
            </button>
          </div>
          {level !== "l1" && (
            <button onClick={goUp} className="ml-2 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10">
              Subir nivel
            </button>
          )}
          <div className="ml-3 text-xs opacity-80">
            {parents.l1 ? <>N2: <b>{parents.l1}</b></> : "N2: —"}
          </div>
        </div>

        {/* Controles mínimos */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
            <button className={clsx("px-3 py-1.5", metric === "minutes" ? "bg-white/10" : "bg-transparent")} onClick={() => setMetric("minutes")}>Minutos</button>
            <button className={clsx("px-3 py-1.5", metric === "count" ? "bg-white/10" : "bg-transparent")} onClick={() => setMetric("count")}>Ocurrencias</button>
          </div>

          {/* Selector de línea opcional (si el launcher lo abre por línea ya viene seteado) */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={lineField}
              onChange={(e) => setLineField(e.target.value as any)}
              className="rounded-md bg-transparent border border-white/10 px-2 py-1"
              title="Campo línea"
            >
              <option value="line_code">line_code</option>
              <option value="line_id">line_id</option>
            </select>

            <select
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="rounded-md bg-transparent border border-white/10 px-2 py-1"
              title="Línea"
            >
              <option value="">Total planta</option>
              {lines.map((ln) => (
                <option
                  key={lineField === "line_code" ? (ln.code ?? ln.id) : ln.id}
                  value={lineField === "line_code" ? (ln.code ?? "") : ln.id}
                >
                  {ln.label} ({ln.events})
                </option>
              ))}
            </select>

            {loadingLines && <span className="opacity-60">cargando…</span>}
          </div>
        </div>
      </div>

      <div className="text-sm opacity-80">{title}</div>

      {loading && <div className="text-xs opacity-60">Cargando…</div>}
      {error && <div className="text-xs text-red-300">Error: {error}</div>}
      {!loading && !error && rows80.length === 0 && (
        <div className="text-xs opacity-60">Sin datos para los filtros seleccionados.</div>
      )}

      {!loading && !error && rows80.length > 0 && (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 24, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} />
              <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} height={50} />
              <YAxis yAxisId="left" tickFormatter={(v) => `${v}`} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                formatter={(value: any, name: any) => {
                  if (name === "Acumulado") return [`${(value as number).toFixed?.(1) ?? value}%`, "Acumulado"];
                  return [metric === "minutes" ? `${value} min` : `${value} evts`, metric === "minutes" ? "Minutos" : "Ocurrencias"];
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="value"
                name={metric === "minutes" ? "Minutos" : "Ocurrencias"}
                fill={COLOR_BAR}
                className={level !== "l2" ? "cursor-pointer" : "cursor-default"}
                onClick={(d) => {
                  const payload = (d as any)?.payload as any;
                  if (!payload || level === "l2") return;
                  // buscar el row real para tomar el nombre exacto
                  const found = rows80.find(r => r.name === payload.name);
                  if (found) onBarClick(found);
                }}
              />
              <Line yAxisId="right" type="monotone" dataKey="pct_acc" name="Acumulado" dot={false} stroke={COLOR_LINE} strokeWidth={2} />
              <ReferenceLine yAxisId="right" y={80} stroke={COLOR_REF} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla (solo lo que se muestra: 80%) */}
      {!loading && !error && rows80.length > 0 && (
        <div className="mt-2 overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-right">{metric === "minutes" ? "Min (base total)" : "Ocurrencias (base total)"}</th>
                <th className="px-3 py-2 text-right">% Item</th>
                <th className="px-3 py-2 text-right">% Acum.</th>
              </tr>
            </thead>
            <tbody>
              {rows80.map((r, idx) => (
                <tr key={`${r.name}-${idx}`} className="odd:bg-white/0 even:bg-white/5">
                  <td className="px-3 py-2">{r.rank}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{metric === "minutes" ? r.minutes : r.count}</td>
                  <td className="px-3 py-2 text-right">{r.pct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{r.pct_acc.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <div className="text-[11px] opacity-70">
          Tipo: <b>No planificados (clasificados)</b> ·
          Ámbito: {line ? `${lineField}=${line}` : "Total planta"} ·
          Rango: {new Date(from).toISOString().slice(0,10)} → {new Date(to).toISOString().slice(0,10)} ·
          Corta en 80% acumulado
        </div>
      )}
    </div>
  );
}
