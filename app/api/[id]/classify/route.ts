// app/api/events/[id]/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const id = params.id;
  let body: any = {};
  try { body = await req.json(); } catch {}

  const lvl1 = (body?.level1 ?? "").trim() || null;
  const lvl2 = (body?.level2 ?? "").trim() || null;
  const lvl3 = (body?.level3 ?? "").trim() || null;

  // Reglas mínimas: al menos N1 o N2 para marcar como clasificado
  const classified = !!(lvl1 || lvl2 || lvl3);

  // Update con RLS (asumimos políticas ya protegen por organización)
  const { data, error } = await supabase
    .from("events")
    .update({
      lvl1, lvl2, lvl3,
      classified,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
