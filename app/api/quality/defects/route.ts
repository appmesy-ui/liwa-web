// app/api/quality/defects/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mock de defectos por línea para la vista /dashboard/quality/[line]?tab=defectos
 * Parámetros:
 *  - line: string (obligatorio)
 *  - from, to: ISO (opcionales – no se usan en el mock pero se aceptan)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const line = (searchParams.get("line") || "").toUpperCase();
    // Podrías usar from / to si quisieras variar los datos:
    // const from = searchParams.get("from");
    // const to = searchParams.get("to");

    if (!line) {
      return NextResponse.json(
        { ok: false, error: "missing 'line' parameter" },
        { status: 400 }
      );
    }

    // ====== MOCK ======
    // Total de unidades en el rango
    // (ajústalo a tu volumen real si quieres aproximarlo)
    const units_total = 25000;

    // Defectos por código (ejemplo)
    // total = units_scrap + units_rework (si no se informa units_defective)
    const base: Array<{
      defect_code: string;
      defect_name: string;
      category?: string;
      units_scrap?: number;
      units_rework?: number;
      station?: string;
      shift?: "Mañana" | "Tarde" | "Noche";
    }> = [
      { defect_code: "BURR", defect_name: "Rebaba", category: "Mecánico", units_scrap: 140, units_rework: 60, station: "S2", shift: "Mañana" },
      { defect_code: "SURF", defect_name: "Rayado superficial", category: "Acabado", units_scrap: 80, units_rework: 90, station: "S1", shift: "Tarde" },
      { defect_code: "DIMN", defect_name: "Fuera de dimensión", category: "Metrología", units_scrap: 60, units_rework: 25, station: "C3", shift: "Noche" },
      { defect_code: "PAIN", defect_name: "Pintura incompleta", category: "Pintura", units_scrap: 30, units_rework: 70, station: "P1", shift: "Mañana" },
      { defect_code: "CONT", defect_name: "Contaminación", category: "Calidad materia prima", units_scrap: 15, units_rework: 10, station: "S4", shift: "Tarde" },
    ];

    // Pequeña variación por línea para que no todas muestren lo mismo
    const hash = Array.from(line).reduce((a, c) => a + c.charCodeAt(0), 0);
    const jitter = (n: number, factor = 0.15) =>
      Math.max(0, Math.round(n * (1 + (((hash % 7) - 3) / 3) * factor)));

    const rows = base.map(d => {
      const scrap = jitter(d.units_scrap ?? 0);
      const rework = jitter(d.units_rework ?? 0);
      const totalDef = scrap + rework;
      const last = new Date(Date.now() - ((hash % 5) + 1) * 60 * 60 * 1000); // últimas 1–5 h

      return {
        defect_code: d.defect_code,
        defect_name: d.defect_name,
        category: d.category,
        units_defective: totalDef,
        units_scrap: scrap,
        units_rework: rework,
        station: d.station,
        shift: d.shift,
        last_seen_at: last.toISOString(),
      };
    });

    return NextResponse.json(
      { ok: true, rows, meta: { units_total } },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
