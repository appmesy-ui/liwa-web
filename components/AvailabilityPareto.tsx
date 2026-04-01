"use client";

import { useEffect, useMemo, useState } from "react";

type Level = "l1" | "l2" | "l3";
type Metric = "minutes" | "count";

type ParetoItem = {
  key: string;
  label: string;
  minutes: number;
  count: number;
  pct: number;
  cumPct: number;
};

type ApiOkNew = {
  ok: true;
  meta: any;
  categories: Array<{
    key?: string;
    label?: string;
    minutes?: number;
    count?: number;
    pct?: number;
    cumPct?: number;
  }>;
};
type ApiOkOld = {
  ok: true;
  meta: any;
  rows: Array<{
    rank?: number;
    name?: string;
    minutes?: number;
    count?: number;
    pct?: number;
    pct_acc?: number;
  }>;
};
type ApiErr = { ok: false; error: string };

export default function AvailabilityPareto({
  from,
  to,
  line,
  topN = 10,
}: {
  from?: string;
  to?: string;
  line?: string;
  topN?: number;
}) {
  const [level, setLevel] = useState<Level>("l1");
  const [metric, setMetric] = useState<Metric>("minutes");
  const [parentL1, setParentL1] = useState<string | null>(null);
  const [parentL2, setParentL2] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ParetoItem[]>([]);
  const [meta, setMeta] = useState<any | null>(null);

  // fetch
  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/pareto-stops", window.location.origin);
        url.searchParams.set("level", level);
        url.searchParams.set("metric", metric);
        url.searchParams.set("top", String(topN));
        url.searchParams.set("only_classified", "true");
        // ↑ si querés ver TODOS (pend + clasif), ponelo en "false"
        // Para cuadrar con "Paro (no planificado)" podés excluir planificados:
        // url.searchParams.set("planned", "exclude");

        if (line) {
          url.searchParams.set("scope", "line");
          url.searchParams.set("line", line);
          url.searchParams.set("line_field", "line_code"); // o line_id según pases
        } else {
          url.searchParams.set("scope", "total");
        }
        if (parentL1) url.searchParams.set("parent_l1", parentL1);
        if (from) url.searchParams.set("from", from);
        if (to) url.searchParams.set("to", to);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const data: ApiOkNew | ApiOkOld | ApiErr = await res.json();
        if (!alive) return;
        if (!("ok" in data) || data.ok !== true) throw new Error((data as ApiErr).error || "Error");

        // Soportar AMBOS formatos: categories (nuevo) o rows (viejo)
        const rawCats: any[] =
          (data as ApiOkNew).categories ??
          (data as ApiOkOld).rows ??
          [];

        // Normalizar campos -> ParetoItem
        const mapped: ParetoItem[] = rawCats.map((r: any, i: number) => {
          const label = r.label ?? r.name ?? "—";
          const minutes = Number(r.minutes ?? 0);
          const count = Number(r.count ?? 0);
          const pct = Number(r.pct ?? 0);
          const cumPct = Number(r.cumPct ?? r.cum_pct ?? r.pct_acc ?? 0);
          const key = r.key ?? `${i + 1}|${label}`;
          return { key, label, minutes, count, pct, cumPct };
        });

        setItems(mapped);
        setMeta((data as any).meta || null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Error");
        setItems([]);
        setMeta(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [level, metric, parentL1, parentL2, from, to, line, topN]);

  // breadcrumb
  const crumb = useMemo(() => {
    const parts: string[] = [];
    if (level === "l1") {
      parts.push("Nivel 1");
    } else if (level === "l2") {
      parts.push(`Nivel 1 → ${parentL1 ?? "—"}`, "· Nivel 2");
    } else {
      parts.push(`Nivel 1 → ${parentL1 ?? "—"}`, `· Nivel 2 → ${parentL2 ?? "—"}`, "· Nivel 3");
    }
    parts.push("·", metric === "minutes" ? "Minutos" : "Ocurrencias");
    parts.push("·", line ? `Línea ${line}` : "Total planta");
    return parts.join(" ");
  }, [level, parentL1, parentL2, metric, line]);

  function onClickBar(item: ParetoItem) {
    if (level === "l1") {
      setParentL1(item.label);
      setLevel("l2");
      return;
    }
    if (level === "l2") {
      setParentL2(item.label);
      setLevel("l3");
    }
  }

  function goBack() {
    if (level === "l3") {
      setLevel("l2");
      setParentL2(null);
    } else if (level === "l2") {
      setLevel("l1");
      setParentL1(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            disabled={level === "l1"}
            className={[
              "h-8 rounded-lg border px-2.5 text-sm",
              level === "l1"
                ? "cursor-not-allowed border-white/10 text-slate-500"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
            ].join(" ")}
            title="Volver"
          >
            ← Volver
          </button>
          <div className="text-slate-300 text-sm">{crumb}</div>
        </div>

        <Segmented
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          options={[
            { label: "Minutos", value: "minutes" },
            { label: "Ocurrencias", value: "count" },
          ]}
        />
      </div>

      {/* Estado */}
      {error && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-rose-200 text-sm">
          {error}
        </div>
      )}
      {loading && <div className="text-slate-400 text-sm">Cargando…</div>}

      {/* Barras */}
      {!loading && items.length > 0 && (
        <Bars items={items} metric={metric} onClick={onClickBar} isLeaf={level === "l3"} />
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-300 text-sm">
          No hay datos para los filtros seleccionados.
        </div>
      )}

      {/* Rango */}
      {meta?.from && meta?.to && (
        <div className="text-right text-xs text-slate-400">
          Rango: {new Date(meta.from).toLocaleDateString()} →{" "}
          {new Date(meta.to).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function Segmented(props: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  const { value, onChange, options } = props;
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              "h-8 rounded-md px-2.5 text-sm",
              active
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Bars({
  items,
  metric,
  onClick,
  isLeaf,
}: {
  items: ParetoItem[];
  metric: Metric;
  onClick: (item: ParetoItem) => void;
  isLeaf: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.pct));
  let idx80 = items.findIndex((i) => i.cumPct >= 80);
  if (idx80 === -1) idx80 = items.length - 1;

  return (
    <div className="space-y-3 relative">
      <div className="absolute left-[80%] top-0 bottom-0 border-l border-dashed border-cyan-400/50 pointer-events-none" />
      {items.map((it, i) => {
        const content = (
          <>
            <div className="flex items-center justify-between text-sm">
              <div className="text-slate-200 font-medium truncate">{it.label}</div>
              <div className="text-slate-300 tabular-nums">
                {metric === "minutes"
                  ? `${it.minutes.toFixed(0)} min · ${it.pct.toFixed(1)}% · ${it.cumPct.toFixed(1)}% ac.`
                  : `${it.count} ev · ${it.pct.toFixed(1)}% · ${it.cumPct.toFixed(1)}% ac.`}
              </div>
            </div>
            <div className="mt-2 h-3 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={[
                  "h-full transition-[width]",
                  i <= idx80 ? "bg-cyan-400/80" : "bg-cyan-400/40",
                ].join(" ")}
                style={{ width: `${(it.pct / max) * 100}%` }}
              />
            </div>
          </>
        );

        return isLeaf ? (
          <div key={it.key} className="w-full">{content}</div>
        ) : (
          <button key={it.key} onClick={() => onClick(it)} className="group w-full text-left" title="Ver detalle">
            {content}
          </button>
        );
      })}
    </div>
  );
}
