// app/api/org-members/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// PATCH /api/org-members/:userId
// body: { role?: string, status?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // validar sesión
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();
  if (sessionError || !user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = params.userId;
  const body = await req.json();
  const role = body?.role;
  const status = body?.status;

  if (!role && !status) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const update: any = {};
  if (role) update.role = role;
  if (status) update.status = status;

  // la RLS se asegura que solo admins de la org puedan cambiar
  const { data, error } = await supabase
    .schema("liwa")
    .from("org_members")
    .update(update)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, member: data });
}
