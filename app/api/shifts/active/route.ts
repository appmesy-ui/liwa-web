// app/api/shifts/active/route.ts
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const plantId = searchParams.get("plant_id");

    if (!orgId || !plantId) {
      return NextResponse.json(
        { ok: false, error: "org_id y plant_id son obligatorios." },
        { status: 400 }
      );
    }

    const sb = getAdmin();
    const now = new Date().toISOString();

    const { data, error } = await sb
      .schema("liwa")
      .from("v_shift_instances_resolved")
      .select("shift_instance_id, template_name, starts_at, ends_at, shift_date")
      .eq("org_id", orgId)
      .eq("plant_id", plantId)
      .not("starts_at", "is", null)
      .lte("starts_at", now)
      .gte("ends_at", now)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      return NextResponse.json({ ok: true, shift: null });
    }

    return NextResponse.json({
      ok: true,
      shift: {
        shift_instance_id: data.shift_instance_id,
        template_name: data.template_name,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        shift_date: data.shift_date,
      },
    });
  } catch (err: any) {
    console.error("GET /api/shifts/active error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}