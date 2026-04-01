// app/api/shifts/calendar/route.ts
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

type InstanceRow = {
  id: string;
  plant_id: string | null;
  template_id: string | null;
  shift_date: string; // YYYY-MM-DD
};

type TemplateRow = {
  id: string;
  code: string | null;
  name: string | null;
  starts_at: string | null; // HH:mm:ss
  ends_at: string | null;
};

type LineRow = {
  shift_instance_id: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const plantId = searchParams.get("plant_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!plantId || !from || !to) {
      return NextResponse.json(
        { ok: false, error: "plant_id, from y to son obligatorios." },
        { status: 400 }
      );
    }

    const sb = getAdmin();

    // 1) Instancias de turno de la planta en el rango
    const { data: instRows, error: e1 } = await sb
      .schema("liwa")
      .from("shift_instances")
      .select("id, plant_id, template_id, shift_date")
      .eq("plant_id", plantId)
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date", { ascending: true });

    if (e1) throw e1;

    const instances = (instRows ?? []) as InstanceRow[];

    // Si no hay, devolvemos sólo los días vacíos
    if (instances.length === 0) {
      return NextResponse.json({
        ok: true,
        days: buildEmptyDays(from, to),
      });
    }

    // 2) Plantillas necesarias para esas instancias
    const templateIds = Array.from(
      new Set(
        instances
          .map((r) => r.template_id)
          .filter((x): x is string => typeof x === "string")
      )
    );

    const templateMap = new Map<string, TemplateRow>();

    if (templateIds.length) {
      const { data: tplRows, error: e2 } = await sb
        .schema("liwa")
        .from("shift_templates")
        .select("id, code, name, starts_at, ends_at")
        .in("id", templateIds);

      if (e2) throw e2;

      for (const t of tplRows ?? []) {
        templateMap.set(t.id as string, {
          id: t.id as string,
          code: (t.code ?? null) as string | null,
          name: (t.name ?? null) as string | null,
          starts_at: (t.starts_at ?? null) as string | null,
          ends_at: (t.ends_at ?? null) as string | null,
        });
      }
    }

    // 3) Nº de líneas por instancia
    const instanceIds = instances.map((r) => r.id);

    const { data: lineRows, error: e3 } = await sb
      .schema("liwa")
      .from("shift_instance_lines")
      .select("shift_instance_id")
      .in("shift_instance_id", instanceIds);

    if (e3) throw e3;

    const lineCount = new Map<string, number>();
    for (const row of (lineRows ?? []) as LineRow[]) {
      const id = row.shift_instance_id;
      lineCount.set(id, (lineCount.get(id) ?? 0) + 1);
    }

    // 4) Agrupar por día en el formato que espera el FE
    type CalendarInstance = {
      id: string;
      template_id: string | null;
      template_code: string | null;
      template_name: string | null;
      starts_at: string; // YYYY-MM-DDTHH:mm:ss
      ends_at: string;
      line_count: number;
    };

    const byDate = new Map<string, CalendarInstance[]>();

    for (const inst of instances) {
      const date = inst.shift_date.slice(0, 10); // "YYYY-MM-DD"
      const tpl = inst.template_id ? templateMap.get(inst.template_id) : null;

      const startTime = (tpl?.starts_at ?? "00:00:00").slice(0, 8);
      const endTime = (tpl?.ends_at ?? "00:00:00").slice(0, 8);

      const calInst: CalendarInstance = {
        id: inst.id,
        template_id: inst.template_id,
        template_code: tpl?.code ?? null,
        template_name: tpl?.name ?? null,
        starts_at: `${date}T${startTime}`,
        ends_at: `${date}T${endTime}`,
        line_count: lineCount.get(inst.id) ?? 0,
      };

      const list = byDate.get(date);
      if (list) list.push(calInst);
      else byDate.set(date, [calInst]);
    }

    const days = buildEmptyDays(from, to).map((d) => ({
      ...d,
      instances: (byDate.get(d.date) ?? []).sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at)
      ),
    }));

    return NextResponse.json({ ok: true, days });
  } catch (err: any) {
    console.error("GET /api/shifts/calendar error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}

// Construye la lista de días del rango [from, to]
function buildEmptyDays(from: string, to: string) {
  const days: { date: string; instances: any[] }[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");

  for (
    let d = start;
    d.getTime() <= end.getTime();
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, instances: [] });
  }
  return days;
}
