// app/api/shifts/calendar/instances/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (SERVICE ROLE).");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

type CreatePayload = {
  mode: "create";
  plant_id: string;
  date: string; // YYYY-MM-DD
  template_id: string;
  scope: "plant" | "lines";
  line_ids?: string[];
};

type EditPayload = {
  mode: "edit";
  instance_id: string;
  template_id: string;
};

type DeletePayload = {
  id: string;
};

export async function POST(req: NextRequest) {
  try {
    const sb = getAdmin();
    const body = (await req.json()) as CreatePayload | EditPayload | any;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Body inválido." },
        { status: 400 }
      );
    }

    // ===== CREAR =====
    if (body.mode === "create") {
      const { plant_id, date, template_id, scope, line_ids } =
        body as CreatePayload;

      if (!plant_id || !date || !template_id || !scope) {
        return NextResponse.json(
          { ok: false, error: "Faltan datos para crear turno." },
          { status: 400 }
        );
      }

      // Plantilla → para obtener org_id
      const { data: tpl, error: tErr } = await sb
        .schema("liwa")
        .from("shift_templates")
        .select("id, org_id")
        .eq("id", template_id)
        .limit(1)
        .single();

      if (tErr || !tpl) {
        throw new Error("Plantilla de turno no encontrada.");
      }

      // Insertar instancia
      const { data: inserted, error: iErr } = await sb
        .schema("liwa")
        .from("shift_instances")
        .insert({
          org_id: tpl.org_id,
          plant_id,
          template_id,
          shift_date: date,
        })
        .select("id")
        .limit(1);

      if (iErr) throw iErr;

      const instanceId = inserted?.[0]?.id as string | undefined;
      if (!instanceId) {
        throw new Error("No se pudo crear la instancia de turno.");
      }

      // Líneas específicas (opcional)
      const finalLineIds =
        scope === "lines" && Array.isArray(line_ids) ? line_ids : [];

      if (finalLineIds.length) {
        const rows = finalLineIds.map((lineId) => ({
          shift_instance_id: instanceId,
          line_id: lineId,
        }));

        const { error: lErr } = await sb
          .schema("liwa")
          .from("shift_instance_lines")
          .insert(rows);

        if (lErr) throw lErr;
      }

      return NextResponse.json({
        ok: true,
        instance_id: instanceId,
      });
    }

    // ===== EDITAR =====
    if (body.mode === "edit") {
      const { instance_id, template_id } = body as EditPayload;

      if (!instance_id || !template_id) {
        return NextResponse.json(
          { ok: false, error: "Faltan datos para editar turno." },
          { status: 400 }
        );
      }

      // Plantilla → de nuevo sacamos org_id
      const { data: tpl, error: tErr } = await sb
        .schema("liwa")
        .from("shift_templates")
        .select("id, org_id")
        .eq("id", template_id)
        .limit(1)
        .single();

      if (tErr || !tpl) {
        throw new Error("Plantilla de turno no encontrada.");
      }

      const { error: uErr } = await sb
        .schema("liwa")
        .from("shift_instances")
        .update({
          template_id,
          org_id: tpl.org_id,
        })
        .eq("id", instance_id);

      if (uErr) throw uErr;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Modo no soportado." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("POST /api/shifts/calendar/instances error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = getAdmin();
    const body = (await req.json()) as DeletePayload;

    if (!body?.id) {
      return NextResponse.json(
        { ok: false, error: "Falta id de la instancia." },
        { status: 400 }
      );
    }

    const id = body.id;

    // Primero las líneas asociadas (si las hay)
    const { error: lErr } = await sb
      .schema("liwa")
      .from("shift_instance_lines")
      .delete()
      .eq("shift_instance_id", id);

    if (lErr) throw lErr;

    // Luego la propia instancia
    const { error: iErr } = await sb
      .schema("liwa")
      .from("shift_instances")
      .delete()
      .eq("id", id);

    if (iErr) throw iErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/shifts/calendar/instances error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}
