"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };

function pct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function avg(arr: (number | null | undefined)[]) {
  const vals = arr
    .map((v) => (typeof v === "number" && isFinite(v) ? v : null))
    .filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ── Quick actions ── */
const QUICK_ACTIONS = [
  { label: "Resumen del turno", prompt: "Dame un resumen ejecutivo del rendimiento de la planta en este rango." },
  { label: "Linea mas baja", prompt: "Que linea tiene el OEE mas bajo y cual es la causa principal?" },
  { label: "Top paros", prompt: "Cuales son los 3 paros que mas tiempo productivo estan quitando?" },
  { label: "Quick wins", prompt: "Dame 3 acciones concretas para mejorar el OEE esta semana, priorizadas por impacto." },
  { label: "Comparar lineas", prompt: "Compara el rendimiento de todas las lineas y dime cual tiene mas margen de mejora." },
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
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
        isUser ? "bg-sky-600 text-white" : "bg-slate-800 text-sky-400 border border-slate-700"
      }`}>
        {isUser ? "Tu" : "AI"}
      </div>
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

  // Rango de tiempo: URL params o ultimas 24h por defecto
  const now = new Date();
  const defaultTo = now.toISOString();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const from = sp.get("from") || defaultFrom;
  const to = sp.get("to") || defaultTo;

  // KPIs ligeros solo para los chips del header
  const [chipData, setChipData] = useState<{ oee: number | null; availability: number | null; performance: number | null; quality: number | null } | null>(null);

  useEffect(() => {
    let url = `/api/kpis?step=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.rows?.length) {
          const rows = d.rows;
          setChipData({
            oee: avg(rows.map((r: any) => r.oee)),
            availability: avg(rows.map((r: any) => r.availability)),
            performance: avg(rows.map((r: any) => r.performance)),
            quality: avg(rows.map((r: any) => r.quality)),
          });
        } else {
          setChipData({ oee: null, availability: null, performance: null, quality: null });
        }
      })
      .catch(() => setChipData({ oee: null, availability: null, performance: null, quality: null }));
  }, [from, to]);

  /* Scroll al ultimo mensaje */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  /* Enviar mensaje al agente */
  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setLoading(true);
    const userMsg: Msg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          time_range: { from, to },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `No pude obtener respuesta. ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const rangeLabel =
    from && to
      ? `${new Date(from).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} — ${new Date(to).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
      : "Ultimas 24h";

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-3xl mx-auto px-4 py-6 gap-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Copiloto de Planta</h1>
          <p className="text-xs text-slate-400 mt-0.5">{rangeLabel}</p>
        </div>
        {/* KPI chips */}
        <div className="flex gap-2">
          {chipData ? (
            <>
              <KpiChip label="OEE" value={pct(chipData.oee)} color="border-sky-800/60 bg-sky-950/40 text-sky-300" />
              <KpiChip label="Disp." value={pct(chipData.availability)} color="border-emerald-800/60 bg-emerald-950/40 text-emerald-300" />
              <KpiChip label="Rend." value={pct(chipData.performance)} color="border-violet-800/60 bg-violet-950/40 text-violet-300" />
              <KpiChip label="Cal." value={pct(chipData.quality)} color="border-amber-800/60 bg-amber-950/40 text-amber-300" />
            </>
          ) : (
            ["OEE", "Disp.", "Rend.", "Cal."].map((l) => (
              <div key={l} className="w-20 h-14 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
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
              <p className="text-sm text-slate-300 font-medium">Que quieres analizar?</p>
              <p className="text-xs text-slate-500 mt-1">Pregunta lo que necesites o usa una accion rapida</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  disabled={loading}
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
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-sky-400 font-bold shrink-0">
              AI
            </div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Quick actions secundarias (cuando hay chat activo) */}
      {messages.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {QUICK_ACTIONS.slice(0, 3).map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.prompt)}
              disabled={loading}
              className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-300 hover:bg-sky-950/30 transition-colors disabled:opacity-40"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-600 transition-colors placeholder:text-slate-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta algo sobre tu planta..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
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
