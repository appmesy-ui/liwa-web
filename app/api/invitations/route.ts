// app/api/invitations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function resolveOrgIdByUserId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .schema("liwa")
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.org_id ?? null;
}

// GET /api/invitations
export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    return NextResponse.json({ error: "No autorizado (sin sesión)" }, { status: 401 });
  }

  const orgId = await resolveOrgIdByUserId(supabase, user.id);
  if (!orgId) {
    return NextResponse.json(
      { error: "Organización no encontrada para el usuario actual." },
      { status: 403 }
    );
  }

  const [{ data: invitations, error: iErr }, { data: members, error: mErr }] =
    await Promise.all([
      supabase
        .schema("liwa")
        .from("invitations")
        .select("id, org_id, email, role, status, invited_by, created_at, accepted_at, expires_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .schema("liwa")
        .from("org_members")
        .select("user_id, org_id, email, role, status, joined_at")
        .eq("org_id", orgId)
        .order("joined_at", { ascending: false }),
    ]);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });

  return NextResponse.json({
    invitations: invitations ?? [],
    members: members ?? [],
  });
}

// POST /api/invitations  (crea con expiración 48h)
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    return NextResponse.json({ error: "No autorizado (sin sesión)" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, role } = body as { email?: string; role?: string };

  if (!email || !role) {
    return NextResponse.json({ error: "Email y rol son obligatorios." }, { status: 400 });
  }

  const orgId = await resolveOrgIdByUserId(supabase, user.id);
  if (!orgId) {
    return NextResponse.json(
      { error: "Organización no encontrada para el usuario actual." },
      { status: 403 }
    );
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .schema("liwa")
    .from("invitations")
    .insert({
      org_id: orgId,
      email,
      role,
      status: "pending",
      invited_by: user.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // TODO: enviar email con `${process.env.NEXT_PUBLIC_APP_URL}/invite/${data.id}`

  return NextResponse.json({ ok: true, invitation: data });
}
