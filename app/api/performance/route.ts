// app/api/performance/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Estructuras que espera el frontend en /dashboard/performance/[line] */
type SpeedSegment = {
  id: string;
  started_at: string;        // ISO
  ended_at: string;          // ISO
  duration_s: number;
  ideal_rate_u_min: number;
  actual_rate_u_min: number;
  sku?: string | null;
  notes?: string | null;
};

type PerfDetail = {
  line_code: string;
  performance?: number | null; // 0–1
  planned_s?: number | null;
  runtime_s?: number | null;
  speed_segments?: SpeedSegment[];
};

type LineRow = { id: string; name: string | null; code: string | null };

/** Pequeño helper para asegurar que P está entre 0 y 1 */
function clamp01(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  const v = Number(n);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-perf-detail" } },
      db: { schema: "liwa" },
    });

    // ====== Parámetros ======
    const { searchParams } = new URL(req.url);
    const lineParam = (searchParams.get("line") || "").trim();
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO =
      searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const orgId = searchParams.get("org_id");
    const plantId = searchParams.get("plant_id");
    const segLimit = Math.min(500, Math.max(50, Number(searchParams.get("limit") || 200)));

    if (!lineParam) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro 'line' (código/nombre de línea)" },
        { status: 400 }
      );
    }

    // Estructura base que vamos a ir rellenando
    const detail: PerfDetail = {
      line_code: lineParam,
      performance: null,
      planned_s: null,
      runtime_s: null,
      speed_segments: [],
    };

    // ====== 1) Leer KPIs desde /api/kpis para asegurar coherencia ======
    try {
      const proto =
        req.headers.get("x-forwarded-proto") ||
        (process.env.NODE_ENV === "production" ? "https" : "http");
      const host = req.headers.get("host");

      if (host) {
        const baseUrl = `${proto}://${host}`;
        const kpiUrl = new URL("/api/kpis", baseUrl);

        // Pasamos los mismos filtros que nos llegan
        if (fromISO) kpiUrl.searchParams.set("from", fromISO);
        if (toISO) kpiUrl.searchParams.set("to", toISO);
        if (orgId) kpiUrl.searchParams.set("org_id", orgId);
        if (plantId) kpiUrl.searchParams.set("plant_id", plantId);
        if (lineParam) kpiUrl.searchParams.set("line", lineParam);

        const kpiResp = await fetch(kpiUrl.toString(), { cache: "no-store" });
        if (kpiResp.ok) {
          const kpiJson: any = await kpiResp.json();
          const rows: any[] = kpiJson?.rows || kpiJson?.data?.rows || [];

          if (rows.length > 0) {
            // Si hay varias filas, intentamos casar por line_code
            let row = rows[0];
            if (rows.length > 1 && lineParam) {
              row =
                rows.find(
                  (r) =>
                    (r.line_code || "").toLowerCase() === lineParam.toLowerCase()
                ) || row;
            }

            const perfRaw = Number(row.performance ?? 0);
            const planned =
              row.planned_runtime_sec ??
              row.planned_time_s ??
              null;
            const avail =
              typeof row.availability === "number"
                ? Number(row.availability)
                : null;

            detail.performance = clamp01(perfRaw);
            detail.planned_s = planned != null ? Number(planned) : null;

            // Runtime coherente con KPI: disponibilidad × tiempo planificado
            if (planned != null && avail != null) {
              detail.runtime_s = Number(planned) * clamp01(avail);
            }

            if (row.line_code && !detail.line_code) {
              detail.line_code = row.line_code;
            }
          }
        } else {
          console.warn(
            "API /performance: fallo al llamar a /api/kpis",
            kpiResp.status
          );
        }
      }
    } catch (e) {
      console.warn("API /performance: error leyendo /api/kpis", e);
      // Seguimos igual, solo sin KPIs (detail mantiene nulls)
    }

    // ====== 2) Resolver line_id por nombre/código para los segmentos ======
    async function resolveLine() {
      const needle = lineParam;

      // 1) nombre exacto (case-insensitive)
      let { data, error } = (await admin
        .from("lines")
        .select("id,name,code")
        .ilike("name", needle)
        .limit(1)) as unknown as { data: LineRow[] | null; error: any };
      if (error) throw error;

      // 2) contiene en nombre
      if (!data?.[0]) {
        const { data: d2, error: e2 } = (await admin
          .from("lines")
          .select("id,name,code")
          .ilike("name", `%${needle}%`)
          .limit(1)) as unknown as { data: LineRow[] | null; error: any };
        if (e2) throw e2;
        data = d2;
      }

      // 3) por código
      if (!data?.[0]) {
        const { data: d3, error: e3 } = (await admin
          .from("lines")
          .select("id,name,code")
          .ilike("code", needle)
          .limit(1)) as unknown as { data: LineRow[] | null; error: any };
        if (e3) throw e3;
        data = d3;
      }

      const line = data?.[0];
      return line
        ? ({
            id: line.id,
            label: (line.name || line.code || needle) as string,
            code: line.code || null,
          } as { id: string; label: string; code: string | null })
        : null;
    }

    const line = await resolveLine();

    // Ajustamos el label si conocemos el nombre real de la línea
    if (line) {
      detail.line_code = line.label;
    }

    // Si no resolvimos la línea, devolvemos igual los KPIs (sin segmentos)
    if (!line) {
      return NextResponse.json({ ok: true, data: detail });
    }

    // ====== 3) Intentar traer segmentos reales (vista o tabla) ======
    async function tryFetchSegments(viewOrTable: string) {
      try {
        const sel =
          "id, line_id, started_at, ended_at, duration_s, ideal_rate_u_min, actual_rate_u_min, sku, notes";
        let q = admin
          .from(viewOrTable)
          .select(sel)
          .eq("line_id", line.id)
          .lt("started_at", toISO)
          .gte("ended_at", fromISO)
          .order("started_at", { ascending: false })
          .limit(segLimit);

        if (orgId) q = (q as any).eq("org_id", orgId);
        if (plantId) q = (q as any).eq("plant_id", plantId);

        const { data, error } = await q;
        if (error) throw error;

        const mapped: SpeedSegment[] = (data || []).map((s: any) => ({
          id: String(s.id),
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_s: Number(
            s.duration_s ??
              Math.max(
                0,
                (new Date(s.ended_at).getTime() -
                  new Date(s.started_at).getTime()) /
                  1000
              )
          ),
          ideal_rate_u_min: Number(s.ideal_rate_u_min ?? 0),
          actual_rate_u_min: Number(s.actual_rate_u_min ?? 0),
          sku: s.sku ?? null,
          notes: s.notes ?? null,
        }));
        return mapped;
      } catch (err) {
        console.warn(
          `API /performance: fallo al leer ${viewOrTable}`,
          (err as any)?.message || err
        );
        return null; // la vista/tabla puede no existir
      }
    }

    let segments: SpeedSegment[] | null = await tryFetchSegments("v_speed_segments");
    if (!segments) segments = await tryFetchSegments("speed_segments");
    if (!segments) segments = [];

    detail.speed_segments = segments;

    return NextResponse.json({ ok: true, data: detail });
  } catch (err: any) {
    console.error("API /performance error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

