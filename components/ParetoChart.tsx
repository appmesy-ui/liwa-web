"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import clsx from "clsx";

type Level = "l1" | "l2" | "l3";
type ParetoMetric = "minutes" | "count";
type PlannedMode = "all" | "only" | "exclude";

type ParetoRow = {
  rank: number;
  name: string;
  minutes: number;
  count: number;
  pct: number;
  pct_acc: number;
};

type ParetoResp = {
  ok: true;
  rows: ParetoRow[];
  meta: any;
} | { ok: false; error: string };

type LineOption = { id: string; code: string | null; name: string | null; label: string; events: number };

const COLOR_BAR = "rgba(56,189,248,0.85)";   // cyan-400
const COLOR_LINE = "rgba(99,102,241,0.95)";  // indigo-500
const COLOR_GRID = "rgba(255,255,255,0.12)";
const COLOR_REF  = "rgba(250,204,21,0.9)";   // amber-400

export default function ParetoChart({
  from,
  to,
  defaultMetric = "minutes",
  defaultTop = 10,
  // valores iniciales (opcionales)
  initPlanned = "all",
  initLineField = "line_code" as "line_id" | "line_code",
  initLine = "", // code o id según initLineField
}: {
  from: string;
  to: string;
  defaultMetric?: ParetoMetric;
  defaultTop?: number;
  initPlanned?: PlannedMode;
  initLineField?: "line_id" | "line_code";
  initLine?: string;
}) {
  // Drill
  const [level, setLevel] = useState<Level>("l1");
  const [parents, setParents] = useState<{ l1: string | null; l2: string | null }>({ l1: null, l2: null });

  // Controles
  const [metric, setMetric] = useState<ParetoMetric>(defaultMetric);
  const [top, setTop] = useState<number>(defaultTop);
  const [planned, setPlanned] = useState<PlannedMode>(initPlanned);

  // Línea
  const [lineField, setLineField] = useState<"line_id" | "line_code">(initLineField);
  const [line, setLine] = useState<string>(initLine);
  const [lines, setLines] = useState<LineOption[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  // Data
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParetoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // Fetch Pareto
  async function fetchPareto(args: {
    level: Level; metric: ParetoMetric; from: string; to: string;
    planned: PlannedMode; line?: string; line_field?: "line_id" | "line_code";
    parent_l1?: string; parent_l2?: string; top?: number;
  }): Promise<ParetoResp> {
    const url = new URL("/api/pareto-stops", window.location.origin);
    url.searchParams.set("level", args.level);
    url.searchParams.set("metric", args.metric);
    url.searchParams.set("from", args.from);
    url.searchParams.set("to", args.to);
    url.searchParams.set("top", String(args.top ?? 10));
    url.searchParams.set("only_classified", "true");
    url.searchParams.set("percent_base", "total");
    url.searchParams.set("planned", args.planned);
    if (args.parent_l1) url.searchParams.set("parent_l1", args.parent_l1);
    if (args.parent_l2) url.searchParams.set("parent_l2", args.parent_l2);
    if (args.line) {
      url.searchParams.set("line", args.line);
      url.searchParams.set("line_field", args.line_field || "line_code");
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    return data;
  }

  async function loadData(next?: Partial<{ level: Level; parents: { l1: string | null; l2: string | null } }>) {
    setLoading(true); setError(null);
    const lvl = next?.level ?? level;
    const par = next?.parents ?? parents;

    const resp = await fetchPareto({
      level: lvl, metric, from, to, planned,
      line: line || undefined, line_field: lineField,
      parent_l1: par.l1 ?? undefined, parent_l2: par.l2 ?? undefined, top,
    });

    if (!("ok" in resp) || !resp.ok) {
      setError((resp as any).error || "Error"); setRows([]); setMeta(null);
    } else {
      setRows((resp as any).rows || []); setMeta((resp as any).meta || null);
    }
    setLoading(false);
  }

  // Fetch líneas con datos
  async function loadLines() {
    setLoadingLines(true);
    try {
      const qs = new URLSearchParams({
        from, to,
        only_classified: "true",
        planned,
      }).toString();
      const res = await fetch(`/api/lines?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const opts: LineOption[] = (data.rows as any[]).map((x) => ({
        id: x.id, code: x.code ?? null, name: x.name ?? null,
        label: x.label, events: x.events ?? 0,
      }));
      setLines(opts);
      // Si no hay línea seleccionada, no forzamos nada: se queda "Total planta"
    } catch (e) {
      console.error(e); setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }

  // Inicial
  useEffect(() => { loadData(); }, []);
  // Cambios de filtros → recarga
  useEffect(() => { loadData(); }, [metric, top, planned, from, to, line, lineField]);
  // Cargar líneas cuando cambie planned / rango
  useEffect(() => { loadLines(); }, [planned, from, to]);

  // Drill
  function onBarClick(entry: ParetoRow) {
    if (level === "l1") {
      const np = { l1: entry.name, l2: null as string | null };
      setParents(np); setLevel("l2"); loadData({ level: "l2", parents: np });
    } else if (level === "l2") {
      const np = { l1: parents.l1, l2: entry.name };
      setParents(np); setLevel("l3"); loadData({ level: "l3", parents: np });
    }
  }
  function goUp() {
    if (level === "l3") {
      const np = { l1: parents.l1, l2: null as string | null };
      setLevel("l2"); setParents(np); loadData({ level: "l2", parents: np });
    } else if (level === "l2") {
      const np = { l1: null as string | null, l2: null as string | null };
      setLevel("l1"); setParents(np); loadData({ level: "l1", parents: np });
    }
  }

  const title = useMemo(() => {
    if (level === "l1") return "Pareto L1 — Familias";
    if (level === "l2") return `Pareto L2 — Motivos (${parents.l1 ?? "-"})`;
    return `Pareto L3 — Causas (${parents.l1 ?? "-"} › ${parents.l2 ?? "-"})`;
  }, [level, parents]);

  const chartData = rows.map((r) => ({
    name: r.name,
    value: metric === "minutes" ? r.minutes : r.count,
    pct_acc: r.pct_acc,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Drill */}
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Drill:</span>
          <div className="flex items-center gap-1">
            <button className={clsx("px-2 py-1 rounded-md", level === "l1" ? "bg-white/10" : "bg-white/5 hover:bg-white/10")} onClick={() => { setLevel("l1"); setParents({ l1: null, l2: null }); loadData({ level: "l1", parents: { l1: null, l2: null } }); }}>L1</button>
            <span>›</span>
            <button className={clsx("px-2 py-1 rounded-md", level === "l2" ? "bg-white/10" : "bg-white/5 hover:bg-white/10")} onClick={() => parents.l1 && (setLevel("l2"), loadData({ level: "l2" }))} disabled={!parents.l1}>L2</button>
            <span>›</span>
            <span className={clsx("px-2 py-1 rounded-md", level === "l3" ? "bg-white/10" : "bg-white/5")}>L3</span>
          </div>
          {level !== "l1" && (
            <button onClick={goUp} className="ml-2 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10">Subir nivel</button>
          )}
          <div className="ml-3 text-xs opacity-80">
            {parents.l1 ? <>L1: <b>{parents.l1}</b></> : "L1: —"}
            {parents.l2 ? <> · L2: <b>{parents.l2}</b></> : null}
          </div>
        </div>

        {/* Controles mínimos: Métrica, TOP, Tipo, Línea */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
            <button className={clsx("px-3 py-1.5", metric === "minutes" ? "bg-white/10" : "bg-transparent")} onClick={() => setMetric("minutes")}>Minutos</button>
            <button className={clsx("px-3 py-1.5", metric === "count" ? "bg-white/10" : "bg-transparent")} onClick={() => setMetric("count")}>Ocurrencias</button>
          </div>

          <label className="text-xs opacity-80">TOP
            <select value={top} onChange={(e) => setTop(Number(e.target.value))} className="ml-1 rounded-md bg-transparent border border-white/10 px-2 py-1 text-xs">
              {[5, 6, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          {/* Tipo (planificados) */}
          <select value={planned} onChange={(e) => setPlanned(e.target.value as PlannedMode)} className="rounded-md bg-transparent border border-white/10 px-2 py-1 text-xs" title="Tipo">
            <option value="all">Todos</option>
            <option value="only">Solo planificados</option>
            <option value="exclude">Excluir planificados</option>
          </select>

          {/* Línea */}
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

      {/* Título */}
      <div className="text-sm opacity-80">{title}</div>

      {/* Estado */}
      {loading && <div className="text-xs opacity-60">Cargando…</div>}
      {error && <div className="text-xs text-red-300">Error: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-xs opacity-60">Sin datos para los filtros seleccionados.</div>
      )}

      {/* Gráfico */}
      {!loading && !error && rows.length > 0 && (
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
                className={level !== "l3" ? "cursor-pointer" : "cursor-default"}
                onClick={(d) => {
                  const payload = (d as any)?.payload as ParetoRow | undefined;
                  if (!payload || level === "l3") return;
                  onBarClick(payload);
                }}
              />
              <Line yAxisId="right" type="monotone" dataKey="pct_acc" name="Acumulado" dot={false} stroke={COLOR_LINE} strokeWidth={2} />
              <ReferenceLine yAxisId="right" y={80} stroke={COLOR_REF} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla */}
      {!loading && !error && rows.length > 0 && (
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
              {rows.map((r) => (
                <tr key={r.rank} className="odd:bg-white/0 even:bg-white/5">
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

      {/* Meta */}
      {meta && (
        <div className="text-[11px] opacity-70">
          Tipo: {planned === "all" ? "Todos" : planned === "only" ? "Solo planificados" : "Excluir planificados"} ·
          Ámbito: {line ? `${lineField}=${line}` : "Total planta"} ·
          Rango: {new Date(from).toISOString().slice(0,10)} → {new Date(to).toISOString().slice(0,10)}
        </div>
      )}
    </div>
  );
}
