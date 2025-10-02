// app/api/invitations/[id]/accept/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // sesión obligatoria
  const { data: sess } = await supabase.auth.getSession();
  const user = sess?.session?.user || null;
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    }

  // obtener invitación
  const { data: inv, error: e1 } = await (supabase as any)
    .schema("liwa")
    .from("invitations")
    .select("id, org_id, email, role, status, expires_at")
    .eq("id", params.id)
    .maybeSingle();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
  if (!inv) return NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });

  // validaciones de estado
  if (inv.status !== "pending") {
    return NextResponse.json({ error: `Invitación en estado ${inv.status}.` }, { status: 409 });
  }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "La invitación expiró." }, { status: 410 });
  }

  // validar email
  if (user.email.toLowerCase() !== String(inv.email).toLowerCase()) {
    return NextResponse.json(
      { error: "El email de la sesión no coincide con el destinatario de la invitación." },
      { status: 403 }
    );
  }

  // upsert en org_members
  const { error: e2 } = await (supabase as any)
    .schema("liwa")
    .from("org_members")
    .upsert(
      { org_id: inv.org_id, user_id: user.id, email: user.email, role: inv.role, status: "active" },
      { onConflict: "org_id,user_id" }
    );
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  // marcar invitación como aceptada
  const { error: e3 } = await (supabase as any)
    .schema("liwa")
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  if (e3) return NextResponse.json({ error: e3.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

