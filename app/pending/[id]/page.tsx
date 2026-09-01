// app/pending/[id]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Tipos de la API
type TaxTree = { id: string; name: string; requires_detail: boolean | null; children: TaxTree[] };
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
  line_name?: string | null;
  machine_name?: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [tree, setTree] = useState<TaxTree[]>([]);
  const [notes, setNotes] = useState("");

  // Selecciones SIEMPRE empiezan vacías:
  const [selL1, setSelL1] = useState<string>("");
  const [selL2, setSelL2] = useState<string>("");
  const [selL3, setSelL3] = useState<string>("");

  // --- Cargar datos (sin preseleccionar taxonomy_node_id) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/${params.id}/classify`, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok || j?.ok === false) throw new Error(j?.error ?? `HTTP ${res.status}`);
        if (!alive) return;

        setEvent(j.event as EventRow);
        setTree((j.taxonomy_tree ?? []) as TaxTree[]);
        setNotes((j.event?.notes ?? "") as string);

        // Limpieza explícita por si venimos de otra pantalla con estado en memoria
        setSelL1("");
        setSelL2("");
        setSelL3("");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.id]);

  // --- Cascada con dedupe en L1 ---
  const l1Raw = useMemo(() => tree.filter((n) => (n.children?.length ?? 0) > 0), [tree]);

  // id->nodo
  const idMap = useMemo(() => {
    const m = new Map<string, TaxTree>();
    const walk = (n: TaxTree) => {
      m.set(n.id, n);
      for (const c of n.children) walk(c);
    };
    for (const r of tree) walk(r);
    return m;
  }, [tree]);

  // L1 único por nombre
  const l1Options = useMemo(() => {
    const seen = new Set<string>();
    const out: TaxTree[] = [];
    for (const n of l1Raw) {
      const k = norm(n.name);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
    return out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [l1Raw]);

  // Resolver duplicado seleccionado
  const l1SelectedNode = useMemo(() => {
    const direct = l1Options.find((n) => n.id === selL1);
    if (direct) return direct;
    const original = idMap.get(selL1);
    if (!original) return null;
    const byName = l1Options.find((n) => norm(n.name) === norm(original.name));
    return byName ?? null;
  }, [l1Options, selL1, idMap]);

  const l2Options = useMemo(() => l1SelectedNode?.children ?? [], [l1SelectedNode]);
  const l2SelectedNode = useMemo(() => l2Options.find((n) => n.id === selL2) ?? null, [l2Options, selL2]);
  const l3Options = useMemo(() => l2SelectedNode?.children ?? [], [l2SelectedNode]);

  // Limpiar inferiores al cambiar selección
  useEffect(() => {
    setSelL2("");
    setSelL3("");
  }, [selL1]);
  useEffect(() => {
    setSelL3("");
  }, [selL2]);

  const selectedLeafId = selL3 || selL2 || selL1 || "";
  const selectedLeafRequiresDetail =
    (l3Options.find((n) => n.id === selL3)?.requires_detail ??
      l2Options.find((n) => n.id === selL2)?.requires_detail ??
      l1Options.find((n) => n.id === selL1)?.requires_detail) ?? false;

  // --- Guardar ---
  async function save() {
    if (!event) return;
    if (!selectedLeafId) {
      alert("Selecciona un motivo (L1/L2/L3).");
      return;
    }
    if (selectedLeafRequiresDetail && !notes.trim()) {
      const ok = confirm("Este motivo requiere detalle. ¿Guardar sin notas?");
      if (!ok) return;
    }

    startSaving(async () => {
      try {
        const res = await fetch(`/api/${event.id}/classify`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taxonomy_node_id: selectedLeafId, notes }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok === false) throw new Error(j?.error ?? `HTTP ${res.status}`);
        router.push("/pending");
        router.refresh();
      } catch (e: any) {
        alert(e?.message ?? String(e));
      }
    });
  }

  // --- Modal UX: cerrar por Esc / click en backdrop ---
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/pending");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) router.push("/pending");
  };

  const clearAll = () => {
    setSelL1("");
    setSelL2("");
    setSelL3("");
  };

  // --- UI ---
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        onClick={onBackdropClick}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-100 transition-opacity"
      />

      {/* Bottom sheet (mobile) / Centered modal (md+) */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center"
      >
        <div
          className="
            w-full md:max-w-2xl
            bg-[#07101f]/95 border border-cyan-300/15 shadow-[0_30px_90px_-35px_rgba(6,182,212,.55)]
            rounded-t-2xl md:rounded-2xl overflow-hidden
          "
          style={{ maxHeight: "92vh" }}
          role="dialog"
          aria-modal="true"
        >
          {/* Header con gradiente */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-fuchsia-500/10" />
            <div className="relative px-4 py-3 md:px-5 md:py-4 flex items-center gap-2 border-b border-slate-800">
              <button
                onClick={() => router.push("/pending")}
                className="rounded-xl bg-slate-900/80 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 border border-slate-700"
                title="Cerrar"
              >
                ✕
              </button>
              <div className="text-base md:text-lg font-semibold">Clasificar paro</div>
              <div className="ml-auto hidden md:block">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200"
                  title="Dashboard"
                >
                  ↺ Dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Contenido scrollable */}
          <div className="px-4 md:px-5 py-4 md:py-5 overflow-y-auto">
            {loading && (
              <div className="grid gap-3 animate-pulse">
                <div className="h-5 w-40 bg-slate-800 rounded" />
                <div className="grid md:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-xl bg-slate-900 p-4">
                      <div className="h-3 w-20 bg-slate-800 rounded mb-2" />
                      <div className="h-5 w-32 bg-slate-800 rounded" />
                    </div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="rounded-xl bg-slate-900 p-4 h-20" />
                  ))}
                </div>
                <div className="rounded-xl bg-slate-900 p-4 h-40" />
              </div>
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-xl p-4">
                {error}
              </div>
            )}

            {!loading && !error && event && (
              <div className="space-y-6">
                {/* Datos del evento */}
                <div className="grid md:grid-cols-3 gap-3">
                  <StatCard label="Línea" value={event.line_name ?? "—"} />
                  <StatCard label="Máquina" value={event.machine_name ?? "—"} />
                  <StatCard
                    label="Duración"
                    value={
                      typeof event.duration_s === "number"
                        ? `${Math.max(0, Math.round(event.duration_s / 60))} min`
                        : "—"
                    }
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <StatCard label="Inicio" value={fmt(event.started_at)} />
                  <StatCard label="Fin" value={fmt(event.ended_at)} />
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Step active={true}>Nivel 1</Step>
                  <span className="w-8 h-px bg-slate-700" />
                  <Step active={!!selL1}>Nivel 2</Step>
                  <span className="w-8 h-px bg-slate-700" />
                  <Step active={!!selL2}>Nivel 3</Step>
                </div>

                {/* Cascada L1 → L2 → L3 */}
                <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-4">
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field label="Nivel 1">
                      <SelectModern value={selL1} onChange={setSelL1}>
                        <option value="">— Selecciona L1 —</option>
                        {l1Options.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                      </SelectModern>
                    </Field>

                    <Field label="Nivel 2">
                      <SelectModern
                        value={selL2}
                        onChange={setSelL2}
                        disabled={!l1SelectedNode}
                      >
                        <option value="">{l1SelectedNode ? "— Selecciona L2 —" : "Selecciona L1 primero"}</option>
                        {l2Options
                          .slice()
                          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </SelectModern>
                    </Field>

                   {/* L3 */}
<Field label="Nivel 3">
  <SelectModern
    value={selL3}
    onChange={setSelL3}
    disabled={!selL2} // deshabilitado hasta que haya L2
  >
    <option value="">
      {selL2 ? "— Selecciona L3 —" : "Selecciona L2 primero"}
    </option>
    {l3Options
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((n) => (
        <option key={n.id} value={n.id}>
          {n.name}
        </option>
      ))}
  </SelectModern>
</Field>
                  </div>

                  {/* Hint: requiere detalle */}
                  {selectedLeafRequiresDetail && (
                    <div className="text-xs text-amber-300">
                      Este motivo sugiere añadir detalle.
                    </div>
                  )}

                  {/* Notas */}
                  <Field label="Notas">
                    <textarea
                      className="w-full min-h-[96px] rounded-xl bg-slate-900 text-slate-100 p-3 outline-none border border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Detalle opcional…"
                    />
                  </Field>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearAll}
                      type="button"
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    >
                      Limpiar selección
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky action bar */}
          <div className="px-4 md:px-5 py-3 border-t border-slate-800 bg-slate-950/95 flex items-center gap-2">
            <button
              onClick={() => router.push("/pending")}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              Cancelar
            </button>
            <div className="ml-auto" />
            <button
              onClick={save}
              disabled={isSaving || !selectedLeafId || !!error || loading}
              className="liwa-primary"
            >
              {isSaving ? "Guardando…" : "Guardar clasificación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- UI helpers ---------- */

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-slate-300 text-sm">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-slate-100">{value}</div>
    </div>
  );
}

function Step({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${
          active ? "bg-cyan-400 text-slate-950" : "bg-slate-700 text-slate-300"
        }`}
      >
        {active ? "✓" : "•"}
      </span>
      <span className={active ? "text-slate-200" : "text-slate-400"}>{children}</span>
    </div>
  );
}

// Select con borde “glass/gradient” sutil
function SelectModern({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl p-[1px] bg-gradient-to-r from-emerald-600/40 via-cyan-600/40 to-fuchsia-600/40 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-[11px] bg-slate-950 text-slate-100 p-3 outline-none border border-slate-700
                   focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
      >
        {children}
      </select>
    </div>
  );
}
