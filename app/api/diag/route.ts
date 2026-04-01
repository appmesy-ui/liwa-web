// app/api/diag/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Diagnóstico robusto sin consultar information_schema:
 * - Intenta contar directamente en cada tabla candidata (plural/singular).
 * - Si la tabla no existe, el error de PostgREST la marca como "no_table".
 * - Usa SERVICE ROLE (server-side) para saltar RLS.
 */

type CountRes = {
  table: string | null;
  ok: boolean;
  count: number | null;
  error: string | null;
};

export async function GET(_req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
      },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "liwa-diag" } },
  });

  // Candidatas según tu esquema real (mezcla singular/plural)
  const candidates: Record<
    string,
    string[]
  > = {
    orgs: ["orgs"],
    lines: ["lines", "line"],
    machines: ["machines", "machine"],
    shifts: ["shifts", "shift"],
    production: ["production"],
    events: ["events", "stop_event"],
    taxonomy: ["downtime_taxonomy", "catalog_motivo"],
    plants: ["plants", "plant"],
  };

  async function tryCount(table: string): Promise<CountRes> {
    try {
      const { count, error } = await admin
        .from(table as any)
        .select("*", { head: true, count: "exact" });
      if (error) {
        // Si la tabla no existe, PostgREST devuelve un error tipo "relation ... does not exist"
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("does not exist") ||
          msg.includes("not found") ||
          msg.includes("no relation") ||
          msg.includes("relation")
        ) {
          return { table, ok: false, count: null, error: "no_table" };
        }
        return { table, ok: false, count: null, error: error.message };
      }
      // count puede venir null en head; algunos backends lo exponen en 'count'
      return { table, ok: true, count: count ?? 0, error: null };
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (msg.toLowerCase().includes("does not exist")) {
        return { table, ok: false, count: null, error: "no_table" };
      }
      return { table, ok: false, count: null, error: msg };
    }
  }

  async function autoPick(key: keyof typeof candidates): Promise<CountRes> {
    for (const t of candidates[key]) {
      const r = await tryCount(t);
      if (r.ok) return r;               // encontrada y contamos
      if (r.error !== "no_table") return r; // otro error -> devolver
      // si no_table, probamos la siguiente candidata
    }
    return { table: null, ok: false, count: null, error: "no_table" };
  }

  const [orgs, lines, machines, shifts, production, events, taxonomy, plants] =
    await Promise.all([
      autoPick("orgs"),
      autoPick("lines"),
      autoPick("machines"),
      autoPick("shifts"),
      autoPick("production"),
      autoPick("events"),
      autoPick("taxonomy"),
      autoPick("plants"),
    ]);

  // Muestras de líneas (si logramos identificar una tabla válida)
  let sampleLines: Array<{ id: string; code?: string | null; name?: string | null }> = [];
  if (lines.table) {
    const { data } = await admin.from(lines.table as any).select("id, code, name").limit(5);
    sampleLines = (data as any[]) ?? [];
  }

  const n = (x: CountRes) => (typeof x.count === "number" ? x.count : 0);
  const hasCoreData =
    (orgs.table ? n(orgs) : 1) >= 1 &&      // algunos modelos no usan orgs todavía
    (lines.table ? n(lines) : 0) >= 1 &&
    (machines.table ? n(machines) : 0) >= 1;

  let suggestion = "";
  if (!lines.table || !machines.table) {
    suggestion =
      "Tu esquema mezcla singular/plural. Estándar sugerido: lines/machines/shifts/events/production. Podemos adaptarnos a tus tablas actuales.";
  } else if (!hasCoreData) {
    suggestion =
      "Hay tablas pero faltan filas base (líneas y/o máquinas). Te siembro catálogo y datos simulados si quieres.";
  } else if (n(production) === 0 && n(events) === 0) {
    suggestion = "Sin producción ni eventos. Puedo simular últimas 24–48h ahora mismo.";
  } else {
    suggestion = "Con estos datos ya podemos pintar KPIs y ajustar la UI móvil.";
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    counts: { orgs, lines, machines, shifts, production, events, taxonomy, plants },
    sampleLines,
    summary: {
      model_detected: {
        line_table: lines.table,
        machine_table: machines.table,
        shift_table: shifts.table,
        event_table: events.table,
      },
      hasCoreData,
      suggestion,
    },
  });
}
