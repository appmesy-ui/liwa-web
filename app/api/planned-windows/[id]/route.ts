// app/api/planned-windows/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/planned-windows/:id
 * Elimina una planned_window por id (UUID).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const id = (params?.id || "").trim();
    // Validación básica de UUID v4 (relajada: 36 chars con guiones)
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "liwa" },
      global: { headers: { "X-Client-Info": "liwa-planned-windows-delete" } },
    });

    // Borrar y devolver fila borrada (si existía)
    const { data, error } = await admin
      .from("planned_windows")
      .delete()
      .eq("id", id)
      .select("id, org_id, plant_id, line_id, machine_id, start_ts, end_ts, motivo, notas, created_at")
      .single();

    if (error) {
      // Si no existe, PostgREST puede dar PGRST116 (No rows)
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
