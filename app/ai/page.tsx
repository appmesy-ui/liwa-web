"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };

type RowUI = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  trend_pp: number;
  spark: number[];
};

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

type TopStop = {
  key: string;
  line: string | null;
  machine: string | null;
  lvl1: string | null;
  lvl2: string | null;
  count: number;
  minutes_total: number;
  avg_min_per_event: number;
};

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

function pct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function buildTopStops(rows: PendingRow[], topN = 5) {
  const map = new Map<string, TopStop>();
  for (const r of rows) {
    const minutes = typeof r.duration_min === "number" ? r.duration_min : 0;
    const key = [r.line_code || "—", r.machine_code || "—", r.lvl1 || "—", r.lvl2 || "—"].join(" | ");
    const cur = map.get(key);
    if (cur) { cur.count += 1; cur.minutes_total += minutes; }
    else map.set(key, { key, line: r.line_code, machine: r.machine_code, lvl1: r.lvl1, lvl2: r.lvl2, count: 1, minutes_total: minutes, avg_min_per_event: 0 });
  }
  const arr = Array.from(map.values()).map((x) => ({ ...x, avg_min_per_event: x.count ? x.minutes_total / x.count : 0 }));
  const byMinutes = arr.slice().sort((a, b) => b.minutes_total - a.minutes_total).slice(0, topN)
    .map((x) => ({ line: x.line, machine: x.machine, lvl1: x.lvl1, lvl2: x.lvl2, count: x.count, minutes_total: round1(x.minutes_total), avg_min_per_event: round1(x.avg_min_per_event) }));
  const byCount = arr.slice().sort((a, b) => b.count - a.count || b.minutes_total - a.minutes_total).slice(0, topN)
    .map((x) => ({ line: x.line, machine: x.machine, lvl1: x.lvl1, lvl2: x.lvl2, count: x.count, minutes_total: round1(x.minutes_total), avg_min_per_event: round1(x.avg_min_per_event) }));
  return { byMinutes, byCount };
}

/* ── Quick actions ── */
const QUICK_ACTIONS = [
  { label: "Resumen del turno", prompt: "Dame un resumen ejecutivo del rendimiento de la planta en este rango." },
  { label: "¿Qué línea va peor?", prompt: "¿Qué línea tiene el OEE más bajo y cuál es la causa principal?" },
  { label: "Top paros", prompt: "¿Cuáles son los 3 paros que más tiempo productivo están quitando?" },
  { label: "Quick wins", prompt: "Dame 3 acciones concretas para mejorar el OEE esta semana, priorizadas por impacto." },
  { label: "Comparar líneas", prompt: "Compara el rendimiento de todas las líneas y dime cuál tiene más margen de mejora." },
];

/* ── Chip de KPI ── */
function KpiChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${color} min-w-[80px]`}>
      <span className="text-xs text-slate-400 mb-0.5">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  );
}

/* ── Burbuja de mensaje ── */
function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 mb-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
        isUser ? "bg-sky-600 text-white" : "bg-slate-800 text-sky-400 border border-slate-700"
      }`}>
        {isUser ? "Tú" : "AI"}
      </div>
      {/* Contenido */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? "bg-sky-600 text-white rounded-tr-sm"
          : "bg-slate-800/80 text-slate-100 border border-slate-700/60 rounded-tl-sm"
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function LiwaAiPage() {
  const sp = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Si no hay rango en la URL, usar últimas 24h por defecto
  const now = new Date();
  const defaultTo = now.toISOString();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const from = sp.get("from") || defaultFrom;
  const to = sp.get("to") || defaultTo;
  const linesParam = sp.get("lines") || "";

  /* ── Datos ── */
  const [kpisRows, setKpisRows] = useState<RowUI[] | null>(null);
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [paretoRows, setParetoRows] = useState<any[] | null>(null);
  const dataReady = kpisRows !== null && pendingRows !== null && paretoRows !== null;
  const hasData = kpisRows !== null && kpisRows.length > 0;

  useEffect(() => {
    let url = "/api/kpis?step=all";
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;
    fetch(url, { cache: "no-store" }).then(r => r.json()).then(d => setKpisRows(d.ok ? d.rows || [] : [])).catch(() => setKpisRows([]));
  }, [from, to]);

  useEffect(() => {
    const params = new URLSearchParams({ state: "pending", limit: "500" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/downtimes?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const rows: PendingRow[] = (Array.isArray(d.rows) ? d.rows : []).map((ev: any) => ({
          id: ev.id, line_code: ev.line_code ?? null, machine_code: ev.machine_code ?? null,
          started_at: ev.started_at ?? null, ended_at: ev.ended_at ?? null,
          duration_min: ev.duration_s != null ? Math.round(Number(ev.duration_s) / 60) : null,
          lvl1: null, lvl2: ev.n2_name ?? null, lvl3: ev.n3_name ?? null,
          classified: ev.state === "classified",
        }));
        setPendingRows(rows);
      })
      .catch(() => setPendingRows([]));
  }, [from, to]);

  // Paros clasificados via pareto-stops (nivel l2 = causa)
  useEffect(() => {
    const params = new URLSearchParams({ level: "l2", top: "10", metric: "minutes" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/pareto-stops?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => setParetoRows(d.ok ? (d.categories || []) : []))
      .catch(() => setParetoRows([]));
  }, [from, to]);

  /* ── Contexto para la IA (invisible al usuario) ── */
  const contextObj = useMemo(() => {
    if (!kpisRows) return undefined;
    const selectedLines = linesParam.split(",").map(s => s.trim()).filter(Boolean);
    const rowsFiltered = selectedLines.length > 0
      ? kpisRows.filter(r => selectedLines.some(s => (r.line_code || "").toLowerCase().includes(s.toLowerCase())))
      : kpisRows;
    const summary = {
      availability: avg(rowsFiltered.map(r => r.availability)),
      performance: avg(rowsFiltered.map(r => r.performance)),
      quality: avg(rowsFiltered.map(r => r.quality)),
      oee: avg(rowsFiltered.map(r => r.oee)),
    };
    const per_line = rowsFiltered.map(r => ({ line: r.line_code, A: r.availability, P: r.performance, Q: r.quality, OEE: r.oee, trend_pp: r.trend_pp }));
    let topStops = undefined;
    if (pendingRows && pendingRows.length > 0) {
      const filtered = selectedLines.length > 0
        ? pendingRows.filter(r => selectedLines.some(s => (r.line_code || "").toLowerCase().includes(s.toLowerCase())))
        : pendingRows;
      const tops = buildTopStops(filtered, 5);
      topStops = { byMinutes: tops.byMinutes, byCount: tops.byCount };
    }
    const noData = per_line.length === 0;

    // Top paros clasificados del pareto — agrupados por causa (N2)
    const classifiedStops = (paretoRows || []).map((r: any) => ({
      causa: r.label ?? null,
      minutos_total: r.minutes ?? null,
      ocurrencias: r.count ?? null,
      pct_del_total: r.pct ?? null,
    }));

    return {
      source: "liwa-db",
      time_range: from && to ? { from, to } : undefined,
      no_production_data: noData,
      kpis: noData ? null : { summary, per_line },
      stops_classified_top: classifiedStops.length > 0 ? classifiedStops : null,
      stops_pending_count: (pendingRows || []).length,
    };
  }, [kpisRows, pendingRows, from, to, linesParam]);

  /* ── KPIs agregados para mostrar en chips ── */
  const agg = useMemo(() => {
    if (!kpisRows || kpisRows.length === 0) return null;
    return {
      oee: avg(kpisRows.map(r => r.oee)),
      availability: avg(kpisRows.map(r => r.availability)),
      performance: avg(kpisRows.map(r => r.performance)),
      quality: avg(kpisRows.map(r => r.quality)),
    };
  }, [kpisRows]);

  /* ── Scroll al último mensaje ── */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  /* ── Enviar mensaje ── */
  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || !dataReady) return;
    setLoading(true);
    const userMsg: Msg = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: "user", content }],
          context: contextObj,
          mode: "detailed",
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `No pude obtener respuesta. ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-3xl mx-auto px-4 py-6 gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Copiloto de Planta</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {from && to
              ? `${new Date(from).toLocaleDateString()} → ${new Date(to).toLocaleDateString()}`
              : "Cargando rango…"}
          </p>
        </div>
        {/* KPI chips */}
        {agg && (
          <div className="flex gap-2">
            <KpiChip label="OEE" value={pct(agg.oee)} color="border-sky-800/60 bg-sky-950/40" />
            <KpiChip label="Disp." value={pct(agg.availability)} color="border-emerald-800/60 bg-emerald-950/40" />
            <KpiChip label="Rend." value={pct(agg.performance)} color="border-violet-800/60 bg-violet-950/40" />
            <KpiChip label="Cal." value={pct(agg.quality)} color="border-amber-800/60 bg-amber-950/40" />
          </div>
        )}
        {!agg && (
          <div className="flex gap-2">
            {["OEE", "Disp.", "Rend.", "Cal."].map(l => (
              <div key={l} className="w-20 h-14 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      {/* ── Aviso sin datos ── */}
      {dataReady && !hasData && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50 text-xs text-amber-300">
          <span>⚠</span>
          <span>No hay datos de producción para este rango. Verifica que el gateway esté activo o cambia el período.</span>
        </div>
      )}

      {/* ── Chat ── */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
      >
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-sky-600/20 border border-sky-700/40 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="text-sm text-slate-300 font-medium">¿Qué quieres analizar?</p>
              <p className="text-xs text-slate-500 mt-1">Pregunta lo que necesites o usa una acción rápida</p>
            </div>
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  disabled={!dataReady}
                  className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:border-sky-600 hover:text-sky-300 hover:bg-sky-950/30 transition-colors disabled:opacity-40"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}

        {loading && (
          <div className="flex gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-sky-400 font-bold shrink-0">AI</div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Quick actions (cuando ya hay chat) ── */}
      {messages.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {QUICK_ACTIONS.slice(0, 3).map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.prompt)}
              disabled={loading || !dataReady}
              className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-300 hover:bg-sky-950/30 transition-colors disabled:opacity-40"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-600 transition-colors placeholder:text-slate-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={dataReady ? "Pregunta algo sobre tu planta…" : "Cargando datos…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={!dataReady || loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !dataReady || !input.trim()}
          className="px-4 py-3 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
