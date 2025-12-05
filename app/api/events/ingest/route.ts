// app/api/events/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "liwa" },
  });
}

type IngestEvent = {
  org_id?: string | null;
  plant_id?: string | null;
  line_id?: string | null;
  machine_id?: string | null;
  shift_instance_id?: string | null;
  started_at: string;           // ISO string
  ended_at?: string | null;     // ISO string o null (si quieres evento “abierto”)
  is_planned?: boolean;         // por defecto: false (no planificado)
  notes?: string | null;
};

function ensureArray(body: any): IngestEvent[] {
  if (Array.isArray(body)) return body as IngestEvent[];
  return [body as IngestEvent];
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdmin();
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Body JSON requerido" },
        { status: 400 }
      );
    }

    const events = ensureArray(body);

    if (events.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Lista de eventos vacía" },
        { status: 400 }
      );
    }

    const toInsert = events.map((e, idx) => {
      if (!e.started_at) {
        throw new Error(`Evento #${idx}: started_at es obligatorio`);
      }

      // Validaciones mínimas
      const started = new Date(e.started_at);
      if (isNaN(started.getTime())) {
        throw new Error(`Evento #${idx}: started_at no es una fecha válida`);
      }

      let ended: string | null = null;
      if (e.ended_at != null) {
        const endDate = new Date(e.ended_at);
        if (isNaN(endDate.getTime())) {
          throw new Error(`Evento #${idx}: ended_at no es una fecha válida`);
        }
        ended = endDate.toISOString();
      }

      return {
        org_id: e.org_id ?? null,
        plant_id: e.plant_id ?? null,
        line_id: e.line_id ?? null,
        machine_id: e.machine_id ?? null,
        shift_instance_id: e.shift_instance_id ?? null,
        started_at: started.toISOString(),
        ended_at: ended,
        is_planned: e.is_planned ?? false,
        status: "pending",      // siempre empieza como pendiente
        source: "auto",         // 🔹 valor permitido por CHECK (auto/manual/api)
        taxonomy_node_id: null, // se clasifica luego en la UI
        notes: e.notes ?? null,
      };
    });

    const { data, error } = await admin
      .from("events")
      .insert(toInsert)
      .select("id, started_at, ended_at, status, source");

    if (error) {
      console.error("Error insertando eventos desde ingest:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        inserted: data ?? [],
        count: data?.length ?? 0,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error en /api/events/ingest:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error inesperado" },
      { status: 500 }
    );
  }
}
