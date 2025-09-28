// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  // OJO: createRouteHandlerClient no admite "options"
  const supabase = createRouteHandlerClient({ cookies });

  const { data: sessionData, error: sErr } = await supabase.auth.getSession();
  if (sErr) {
    return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  }
  if (!sessionData?.session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const user = sessionData.session.user;

  const { data: memberships, error: mErr } = await supabase
    .schema("liwa")
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id);

  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });
  }

  let orgs: Array<{ id: string; name: string | null; role: string | null }> = [];
  if ((memberships?.length ?? 0) > 0) {
    const orgIds = memberships!.map((m) => m.org_id).filter(Boolean) as string[];

    const { data: orgRows, error: oErr } = await supabase
      .schema("liwa")
      .from("orgs")
      .select("id, name")
      .in("id", orgIds);

    if (oErr) {
      return NextResponse.json({ ok: false, error: oErr.message }, { status: 400 });
    }

    const nameById = new Map((orgRows ?? []).map((o) => [o.id, o.name]));
    orgs = memberships!.map((m: any) => ({
      id: m.org_id as string,
      name: nameById.get(m.org_id as string) ?? null,
      role: m.role ?? null,
    }));
  }

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    orgs,
  });
}
