// app/pending/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Row = {
  id: string;
  line_code: string | null;
  machine_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean | null;
};

type TaxRow = {
  lvl1: string;
  lvl2: string;
  lvl3_default: string | null;
  requires_lvl3: boolean | null;
};

const dtf = new Intl.DateTimeFormat("es-ES", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function hmsFromMin(min: number | null) {
  if (min == null || isNaN(min)) return "—";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export default function ClassifyPendingPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClientComponentClient();

  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);       // evento
  const [taxLoading, setTaxLoading] = useState(true); // taxonomía
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [taxErr, setTaxErr] = useState<string | null>(null);

  const [tax, setTax] = useState<TaxRow[]>([]); // catálogo

  // Form
  const [lvl1, setLvl1] = useState<string>("");
  const [lvl2, setLvl2] = useState<string>("");
  const [lvl3, setLvl3] = useState<string>("");

  // ===== Helpers =====
  function normalizeCatalog(rows: any[]): TaxRow[] {
    return (rows ?? [])
      .map((r: any) => {
        const L1 =
          r.lvl1 ?? r.nivel1 ?? r.nivel_1 ?? r.Nivel_1 ?? r.level1 ?? r.Level_1 ?? null;
        const L2 =
          r.lvl2 ?? r.nivel2 ?? r.nivel_2 ?? r.Nivel_2 ?? r.level2 ?? r.Level_2 ?? null;
        const L3D =
          r.lvl3_default ??
          r.nivel3_default ??
          r.default_lvl3 ??
          r.default_level3 ??
          r.Nivel_3_Default ??
          null;
        const REQ =
          r.requires_lvl3 ??
          r.requiere_lvl3 ??
          r.requiere_nivel3 ??
          r.Requiere_Nivel_3 ??
          null;

        return {
          lvl1: L1 ?? "",
          lvl2: L2 ?? "",
          lvl3_default: L3D ?? null,
          requires_lvl3:
            REQ === true || REQ === "true" || REQ === 1
              ? true
              : REQ === false || REQ === "false" || REQ === 0
              ? false
              : null,
        } as TaxRow;
      })
      .filter((t) => t.lvl1 && t.lvl2);
  }

  function minutesDiffISO(a?: string | null, b?: string | null): number | null {
    if (!a || !b) return null;
    const da = new Date(a);
    const db = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
    return Math.max(0, Math.round((db.getTime() - da.getTime()) / 60000));
  }

  // ===== Cargas =====
  useEffect(() => {
    let alive = true;

    // Evento (usar la MISMA tabla que alimenta /pending → events)
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (evErr) throw evErr;
        if (!ev) throw new Error("No se encontró el evento");

        if (!alive) return;

        const normalized: Row = {
          id: ev.id,
          line_code: ev.line_code ?? ev.line ?? ev.linea ?? null,
          machine_code: ev.machine_code ?? ev.machine ?? ev.maquina ?? null,
          started_at: ev.started_at ?? ev.start_time ?? null,
          ended_at: ev.ended_at ?? ev.end_time ?? null,
          duration_min:
            ev.duration_min ??
            minutesDiffISO(ev.started_at ?? ev.start_time, ev.ended_at ?? ev.end_time),
          lvl1: ev.lvl1 ?? ev.level1 ?? ev.Nivel_1 ?? null,
          lvl2: ev.lvl2 ?? ev.level2 ?? ev.Nivel_2 ?? null,
          lvl3: ev.lvl3 ?? ev.level3 ?? ev.Nivel_3 ?? null,
          classified:
            ev.classified ??
            ev.is_classified ??
            (ev.lvl1 || ev.lvl2 || ev.lvl3 ? true : null),
        };

        setRow(normalized);
        setLvl1(normalized.lvl1 ?? "");
        setLvl2(normalized.lvl2 ?? "");
        setLvl3(normalized.lvl3 ?? "");
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Error cargando el evento");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // Taxonomía
    (async () => {
      try {
        setTaxLoading(true);
        setTaxErr(null);

        // 1º intento: downtime_taxonomy (leer * y normalizar)
        let list: TaxRow[] = [];
        try {
          const { data: t1 } = await supabase.from("downtime_taxonomy").select("*");
          list = normalizeCatalog(t1 || []);
        } catch {
          // seguimos al fallback
        }

        // Fallback: catalog_motivo
        if (list.length === 0) {
          const { data: t2 } = await supabase.from("catalog_motivo").select("*");
          list = normalizeCatalog(t2 || []);
        }

        if (!alive) return;
        setTax(list);
      } catch (e: any) {
        if (!alive) return;
        setTaxErr(e?.message ?? "Error cargando taxonomía");
        setTax([]); // no bloqueamos UI
      } finally {
        if (alive) setTaxLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, supabase]);

  // ===== Opciones dependientes =====
  const lvl1Options = useMemo(() => {
    const s = new Set(tax.map((t) => t.lvl1).filter(Boolean));
    return Array.from(s).sort();
  }, [tax]);

  const lvl2Options = useMemo(() => {
    if (!lvl1) return [];
    const s = new Set(tax.filter((t) => t.lvl1 === lvl1).map((t) => t.lvl2).filter(Boolean));
    return Array.from(s).sort();
  }, [tax, lvl1]);

  const selectedRule = useMemo(() => {
    if (!lvl1 || !lvl2) return null;
    return tax.find((t) => t.lvl1 === lvl1 && t.lvl2 === lvl2) ?? null;
  }, [tax, lvl1, lvl2]);

  const mustLvl3 = Boolean(selectedRule?.requires_lvl3);

  // Reset dependencias
  useEffect(() => {
    setLvl2("");
    setLvl3("");
  }, [lvl1]);

  useEffect(() => {
    if (!lvl2) {
      setLvl3("");
      return;
    }
    if (selectedRule?.lvl3_default && !lvl3) {
      setLvl3(selectedRule.lvl3_default);
    }
  }, [lvl2, selectedRule, lvl3]);

  // Validación
  const canSave = useMemo(() => {
    if (!lvl1 && !lvl2 && !lvl3) return false;
    if (mustLvl3 && !lvl3.trim()) return false;
    return true;
  }, [lvl1, lvl2, lvl3, mustLvl3]);

  // Guardar (API existente)
  async function handleSave() {
    try {
      setSaving(true);
      setErr(null);

      const res = await fetch(`/api/events/${id}/classify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level1: lvl1 || null,
          level2: lvl2 || null,
          level3: lvl3 || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      router.push("/pending");
    } catch (e: any) {
      setErr(e?.message ?? "Error guardando la clasificación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 px-4 sm:px-6 py-3 bg-slate-950 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/pending")}
              className="rounded-xl bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 border border-slate-700"
              title="Volver a Pendientes"
            >
              ← Pendientes
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 border border-slate-700"
              title="Ir al Dashboard"
            >
              ⤴︎ Dashboard
            </button>
          </div>
          <div className="text-lg sm:text-xl font-semibold truncate">Clasificar paro</div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {(loading || taxLoading) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">Cargando…</div>
        )}

        {err && !(loading || taxLoading) && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
            {err}
          </div>
        )}

        {!loading && !taxLoading && taxErr && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
            {taxErr} — Los selectores usarán opciones vacías.
          </div>
        )}

        {!loading && !taxLoading && row && (
          <div className="space-y-6">
            {/* Ficha */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-lg bg-slate-800">
                    {row.line_code ?? "—"}
                  </span>
                  <span className="text-slate-400">{row.machine_code ?? "—"}</span>
                </div>
                <div className="text-sm text-slate-300">
                  Duración: <span className="font-medium">{hmsFromMin(row.duration_min)}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-300">
                <div>
                  <span className="text-slate-400">Inicio: </span>
                  {row.started_at ? dtf.format(new Date(row.started_at)) : "—"}
                </div>
                <div>
                  <span className="text-slate-400">Fin:&nbsp;&nbsp;&nbsp;</span>
                  {row.ended_at ? dtf.format(new Date(row.ended_at)) : "—"}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Nivel 1</label>
                  <select
                    value={lvl1}
                    onChange={(e) => setLvl1(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">— Selecciona —</option>
                    {lvl1Options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Nivel 2</label>
                  <select
                    value={lvl2}
                    onChange={(e) => setLvl2(e.target.value)}
                    disabled={!lvl1}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">
                      {lvl1 ? "— Selecciona —" : "Selecciona Nivel 1 primero"}
                    </option>
                    {lvl2Options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    Nivel 3 {mustLvl3 && <span className="text-amber-300">(requerido)</span>}
                  </label>
                  <input
                    value={lvl3}
                    onChange={(e) => setLvl3(e.target.value)}
                    placeholder={
                      mustLvl3 ? "Detalle técnico (requerido para este N2)" : "Detalle (opcional)"
                    }
                    disabled={!lvl2}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {selectedRule?.lvl3_default && (
                    <p className="mt-1 text-xs text-slate-400">Sugerido: {selectedRule.lvl3_default}</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end mt-2">
                  <button
                    onClick={() => router.push("/pending")}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={!canSave || saving}
                    onClick={handleSave}
                    className={`rounded-xl px-4 py-2 font-medium transition ${
                      !canSave || saving
                        ? "bg-emerald-700/40 text-emerald-200 cursor-not-allowed"
                        : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                    }`}
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>

                {!canSave && mustLvl3 && (
                  <p className="text-xs text-amber-300">
                    Este motivo requiere Nivel 3. Completa el campo para poder guardar.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}


