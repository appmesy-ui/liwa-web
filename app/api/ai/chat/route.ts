// app/api/ai/chat/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://liwa-web.vercel.app";

/* ─────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────── */
const SYSTEM_PROMPT = `
Eres LIWA AI, un agente de análisis de planta industrial integrado en el sistema OEE LIWA.
Tu misión: convertir datos operativos en diagnósticos claros y acciones concretas priorizadas.

COMPORTAMIENTO:
- Cuando el usuario hace una pregunta, usa las herramientas disponibles para obtener los datos que necesitas ANTES de responder.
- No esperes que el usuario te dé los datos — búscalos tú con las tools.
- Si una tool falla o devuelve vacío, indícalo brevemente y responde con lo que tengas.
- Nunca inventes cifras. Si no hay datos reales, dilo y explica por qué (ej: rango sin producción).

ESTILO:
- Tono: operativo, técnico, ingenieril. Directo y específico.
- Responde en español.
- Estructura sugerida cuando hay datos: resumen rápido → principales pérdidas → hipótesis → acciones concretas (qué, quién, cuándo).
- Usa métricas reales: OEE, A (Disponibilidad), P (Rendimiento), Q (Calidad), minutos, unidades.
- Cada recomendación debe ser accionable: qué hacer, quién, en qué plazo.
- Si hay paros clasificados, analiza el Pareto: qué causa el 80% del tiempo perdido.
- Si hay paros pendientes de clasificar, mencionalo como riesgo para el análisis.
`.trim();

/* ─────────────────────────────────────────
   TOOL DEFINITIONS
───────────────────────────────────────── */
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_kpis",
      description: "Obtiene KPIs de OEE (disponibilidad, rendimiento, calidad) por línea para un rango de fechas. Úsalo cuando necesites saber el rendimiento general de la planta.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicio en ISO 8601" },
          to: { type: "string", description: "Fecha fin en ISO 8601" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pareto",
      description: "Obtiene el Pareto de paros clasificados agrupados por causa (N1 o N2). Úsalo para analizar qué paros causan más pérdida de tiempo.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicio en ISO 8601" },
          to: { type: "string", description: "Fecha fin en ISO 8601" },
          level: { type: "string", enum: ["l1", "l2"], description: "l1 = categoría principal, l2 = causa específica" },
          top: { type: "number", description: "Número de causas a devolver (por defecto 10)" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_stops",
      description: "Obtiene los paros sin clasificar. Úsalo para saber cuántos paros faltan por analizar.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicio en ISO 8601" },
          to: { type: "string", description: "Fecha fin en ISO 8601" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quality",
      description: "Obtiene datos de defectos y scrap por línea. Úsalo cuando la pregunta sea sobre calidad, defectos o scrap.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicio en ISO 8601" },
          to: { type: "string", description: "Fecha fin en ISO 8601" },
        },
        required: ["from", "to"],
      },
    },
  },
];

/* ─────────────────────────────────────────
   TOOL EXECUTION
───────────────────────────────────────── */
async function executeTool(name: string, args: any): Promise<string> {
  try {
    const params = new URLSearchParams();
    if (args.from) params.set("from", args.from);
    if (args.to) params.set("to", args.to);

    let url = "";
    let result: any = null;

    if (name === "get_kpis") {
      params.set("step", "all");
      url = `${BASE_URL}/api/kpis?${params}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!d.ok || !d.rows?.length) return JSON.stringify({ error: "Sin datos de producción para este rango" });
      result = d.rows.map((r: any) => ({
        linea: r.line_code,
        oee: r.oee != null ? `${Math.round(r.oee * 100)}%` : null,
        disponibilidad: r.availability != null ? `${Math.round(r.availability * 100)}%` : null,
        rendimiento: r.performance != null ? `${Math.round(r.performance * 100)}%` : null,
        calidad: r.quality != null ? `${Math.round(r.quality * 100)}%` : null,
        tendencia_pp: r.trend_pp ?? null,
      }));
    }

    else if (name === "get_pareto") {
      params.set("level", args.level || "l2");
      params.set("top", String(args.top || 10));
      params.set("metric", "minutes");
      url = `${BASE_URL}/api/pareto-stops?${params}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!d.ok || !d.categories?.length) return JSON.stringify({ error: "Sin paros clasificados para este rango" });
      result = {
        total_minutos_perdidos: d.meta?.total_minutes,
        total_ocurrencias: d.meta?.total_count,
        top_causas: d.categories.map((c: any) => ({
          causa: c.label,
          minutos: c.minutes,
          ocurrencias: c.count,
          pct: `${c.pct}%`,
          acumulado: `${c.cumPct}%`,
        })),
      };
    }

    else if (name === "get_pending_stops") {
      params.set("state", "pending");
      params.set("limit", "50");
      url = `${BASE_URL}/api/downtimes?${params}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!d.ok) return JSON.stringify({ error: "Error al obtener paros pendientes" });
      result = {
        total_pendientes: d.total_count ?? 0,
        muestra: (d.rows || []).slice(0, 10).map((r: any) => ({
          linea: r.line_code,
          maquina: r.machine_code,
          inicio: r.started_at,
          duracion_min: r.duration_s ? Math.round(r.duration_s / 60) : null,
        })),
      };
    }

    else if (name === "get_quality") {
      url = `${BASE_URL}/api/quality/defects?${params}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!d.ok || !d.rows?.length) return JSON.stringify({ error: "Sin datos de calidad para este rango" });
      result = d.rows;
    }

    return JSON.stringify(result ?? { error: "Tool no reconocida" });
  } catch (e: any) {
    return JSON.stringify({ error: e?.message || "Error ejecutando tool" });
  }
}

/* ─────────────────────────────────────────
   HANDLER
───────────────────────────────────────── */
type ChatBody = {
  messages: { role: "user" | "assistant"; content: string }[];
  time_range?: { from: string; to: string };
};

export async function GET() {
  return NextResponse.json({ ok: true, model: MODEL, status: "LIWA AI agent live" });
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const body = (await req.json()) as ChatBody;
    const userMessages = (body.messages || [])
      .filter(m => m.content?.trim())
      .slice(-20);

    // Inyectar rango de tiempo en el system para que el agente lo use en las tools
    const rangeNote = body.time_range
      ? `\nRango de tiempo activo en el dashboard: from="${body.time_range.from}" to="${body.time_range.to}". Usa estos valores por defecto en las tools a menos que el usuario pida otro rango.`
      : "";

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT + rangeNote },
      ...userMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Agentic loop — máximo 5 iteraciones para evitar loops infinitos
    let iterations = 0;
    while (iterations < 5) {
      iterations++;

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 1200,
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      // Si la IA quiere llamar tools
      if (choice.finish_reason === "tool_calls" && msg.tool_calls?.length) {
        messages.push(msg); // añadir mensaje del asistente con tool_calls

        // Ejecutar todas las tools en paralelo
        const toolResults = await Promise.all(
          msg.tool_calls.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await executeTool(tc.function.name, args);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: result,
            };
          })
        );

        messages.push(...toolResults);
        continue; // siguiente iteración con los resultados
      }

      // Respuesta final
      const reply = msg.content?.trim() || "";
      return NextResponse.json({ ok: true, reply, meta: { model: MODEL, iterations } });
    }

    return NextResponse.json({ ok: false, error: "El agente alcanzó el límite de iteraciones" }, { status: 500 });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Error inesperado" }, { status: 500 });
  }
}
