// app/pending/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "../../components/AppHeader";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ===== Tipos ===== */
type PendingRow = {
  id: string;
  org_id: string | null;
  line_code: string | null;
  machine_id: string | null;
  start_ts: string;
  end_ts: string | null;
  duration_sec: number | null;
  level1: string | null;
  level2: string | null;
  level3: string | null;
  requires_level_3: boolean;
  status: string;
};

type PendingResp = { ok: boolean; rows: PendingRow[]; count: number; range: any; error?: string };
type LinesResp = { ok: boolean; rows: { id: string; code: string; name: string }[]; error?: string };
type TaxResp = {
  ok: boolean;
  map: Record<string, Record<string, string[]>>;
  level1: string[];
  level2: string[];
  level3: string[];
  error?: string;
};

/* ===== Helpers ===== */
const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dtfFull = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function fmtDuration(s?: number | null) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function displayOrUnclassified(s?: string | null) {
  const v = (s ?? "").trim();
  return v ? v : "Sin clasificar";
}

/* ===== Página ===== */
export default function PendingPage() {
  const supabase = createClientComponentClient();

  const [hydrated, setHydrated] = useState(false);

  // Header: org y usuario
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  // Filtros
  const [line, setLine] = useState<string>(""); // code
  const [fromISO, setFromISO] = useState<string>("");
  const [toISO, setToISO] = useState<string>("");

  // Datos
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [lines, setLines] = useState<{ id: string; code: string; name: string }[]>([]);
  const [tax, setTax] = useState<TaxResp["map"]>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Panel de edición
  const [editing, setEditing] = useState<PendingRow | null>(null);
  const [n1, setN1] = useState<string>("");
  const [n2, setN2] = useState<string>("");
  const [n3, setN3] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  /* Init filtros + marcar hidratado */
  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Para <input type="datetime-local"> se usa formato "YYYY-MM-DDTHH:mm"
    const toLocal = new Date(to.getTime() - to.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const fromLocal = new Date(from.getTime() - from.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setToISO(toLocal);
    setFromISO(fromLocal);
    setHydrated(true);
  }, []);

  /* Cargar email y organización */
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUserEmail(data.session?.user?.email ?? null);
      } catch {
        setUserEmail(null);
      }
      try {
        const meRes = await fetch("/api/me");
        const me = await meRes.json();
        if (me?.ok && Array.isArray(me.orgs) && me.orgs.length) {
          setOrgName(me.orgs[0]?.name ?? null);
        } else {
          setOrgName(null);
        }
      } catch {
        setOrgName(null);
      }
    })();
  }, [hydrated, supabase]);

  /* Cargar líneas y taxonomía */
  useEffect(() => {
    if (!hydrated) return;
    let mounted = true;

    (async () => {
      try {
        const [lnRes, txRes] = await Promise.all([fetch("/api/lines"), fetch("/api/taxonomy")]);
        const ln = (await lnRes.json()) as LinesResp | any;
        const tx = (await txRes.json()) as TaxResp | any;
        if (!mounted) return;
        if (ln?.ok) setLines(ln.rows || []);
        if (tx?.ok) setTax(tx.map || {});
      } catch {
        if (!mounted) return;
        setLines([]);
        setTax({});
      }
    })();

    return () => {
      mounted = false;
    };
  }, [hydrated]);

  /* QS filtros */
  const qs = useMemo(() => {
    if (!fromISO || !toISO) return "";
    const q = new URLSearchParams();
    // Normalizamos a ISO real (UTC) para la API
    q.set("from", new Date(fromISO).toISOString());
    q.set("to", new Date(toISO).toISOString());
    if (line) q.set("line", line.toUpperCase());
    return q.toString();
  }, [fromISO, toISO, line]);

  /* Cargar pendientes */
  useEffect(() => {
    if (!hydrated || !qs) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/pending-paros?${qs}`);
        const json = (await res.json()) as PendingResp | any;
        if (!mounted) return;
        if (!json?.ok) {
          setErr(json?.error || "Error cargando pendientes");
          setRows([]);
        } else {
          setRows(json.rows || []);
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [qs, hydrated]);

  /* opciones dependientes */
  const level1Opts = useMemo(
    () => Object.keys(tax).sort((a, b) => a.localeCompare(b, "es")),
    [tax]
  );
  const level2Opts = useMemo(() => {
    if (!n1 || !tax[n1]) return [];
    return Object.keys(tax[n1]).sort((a, b) => a.localeCompare(b, "es"));
  }, [n1, tax]);
  const level3Opts = useMemo(() => {
    if (!n1 || !n2 || !tax[n1] || !tax[n1][n2]) return [];
    return [...tax[n1][n2]].sort((a, b) => a.localeCompare(b, "es"));
  }, [n1, n2, tax]);

  /* abrir panel */
  const openEdit = (r: PendingRow) => {
    setEditing(r);
    setN1((r.level1 ?? "").trim());
    setN2((r.level2 ?? "").trim());
    setN3((r.level3 ?? "").trim());
    setSaveErr(null);
  };

  /* guardar */
  const doSave = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      setSaveErr(null);
      const res = await fetch(`/api/events/${editing.id}/classify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level1: n1 || null, level2: n2 || null, level3: n3 || null }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setSaveErr(json?.error || "No se pudo guardar");
        return;
      }
      // sacar de la lista
      setRows((prev) => prev.filter((x) => x.id !== editing.id));
      setEditing(null);
    } catch (e: any) {
      setSaveErr(e?.message ?? "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  /* ===== Render ===== */
  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100">
      {/* ===== Header unificado (con botón volver en /pending) ===== */}
      <AppHeader
        orgName={orgName ?? null}
        userEmail={userEmail ?? null}
        fromISO={fromISO}
        toISO={toISO}
      />

      {/* ===== Contenido ===== */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-4">Paros pendientes</h1>

        {/* Filtros */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Desde</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
              value={fromISO}
              onChange={(e) => setFromISO(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Hasta</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
              value={toISO}
              onChange={(e) => setToISO(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-slate-400 block mb-1">Línea</label>
            <select
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
              value={line}
              onChange={(e) => setLine(e.target.value)}
            >
              <option value="">Todas</option>
              {lines.map((ln) => (
                <option key={ln.id} value={ln.code}>
                  {ln.code} — {ln.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {/* No hace falta onClick: cambiar filtros recalcula qs y dispara la carga */}
            <button className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-4 py-2">
              Aplicar
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
            {err}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/60">
              <tr className="text-slate-400">
                <th className="text-left py-3 px-4">Inicio</th>
                <th className="text-left py-3 px-4">Línea</th>
                <th className="text-left py-3 px-4">Nivel 1</th>
                <th className="text-left py-3 px-4">Nivel 2</th>
                <th className="text-left py-3 px-4">Nivel 3</th>
                <th className="text-right py-3 px-4">Duración</th>
                <th className="text-left py-3 px-4">Estado</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td className="py-4 px-4 text-slate-400" colSpan={8}>
                    {loading ? "Cargando…" : "No hay pendientes en el rango seleccionado"}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-800/70 hover:bg-slate-900/60 transition-colors"
                >
                  <td className="py-3 px-4">{dtfFull.format(new Date(r.start_ts))}</td>
                  <td className="py-3 px-4">{r.line_code ?? "—"}</td>
                  <td className="py-3 px-4">{displayOrUnclassified(r.level1)}</td>
                  <td className="py-3 px-4">{displayOrUnclassified(r.level2)}</td>
                  <td className="py-3 px-4">
                    {r.level3?.trim()
                      ? r.level3
                      : r.requires_level_3
                      ? "⚠ requiere N3"
                      : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">{fmtDuration(r.duration_sec)}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center rounded-lg px-2 py-1 text-xs bg-amber-400/20 text-amber-300 border border-amber-400/20">
                      pending
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => openEdit(r)}
                      className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 transition"
                    >
                      Clasificar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== PANEL LATERAL ===== */}
      {editing && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-950 border-l border-slate-800 shadow-2xl p-6 overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Clasificar evento</h3>
              <button
                className="text-slate-400 hover:text-slate-200"
                onClick={() => setEditing(null)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 text-sm text-slate-400">
              <div>
                Inicio:{" "}
                <span className="text-slate-200">
                  {dtfFull.format(new Date(editing.start_ts))}
                </span>
              </div>
              <div>
                Línea: <span className="text-slate-200">{editing.line_code ?? "—"}</span>
              </div>
              <div>
                Duración:{" "}
                <span className="text-slate-200">{fmtDuration(editing.duration_sec)}</span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nivel 1</label>
                <select
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
                  value={n1}
                  onChange={(e) => {
                    setN1(e.target.value);
                    setN2("");
                    setN3("");
                  }}
                >
                  <option value="">— Seleccionar —</option>
                  {level1Opts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Nivel 2</label>
                <select
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
                  value={n2}
                  onChange={(e) => {
                    setN2(e.target.value);
                    setN3("");
                  }}
                  disabled={!n1}
                >
                  <option value="">{n1 ? "— Seleccionar —" : "Elige Nivel 1 primero"}</option>
                  {level2Opts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Nivel 3 (opcional)</label>
                <select
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
                  value={n3}
                  onChange={(e) => setN3(e.target.value)}
                  disabled={!n1 || !n2 || !level3Opts.length}
                >
                  <option value="">
                    {!n1 || !n2 ? "Elige N1/N2 primero" : "— (ninguno) —"}
                  </option>
                  {level3Opts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {editing.requires_level_3 && (
                  <div className="mt-1 text-xs text-amber-300">
                    Este evento sugiere completar Nivel 3.
                  </div>
                )}
              </div>

              {saveErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200">
                  {saveErr}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={doSave}
                  disabled={saving || (!n1 && !n2 && !n3)}
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-900 font-medium px-4 py-2"
                >
                  {saving ? "Guardando…" : "Guardar clasificación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
