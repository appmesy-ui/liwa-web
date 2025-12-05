// app/api/[id]/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ===== Tipos =====
type EventRow = {
  id: string;
  line_id: string | null;
  machine_id: string | null;
  taxonomy_node_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  notes: string | null;
  classified_at: string | null;
};

type TaxFlat = {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  requires_detail: boolean | null;
};

type TaxTree = {
  id: string;
  name: string;
  requires_detail: boolean | null;
  children: TaxTree[];
};

// ===== Helper =====
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "liwa-classify" } },
    db: { schema: "liwa" },
  });
}

function buildTree(flat: TaxFlat[]): TaxTree[] {
  const byId = new Map<string, TaxTree>();
  const roots: TaxTree[] = [];

  for (const n of flat) {
    byId.set(n.id, {
      id: n.id,
      name: n.name,
      requires_detail: n.requires_detail ?? null,
      children: [],
    });
  }

  for (const n of flat) {
    const node = byId.get(n.id)!;
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ===== GET =====
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = getAdmin();
    const { id } = params;

    // 1) Evento
    const { data: ev, error: evErr } = await admin
      .from("events")
      .select(
        "id,line_id,machine_id,taxonomy_node_id,started_at,ended_at,duration_s,notes,classified_at"
      )
      .eq("id", id)
      .limit(1)
      .maybeSingle<EventRow>();

    if (evErr) {
      return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
    }
    if (!ev) {
      return NextResponse.json({ ok: false, error: "Evento no encontrado" }, { status: 404 });
    }

    // 2) Nombres de línea y máquina
    const [lineRes, machRes] = await Promise.all([
      ev.line_id
        ? admin
            .from("lines")
            .select("name")
            .eq("id", ev.line_id)
            .limit(1)
            .maybeSingle<{ name: string }>()
        : Promise.resolve({ data: null, error: null }),
      ev.machine_id
        ? admin
            .from("machines")
            .select("name")
            .eq("id", ev.machine_id)
            .limit(1)
            .maybeSingle<{ name: string }>()
        : Promise.resolve({ data: null, error: null }),
    ]);

    // 3) Taxonomía (plana + árbol)
    const { data: tax, error: taxErr } = await admin
      .from("taxonomy_nodes")
      .select("id,name,code,parent_id,requires_detail,is_active")
      .eq("is_active", true)
      .limit(5000);

    if (taxErr) {
      return NextResponse.json({ ok: false, error: taxErr.message }, { status: 500 });
    }

    const flat = (tax ?? []).map((t: any) => ({
      id: t.id as string,
      name: t.name as string,
      code: (t.code ?? null) as string | null,
      parent_id: (t.parent_id ?? null) as string | null,
      requires_detail: (t.requires_detail ?? null) as boolean | null,
    })) as TaxFlat[];

    const tree = buildTree(flat);

    return NextResponse.json({
      ok: true,
      event: {
        ...ev,
        line_name: lineRes?.data?.name ?? null,
        machine_name: machRes?.data?.name ?? null,
      },
      taxonomy_flat: flat,
      taxonomy_tree: tree,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

// ===== PATCH =====
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = getAdmin();
    const { id } = params;

    const body = await req.json().catch(() => ({}));

    const taxonomy_node_id_raw = body?.taxonomy_node_id;
    const notes_raw = body?.notes;

    const taxonomy_node_id =
      typeof taxonomy_node_id_raw === "string" && taxonomy_node_id_raw.trim() !== ""
        ? (taxonomy_node_id_raw as string)
        : null;

    const notes = typeof notes_raw === "string" ? (notes_raw as string) : null;

    // Necesitamos taxonomy_node_id para que tenga sentido la clasificación
    if (!taxonomy_node_id) {
      return NextResponse.json(
        { ok: false, error: "taxonomy_node_id requerido para clasificar el evento" },
        { status: 400 }
      );
    }

    const update: any = {
      taxonomy_node_id,
      status: "classified", // 🔹 Marcamos como clasificado
      classified_at: new Date().toISOString(), // 🔹 Fecha/hora de clasificación
    };

    if (notes !== null) {
      update.notes = notes; // permitimos cadena vacía, pero no undefined
    }

    const { data, error } = await admin
      .from("events")
      .update(update)
      .eq("id", id)
      .select("id, status, taxonomy_node_id, classified_at, notes")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Evento no encontrado al actualizar" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, event: data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
