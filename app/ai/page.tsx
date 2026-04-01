"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };

// ==== Tipos (basados en tus endpoints actuales) ====

// /api/kpis row (según tu RowUI)
type RowUI = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  trend_pp: number;            // delta pp
  spark: number[];             // 0–100
};

type KpisApiResp =
  | { ok: true; rows: RowUI[]; meta?: any }
  | { ok: false; error: string }
  | any;

// /api/pending row (según tu PendingRow)
type PendingRow = {
  id: string;
  line_code: string | null;
  machine_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean | null;
};

type PendingApiResp =
  | { ok: true; rows: PendingRow[] }
  | { ok: false; error: string }
  | any;

// ==== Utilidades ====
function avg(arr: (number | null | undefined)[]) {
  const vals = arr
    .map((v) => (typeof v === "number" && isFinite(v) ? v : null))
    .filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function round1(n: number | null) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

type TopStop = {
  key: string;                  // combinación para agrupar
  line: string | null;
  machine: string | null;
  lvl1: string | null;
  lvl2: string | null;
  count: number;
  minutes_total: number;        // suma de minutos
  avg_min_per_event: number;    // minutos_total / count
};

// Agrupa paros pendientes y genera top N
function buildTopStops(rows: PendingRow[], topN = 5) {
  const map = new Map<string, TopStop>();
  for (const r of rows) {
    const minutes = typeof r.duration_min === "number" ? r.duration_min : 0;
    const key = [
      r.line_code || "—",
      r.machine_code || "—",
      r.lvl1 || "—",
      r.lvl2 || "—",
    ].join(" | ");
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.minutes_total += minutes;
    } else {
      map.set(key, {
        key,
        line: r.line_code,
        machine: r.machine_code,
        lvl1: r.lvl1,
        lvl2: r.lvl2,
        count: 1,
        minutes_total: minutes,
        avg_min_per_event: 0,
      });
    }
  }
  const arr = Array.from(map.values()).map((x) => ({
    ...x,
    avg_min_per_event: x.count ? x.minutes_total / x.count : 0,
  }));

  const byMinutes = arr
    .slice()
    .sort((a, b) => b.minutes_total - a.minutes_total)
    .slice(0, topN)
    .map((x) => ({
      line: x.line,
      machine: x.machine,
      lvl1: x.lvl1,
      lvl2: x.lvl2,
      count: x.count,
      minutes_total: round1(x.minutes_total),
      avg_min_per_event: round1(x.avg_min_per_event),
    }));

  const byCount = arr
    .slice()
    .sort((a, b) => b.count - a.count || b.minutes_total - a.minutes_total)
    .slice(0, topN)
    .map((x) => ({
      line: x.line,
      machine: x.machine,
      lvl1: x.lvl1,
      lvl2: x.lvl2,
      count: x.count,
      minutes_total: round1(x.minutes_total),
      avg_min_per_event: round1(x.avg_min_per_event),
    }));

  return { byMinutes, byCount };
}

export default function LiwaAiPage() {
  const sp = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("Analiza el rango seleccionado y dame 3 quick wins priorizados.");
  const [mode, setMode] = useState<"brief" | "detailed">("detailed");
  const [loading, setLoading] = useState(false);

  // 1) Parámetros del dashboard
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const linesParam = sp.get("lines") || ""; // opcional (coma separada)

  // 2) KPIs reales
  const [kpisRows, setKpisRows] = useState<RowUI[] | null>(null);
  const [kpisErr, setKpisErr] = useState<string | null>(null);

  useEffect(() => {
    let url = "/api/kpis?step=all";
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;

    (async () => {
      try {
        setKpisErr(null);
        setKpisRows(null);
        const r = await fetch(url, { cache: "no-store" });
        const data: KpisApiResp = await r.json();
        if (!data.ok) throw new Error(data.error || "Error en /api/kpis");
        setKpisRows(data.rows || []);
      } catch (e: any) {
        setKpisErr(e.message || "Fallo al cargar KPIs");
      }
    })();
  }, [from, to]);

  // 3) Paros pendientes (usaremos esto como “top paros” del rango)
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [pendingErr, setPendingErr] = useState<string | null>(null);

  useEffect(() => {
    let url = "/api/pending";
    // Si tu /api/pending soporta from/to, descomenta:
    if (from) url += `${url.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
    if (to) url += `${url.includes("?") ? "&" : "?"}to=${encodeURIComponent(to)}`;

    (async () => {
      try {
        setPendingErr(null);
        setPendingRows(null);
        const r = await fetch(url, { cache: "no-store" });
        const data: PendingApiResp = await r.json();
        if (!data.ok) throw new Error(data.error || "Error en /api/pending");
        // Si tu /api/pending no filtra por rango todavía, filtramos aquí por started_at/ended_at:
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const ranged = (from && to)
          ? rows.filter((ev) => {
              const s = ev.started_at ? Date.parse(ev.started_at) : NaN;
              const e = ev.ended_at ? Date.parse(ev.ended_at) : NaN;
              const f = Date.parse(from);
              const t = Date.parse(to);
              // Conservador: si no hay fechas válidas, incluimos; si hay, chequeamos solape con el rango
              if (!isFinite(s) && !isFinite(e)) return true;
              if (isFinite(s) && s >= f && s <= t) return true;
              if (isFinite(e) && e >= f && e <= t) return true;
              return false;
            })
          : rows;
        setPendingRows(ranged);
      } catch (e: any) {
        setPendingErr(e.message || "Fallo al cargar pendientes");
      }
    })();
  }, [from, to]);

  // 4) Construye contexto para GPT: KPIs + Top paros pendientes
  const contextObj = useMemo(() => {
    if (!kpisRows) return undefined;

    // Filtro por líneas (si llega por URL), aquí solo filtramos para el resumen
    const selectedLines = linesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const rowsFiltered =
      selectedLines.length > 0
        ? kpisRows.filter((r) => {
            const code = (r.line_code || "").toLowerCase();
            return selectedLines.some((s) => code.includes(s.toLowerCase()));
          })
        : kpisRows;

    const summary = {
      availability: avg(rowsFiltered.map((r) => r.availability)),
      performance: avg(rowsFiltered.map((r) => r.performance)),
      quality: avg(rowsFiltered.map((r) => r.quality)),
      oee: avg(rowsFiltered.map((r) => r.oee)),
    };

    const per_line = rowsFiltered.map((r) => ({
      line: r.line_code,
      A: r.availability,
      P: r.performance,
      Q: r.quality,
      OEE: r.oee,
      trend_pp: r.trend_pp,
    }));

    // Top paros pendientes (si hay)
    let topStops:
      | { byMinutes: any[]; byCount: any[] }
      | undefined = undefined;

    if (pendingRows && pendingRows.length > 0) {
      // Filtra por líneas si aplica
      const pendingFiltered =
        selectedLines.length > 0
          ? pendingRows.filter((r) => {
              const code = (r.line_code || "").toLowerCase();
              return selectedLines.some((s) => code.includes(s.toLowerCase()));
            })
          : pendingRows;

      const tops = buildTopStops(pendingFiltered, 5);
      topStops = {
        byMinutes: tops.byMinutes,
        byCount: tops.byCount,
      };
    }

    return {
      source: "liwa-db",
      time_range: from && to ? { from, to } : undefined,
      filter: selectedLines.length ? { lines: selectedLines } : undefined,
      kpis: {
        summary,
        per_line,
      },
      stops_pending_top: topStops, // <<— aquí viajan los “paros top” (pendientes)
      notes: [
        "Paros top calculados sobre pendientes; cuando haya endpoint de históricos clasificados, lo cambiaremos.",
      ],
    };
  }, [kpisRows, pendingRows, from, to, linesParam]);

  // 5) Envío a /api/ai/chat
  async function send() {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: input.trim() },
          ],
          context: contextObj, // KPIs + paros top (pendientes)
          mode,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error en /api/ai/chat");

      setMessages((prev) => [
        ...prev,
        { role: "user", content: input.trim() },
        { role: "assistant", content: data.reply },
      ]);
      setInput("");
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold">LIWA AI · Consultor de Planta</h1>
        <div className="flex items-center gap-2">
          <select
            className="bg-slate-900 border border-slate-700 rounded-lg text-sm px-2 py-1"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
          >
            <option value="brief">Breve (~300 palabras)</option>
            <option value="detailed">Detallado (~600 palabras)</option>
          </select>
        </div>
      </div>

      {/* Estado de carga de datos */}
      <div className="text-xs text-slate-400 space-x-3">
        <span>
          Rango: {from ? new Date(from).toLocaleString() : "—"} → {to ? new Date(to).toLocaleString() : "—"}
        </span>
        <span>
          {kpisErr ? (
            <span className="text-rose-400">Error KPIs: {kpisErr}</span>
          ) : kpisRows ? (
            <span>{kpisRows.length} filas KPI</span>
          ) : (
            <span>cargando KPIs…</span>
          )}
        </span>
        <span>
          {pendingErr ? (
            <span className="text-rose-400">Error Pendientes: {pendingErr}</span>
          ) : pendingRows ? (
            <span>{pendingRows.length} paros pendientes</span>
          ) : (
            <span>cargando pendientes…</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6">
        {/* Chat */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 min-h-[320px] max-h-[65vh] overflow-auto">
            {messages.length === 0 ? (
              <div className="text-sm text-slate-400">
                Escribe tu pregunta y presiona <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 sm:p-4 mb-3 ${
                    m.role === "user" ? "bg-slate-900/60" : "bg-slate-900/40 border border-slate-800"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                    {m.role === "user" ? "Tú" : "LIWA AI"}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Haz tu pregunta al consultor de planta…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
              }}
              disabled={!kpisRows}
            />
            <button
              onClick={send}
              disabled={loading || !kpisRows}
              className="rounded-xl px-4 py-2 bg-black border border-slate-700 hover:bg-slate-900 disabled:opacity-50"
            >
              {loading ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>

        {/* Vista previa del contexto que se envía a GPT */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Contexto para LIWA AI</div>
          <textarea
            className="w-full h-[420px] rounded-xl border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] outline-none"
            readOnly
            value={
              kpisRows
                ? JSON.stringify(
                    contextObj,
                    null,
                    2
                  )
                : "// cargando…"
            }
          />
          <div className="text-xs text-slate-400">
            * “stops_pending_top” = top paros pendientes por minutos y por ocurrencias (rango seleccionado).
          </div>
        </div>
      </div>
    </div>
  );
}
