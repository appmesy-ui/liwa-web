// lib/pareto.ts
export type ParetoLevel = "l1" | "l2" | "l3";
export type ParetoMetric = "minutes" | "count";
export type ParetoPercentBase = "total" | "top";

export type ParetoRow = {
  rank: number;
  name: string;
  minutes: number;
  count: number;
  pct: number;     // 0–100, 1 dec
  pct_acc: number; // 0–100, 1 dec
};

export type ParetoMeta = {
  level: ParetoLevel;
  metric: ParetoMetric;
  scope: "total" | "line";
  from: string;
  to: string;
  only_classified: boolean;
  include_planned: boolean;
  top: number;
  percent_base: ParetoPercentBase;
  total_minutes: number; // total real pre-topK
  total_count: number;   // total real pre-topK
  parents: { l1: string | null; l2: string | null };
  line_id: string | null;
};

export type ParetoResp =
  | { ok: true; rows: ParetoRow[]; meta: ParetoMeta }
  | { ok: false; error: string };

export type ParetoParams = {
  level?: ParetoLevel;
  metric?: ParetoMetric;
  days?: number;
  from?: string;
  to?: string;
  to_yesterday?: boolean;
  only_classified?: boolean;
  include_planned?: boolean;
  top?: number;
  scope?: "total" | "line";
  line?: string; // id o code (según line_field)
  line_field?: "line_id" | "line_code";
  parent_l1?: string;
  parent_l2?: string;
  percent_base?: ParetoPercentBase;
};

function toQuery(params: ParetoParams) {
  const p = new URLSearchParams();
  // valores por defecto
  if (params.level) p.set("level", params.level);
  if (params.metric) p.set("metric", params.metric);
  if (params.days != null) p.set("days", String(params.days));
  if (params.from) p.set("from", params.from);
  if (params.to) p.set("to", params.to);
  if (params.to_yesterday) p.set("to_yesterday", "true");
  if (params.only_classified !== undefined)
    p.set("only_classified", String(params.only_classified));
  if (params.include_planned !== undefined)
    p.set("include_planned", String(params.include_planned));
  if (params.top != null) p.set("top", String(params.top));
  if (params.scope) p.set("scope", params.scope);
  if (params.line) p.set("line", params.line);
  if (params.line_field) p.set("line_field", params.line_field);
  if (params.parent_l1) p.set("parent_l1", params.parent_l1);
  if (params.parent_l2) p.set("parent_l2", params.parent_l2);
  if (params.percent_base) p.set("percent_base", params.percent_base);
  return p.toString();
}

/** Llama al endpoint de Pareto y devuelve la respuesta tipada */
export async function fetchPareto(params: ParetoParams = {}): Promise<ParetoResp> {
  const qs = toQuery({
    level: "l1",
    metric: "minutes",
    only_classified: true,
    include_planned: false,
    top: 10,
    percent_base: "total",
    scope: "total",
    ...params,
  });

  const res = await fetch(`/api/pareto-stops?${qs}`, { cache: "no-store" });
  let data: ParetoResp;
  try {
    data = (await res.json()) as ParetoResp;
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${String(e)}` };
  }
  if (!res.ok) {
    if ((data as any)?.error) return { ok: false, error: (data as any).error };
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return data;
}
