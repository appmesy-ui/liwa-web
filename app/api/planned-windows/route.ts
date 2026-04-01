// app/api/planned-windows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, PostgrestError } from "@supabase/supabase-js";

// Fuerza runtime Node (evita problemas en Edge con supabase-js/service role)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planned-windows
 * Salud simple para probar desde PowerShell/Browser (no lista datos).
 */
export async function GET() {
  return NextResponse.json({ ok: true, hint: "usa POST para crear una ventana planificada" });
}

/**
 * OPTIONS /api/planned-windows
 * Soporte básico por si el cliente hace preflight.
 */
export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

/**
 * POST /api/planned-windows
 * Crea una ventana planificada a nivel LÍNEA.
 * Body JSON:
 * {
 *   "line_id": "<uuid>",                 // requerido
 *   "start_ts": "2025-09-14T10:00:00Z",  // ISO (UTC o con offset)
 *   "end_ts":   "2025-09-14T12:00:00Z",  // ISO (UTC o con offset)
 *   "motivo":   "Mantenimiento",
 *   "notas":    "Cambio de correas"      // opcional
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-planned-windows" } },
      db: { schema: "liwa" }, // importante para apuntar a schema liwa
    });

    // ------ Validación de input -------
    const body = await req.json().catch(() => ({} as any));

    const line_id = String(body?.line_id ?? "").trim();
    const motivo = String(body?.motivo ?? "").trim();
    const notas =
      body?.notas === undefined || body?.notas === null ? null : String(body?.notas).trim();
    const startRaw = String(body?.start_ts ?? "").trim();
    const endRaw = String(body?.end_ts ?? "").trim();

    if (!line_id || !motivo || !startRaw || !endRaw) {
      return NextResponse.json(
        { ok: false, error: "line_id, start_ts, end_ts y motivo son requeridos" },
        { status: 400 }
      );
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ ok: false, error: "Fechas inválidas" }, { status: 400 });
    }
    if (!(start < end)) {
      return NextResponse.json(
        { ok: false, error: "start_ts debe ser anterior a end_ts" },
        { status: 400 }
      );
    }

    // ------ Resolver org_id desde la línea (no confiamos en el cliente) ------
    const { data: line, error: lineErr } = await admin
      .from("lines")
      .select("id, org_id")
      .eq("id", line_id)
      .single();

    if (lineErr || !line) {
      console.error("❌ Línea lookup error:", lineErr);
      return NextResponse.json(
        { ok: false, error: "Línea no encontrada o no accesible" },
        { status: 400 }
      );
    }

    // ------ Insertar planned_window (scope = línea) ------
    const payload = {
      org_id: line.org_id as string,
      plant_id: null as string | null,
      line_id,
      machine_id: null as string | null,
      start_ts: start.toISOString(), // guardamos en UTC
      end_ts: end.toISOString(),
      motivo,
      notas,
    };

    const { data, error, status } = await admin
      .from("planned_windows")
      .insert(payload)
      .select(
        "id, org_id, plant_id, line_id, machine_id, start_ts, end_ts, motivo, notas, created_at"
      )
      .single();

    if (error) {
      const e = error as PostgrestError & { details?: string; hint?: string };
      console.error("❌ planned_windows insert error:", {
        message: e.message,
        code: e.code,
        details: (e as any).details,
        hint: (e as any).hint,
        status,
      });
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code ?? null,
          details: (e as any).details ?? null,
          hint: (e as any).hint ?? null,
          status,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, row: data }, { status: 201 });
  } catch (err: any) {
    console.error("❌ planned-windows API exception:", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
