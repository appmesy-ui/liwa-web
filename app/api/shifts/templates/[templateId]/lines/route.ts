// app/api/shifts/templates/[templateId]/lines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LineRow = { id: string; plant_id: string | null; org_id: string | null };
type TemplateRow = { id: string; plant_id: string | null; org_id: string | null };

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY) en variables de entorno del servidor."
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

// Salud
export async function GET() {
  return NextResponse.json({
    ok: true,
    where: "/api/shifts/templates/[templateId]/lines",
  });
}

/**
 * POST /api/shifts/templates/:templateId/lines
 * Body: { lineIds: string[] }
 *
 * Flujo:
 * 1) Valida templateId de la URL y que la plantilla exista.
 * 2) Obtiene org_id y plant_id desde la plantilla.
 * 3) Si lineIds no está vacío:
 *      - Valida que todas las líneas existan.
 *      - Valida que todas pertenezcan a la misma org/planta que la plantilla.
 * 4) Llama a la RPC liwa.assign_lines_to_today_shift(org, plant, template, line_ids)
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { templateId: string } }
) {
  try {
    const { templateId } = ctx.params;

    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json(
        { ok: false, error: "templateId inválido en la URL." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const lineIds: string[] = Array.isArray(body?.lineIds) ? body.lineIds : [];

    const sb = admin();

    // 1) Leer plantilla y obtener org/planta base
    const { data: tpl, error: eTpl } = await sb
      .schema("liwa")
      .from("shift_templates")
      .select("id, org_id, plant_id")
      .eq("id", templateId)
      .eq("is_active", true)
      .single<TemplateRow>();

    if (eTpl) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo leer la plantilla indicada.",
          detail: eTpl.message ?? String(eTpl),
        },
        { status: 400 }
      );
    }

    if (!tpl) {
      return NextResponse.json(
        { ok: false, error: "No se encontró la plantilla indicada." },
        { status: 404 }
      );
    }

    const orgId = tpl.org_id;
    const plantId = tpl.plant_id;

    if (!orgId || !plantId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La plantilla no tiene org_id o plant_id definidos. Revisa la configuración en BD.",
        },
        { status: 400 }
      );
    }

    // 2) Si hay líneas seleccionadas, validarlas contra la plantilla
    if (lineIds.length > 0) {
      const { data: lines, error: eLines } = await sb
        .schema("liwa")
        .from("lines")
        .select("id, plant_id, org_id")
        .in("id", lineIds);

      if (eLines) throw eLines;

      if (!lines?.length) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se encontraron líneas con esos IDs.",
          },
          { status: 400 }
        );
      }

      const plants = new Set(lines.map((l: LineRow) => l.plant_id));
      const orgs = new Set(lines.map((l: LineRow) => l.org_id));

      if (plants.size !== 1 || orgs.size !== 1) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Todas las líneas deben pertenecer a la misma planta y organización.",
            debug: { plants: Array.from(plants), orgs: Array.from(orgs) },
          },
          { status: 400 }
        );
      }

      const linesPlantId = Array.from(plants)[0];
      const linesOrgId = Array.from(orgs)[0];

      if (linesOrgId !== orgId || linesPlantId !== plantId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "La plantilla y las líneas pertenecen a organizaciones o plantas distintas.",
            debug: {
              tpl_org_id: orgId,
              tpl_plant_id: plantId,
              lines_org_id: linesOrgId,
              lines_plant_id: linesPlantId,
            },
          },
          { status: 400 }
        );
      }
    }

    // 3) RPC: shift_instance de HOY + sincronizar líneas de la plantilla en esa planta
    const { data: rpc, error: eRpc } = await (sb as any)
      .schema("liwa")
      .rpc("assign_lines_to_today_shift", {
        p_org_id: orgId,
        p_plant_id: plantId,
        p_template_id: templateId,
        p_line_ids: lineIds,
      });

    if (eRpc) throw eRpc;

    return NextResponse.json({ ok: true, result: rpc, templateId });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.toLowerCase().includes("assign_lines_to_today_shift")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Error al ejecutar liwa.assign_lines_to_today_shift. Revisa que la firma sea (p_org_id uuid, p_plant_id uuid, p_template_id uuid, p_line_ids uuid[]).",
        },
        { status: 501 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
