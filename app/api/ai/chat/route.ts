// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * Configuración
 * - Define el modelo por env: OPENAI_CHAT_MODEL (fallback: gpt-4o-mini)
 * - Requiere OPENAI_API_KEY en el entorno del servidor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `
Eres **LIWA AI**, un consultor de planta integrado en el dashboard LIWA (Next.js + Supabase).
Objetivo: convertir datos operativos en diagnósticos claros y acciones priorizadas.

Estilo y reglas:
- Tono: operativo, técnico, ingenieril; directo y específico.
- Idioma: responde en español por defecto; si el usuario escribe en otro idioma, usa ese idioma.
- Privacidad: puedes referirte a prácticas del sector, pero **no menciones empresas por nombre**. Usa frases como “es común en la industria…”.
- Fuente: basa tu análisis únicamente en los datos recibidos en el contexto y los mensajes. **No inventes cifras**.
- Si el contexto llega con "no_production_data: true" o per_line vacío, significa que no hay datos de producción para ese rango. Responde brevemente: indica que no hay datos para ese período y sugiere verificar que el gateway esté activo o cambiar el rango de fechas. No pidas datos al usuario.
- Si hay datos parciales, trabaja con lo disponible y señala qué falta.
- Métricas: A (Disponibilidad), P (Rendimiento), Q (Calidad), OEE. Cuando des números usa 1 decimal y unidades (%, min, u/h). Redondea.
- Paros: clasifica Planned vs Unplanned, destaca Top-N por duración/ocurrencias, comenta MTTF/MTTR si el contexto lo permite, señala micro-paros si se observan.
- Defectos: conecta scrap/defectos con posibles causas de proceso (materia prima, set-up, mantenimiento, parámetros, método).
- Estructura de salida por defecto (puedes omitir secciones vacías):
  1) Lectura rápida (A, P, Q, OEE e idea clave del turno)
  2) Principales pérdidas (Pareto resumido)
  3) Hipótesis y pruebas (qué validar y cómo)
  4) Acciones inmediatas (Quick Wins < 48h)
  5) Acciones raíz (5-Why / Kaizen) con dueños y plazos sugeridos
  6) Riesgos y supuestos
  7) Métrica(s) a vigilar en el siguiente turno
- Brevedad: si el usuario pide algo “breve/short”, limita a ~300 palabras; si no, ~600.
- Evita genéricos vacíos: cada recomendación debe ser accionable (qué, quién, cuándo, cómo medir).
- Si el usuario pide comparar histórico y el contexto no trae series, dilo y sugiere el rango a consultar.

Contexto esperado (ejemplos de claves si vienen en JSON):
{
  "time_range": {"from":"ISO", "to":"ISO"},
  "plant": { "id": "...", "name": "..." },
  "line": { "id": "...", "code": "L1", "name": "Línea 1" },
  "kpis": { "availability":0.91, "performance":0.88, "quality":0.97, "oee":0.78, "trend_pp": { "oee": -1.2 } },
  "stops": [ { "type":"unplanned|planned", "lvl1":"Fallo", "lvl2":"Mecánico", "machine":"M3", "duration_min": 12, "count":2 } ],
  "defects": [ { "code":"SCRAP_X", "desc":"borde quemado", "qty": 120 } ],
  "notes": ["observación operador...", "..."]
}

Si alguna clave no llega, procede con lo disponible y pide lo mínimo adicional para mejorar la precisión.
`.trim();

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatBody = {
  messages: ChatMessage[];
  /** Contexto opcional (se injecta al prompt). Puede ser cualquier objeto serializable. */
  context?: Record<string, any>;
  /** "brief" para respuesta corta; "detailed" por defecto. */
  mode?: "brief" | "detailed";
  /** Forzar idioma (por ejemplo "es" | "en"). Si no se envía, LIWA AI infiere. */
  locale?: string;
};

function ensureApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta OPENAI_API_KEY en variables de entorno del servidor."
    );
  }
}

function sanitizeMessages(msgs: ChatMessage[]): ChatMessage[] {
  // Filtra mensajes vacíos y limita tamaño básico
  const cleaned = (msgs || [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-20); // Últimos 20 como safety
  return cleaned.length ? cleaned : [{ role: "user", content: "Analiza el último turno." }];
}

function buildSystemContent(mode?: "brief" | "detailed", locale?: string, ctx?: Record<string, any>) {
  const modeNote =
    mode === "brief"
      ? "\nInstrucción de longitud: Respuesta BREVE (~300 palabras)."
      : "\nInstrucción de longitud: Respuesta DETALLADA (~600 palabras).";

  const localeNote = locale
    ? `\nIdioma forzado: ${locale}.`
    : "";

  let ctxNote = "";
  if (ctx && Object.keys(ctx).length > 0) {
    // Inyecta el contexto como JSON legible dentro del system
    const ctxJson = safeJson(ctx, 4000); // limite defensivo
    ctxNote = `\n---\nContexto de datos (JSON):\n${ctxJson}\n---`;
  }

  return `${SYSTEM_PROMPT}${modeNote}${localeNote}${ctxNote}`;
}

function safeJson(obj: any, maxLen = 8000) {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length <= maxLen ? s : s.slice(0, maxLen) + "\n/* ...truncado... */";
  } catch {
    return "/* contexto no serializable */";
  }
}

export async function GET() {
  // Healthcheck simple
  return NextResponse.json({ ok: true, model: MODEL, status: "LIWA AI endpoint live" });
}

export async function POST(req: NextRequest) {
  try {
    ensureApiKey();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const body = (await req.json()) as ChatBody;

    const userMessages = sanitizeMessages(body?.messages || []);
    const systemContent = buildSystemContent(body?.mode, body?.locale, body?.context);

    const messages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...userMessages,
    ];

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 900, // control de coste
    });

    const choice = completion.choices?.[0]?.message;
    const reply = choice?.content?.trim() || "";

    return NextResponse.json(
      {
        ok: true,
        reply,
        meta: {
          model: MODEL,
          usage: completion.usage ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg =
      typeof err?.message === "string"
        ? err.message
        : "Error inesperado generando la respuesta.";
    // No exponemos detalles sensibles
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
