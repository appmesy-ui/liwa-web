// app/api/invitations/[id]/resend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// POST /api/invitations/:id/resend
// Efecto: pone status='pending', refresca created_at=now() y renueva expires_at=+48h
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Nueva fecha de expiración (+48h desde ahora)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // Solo admin/superuser de la org (RLS ya lo asegura)
  const { data, error } = await supabase
    .schema("liwa")
    .from("invitations")
    .update({
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .eq("id", params.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invitation: data });
}
