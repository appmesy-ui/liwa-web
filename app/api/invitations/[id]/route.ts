// app/api/invitations/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Devuelve datos mínimos de la invitación para mostrar el "preview".
 * No exige sesión; RLS debe permitir leer por id o devolverá 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // invitación
  const { data: inv, error } = await (supabase as any)
    .schema("liwa")
    .from("invitations")
    .select("id, org_id, email, role, status, created_at, accepted_at, expires_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!inv) {
    return NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });
  }

  // nombre de org (opcional)
  let org_name: string | null = null;
  const { data: org } = await (supabase as any)
    .schema("liwa")
    .from("orgs")
    .select("name")
    .eq("id", inv.org_id)
    .maybeSingle();
  org_name = org?.name ?? null;

  return NextResponse.json({ data: { ...inv, org_name } });
}
