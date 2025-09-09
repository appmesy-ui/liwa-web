// app/api/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const line  = searchParams.get("line");
    const from  = searchParams.get("from");
    const to    = searchParams.get("to");
    const limit = Number(searchParams.get("limit") ?? 20);

    const supabase = createRouteHandlerClient({ cookies });

    let query = supabase
      .from("v_pending_events")
      .select(
        "id,line_code,machine_code,started_at,ended_at,duration_min,duration_hms,lvl1,lvl2,lvl3,classified"
      )
      .order("started_at", { ascending: false })
      .limit(limit);

    if (line) query = query.eq("line_code", line);
    if (from) query = query.gte("started_at", from);
    if (to)   query = query.lte("ended_at", to);

    const { data, error, status } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: status || 500 });
    }

    return NextResponse.json({ items: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
