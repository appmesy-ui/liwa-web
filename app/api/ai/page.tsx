"use client";

import { useState, useMemo } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const EXAMPLE_CONTEXT = {
  time_range: { from: "2025-09-27T06:00:00Z", to: "2025-09-27T14:00:00Z" },
  plant: { id: "p1", name: "Planta Demo" },
  line: { id: "l1", code: "L1", name: "Línea 1" },
  kpis: { availability: 0.91, performance: 0.88, quality: 0.97, oee: 0.78, trend_pp: { oee: -1.2 } },
  stops: [
    { type: "unplanned", lvl1: "Fallo", lvl2: "Mecánico", machine: "M3", duration_min: 12, count: 2 },
    { type: "planned", lvl1: "Cambio formato", lvl2: "Ajuste", machine: "M1", duration_min: 8, count: 1 }
  ],
  defects: [{ code: "Borde_Quemado", desc: "borde quemado", qty: 120 }],
  notes: ["Producto X-12. Lote MP nuevo.", "Operario reporta micro-paros en rodillos."]
};

export default function AiTestPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("Analiza el último turno y dame 3 quick wins.");
  const [contextText, setContextText] = useState(
    JSON.stringify(EXAMPLE_CONTEXT, null, 2)
  );
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"brief" | "detailed">("detailed");

  const contextObj = useMemo(() => {
    try {
      return contextText.trim() ? JSON.parse(contextText) : undefined;
    } catch {
      return undefined;
    }
  }, [contextText]);

  async function send() {
    if (!input.trim()) return;
    setLoading(true);

    try {
      const body = {
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: input.trim() }
        ],
        context: contextObj,
        mode
      };

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error desconocido");
      }

      setMessages((prev) => [
        ...prev,
        { role: "user", content: input.trim() },
        { role: "assistant", content: data.reply }
      ]);
      setInput("");
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${err?.message || "fallo llamando a /api/ai/chat"}` }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">LIWA AI · Prueba de Chat</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Panel de contexto */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Contexto JSON (opcional)</label>
          <textarea
            className="w-full h-72 rounded-xl border p-3 font-mono text-sm outline-none"
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            spellCheck={false}
          />
          {!contextObj && contextText.trim().length > 0 && (
            <p className="text-sm text-red-600">JSON inválido. Corrige el formato.</p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm">Modo:</span>
            <select
              className="border rounded-lg px-2 py-1"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="brief">Breve (~300 palabras)</option>
              <option value="detailed">Detallado (~600 palabras)</option>
            </select>
          </div>
        </div>

        {/* Panel de chat */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Pregunta / Instrucción</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border p-3 outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej: Compara OEE vs. ayer y propón acciones."
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
              }}
            />
            <button
              onClick={send}
              disabled={loading || (!contextObj && contextText.trim() !== "")}
              className="rounded-xl px-4 py-2 bg-black text-white disabled:opacity-50"
              title={!contextObj && contextText.trim() !== "" ? "JSON inválido" : "Enviar"}
            >
              {loading ? "Enviando..." : "Enviar"}
            </button>
          </div>

          <div className="rounded-xl border p-3 space-y-4 max-h-[520px] overflow-auto bg-white">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500">
                Envía tu primera consulta. Usa <kbd>Ctrl</kbd>+<kbd>Enter</kbd> para enviar.
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 ${
                    m.role === "user"
                      ? "bg-gray-100"
                      : "bg-gray-50 border"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                    {m.role === "user" ? "Tú" : "LIWA AI"}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Tip: deja el contexto ejemplo tal cual para validar el flujo y luego lo sustituimos por los datos reales del dashboard.
      </div>
    </div>
  );
}
