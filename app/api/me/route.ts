// app/api/me/route.ts
// GET /api/me  → usuario, organizaciones y rol

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const user = sessionData.session.user;

  const { data, error } = await supabase
    .from("org_members")
    .select("role, orgs:org_id ( id, name )")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    orgs: (data || []).map((r: any) => ({
      id: r.orgs?.id,
      name: r.orgs?.name,
      role: r.role,
    })),
  });
}
