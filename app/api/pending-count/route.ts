// app/api/pending-count/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cuenta paros sin clasificar en `events` (classified = false).
 * Fallback de rango: 24h → 7d → 30d (aunque se pasen from/to).
 */
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "liwa-pending" } },
  });

  const { searchParams } = new URL(req.url);
  const toISO = searchParams.get("to") ?? new Date().toISOString();
  const fromParam = searchParams.get("from");

  async function tryCount(fromISO: string | null) {
    let q = admin.from("events").select("*", { head: true, count: "exact" }).eq("classified", false).lte("started_at", toISO);
    if (fromISO) q = q.gte("started_at", fromISO);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const ranges: (string | null)[] = [];
  if (fromParam) ranges.push(fromParam);
  ranges.push(
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  );

  let count = 0;
  for (const r of ranges) {
    try {
      count = await tryCount(r);
      if (count > 0) break;
    } catch (e) {
      // si falla, intenta siguiente rango
    }
  }

  return NextResponse.json({ ok: true, count });
}
