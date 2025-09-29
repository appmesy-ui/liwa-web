// app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ==== Tipos ==== */
type Plant = {
  id: string;
  org_id: string | null;
  name: string;
};

type Line = {
  id: string;
  org_id: string | null;
  plant_id: string | null;
  code: string;
  name: string;
  is_active: boolean | null;
  created_at?: string | null;
  plant_name?: string | null;
};

type Machine = {
  id: string;
  org_id: string | null;
  line_id: string | null;
  code: string;
  name: string;
  ideal_cycle_s: number | null;
  is_active: boolean | null;
  created_at?: string | null;
  line_name?: string | null;
};

/* === Mock de turnos / calendario === */
type ShiftTemplate = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  startHHmm: string;     // "06:00"
  durationMin: number;   // 480
  tz: string;            // "local" (placeholder)
  overnight: boolean;    // true si cruza medianoche
};

type CalendarAssign = {
  // Mapa YYYY-MM-DD -> templateId
  [dayIso: string]: string | undefined;
};

const TABS = [
  { key: "lines", label: "Líneas" },
  { key: "machines", label: "Máquinas" },
  { key: "shifts", label: "Turnos" },
  { key: "calendar", label: "Calendario" },
];

/* ==== Utils ==== */
function friendlyPgError(e: any): string {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  if (msg.includes("liwa_lines_plant_code_unq")) return "Ya existe una línea con ese código en esta planta.";
  if (msg.includes("liwa_lines_plant_name_unq")) return "Ya existe una línea con ese nombre en esta planta.";
  if (msg.includes("liwa_machines_line_code_unq")) return "Ya existe una máquina con ese código en esta línea.";
  if (msg.includes("liwa_machines_line_name_unq")) return "Ya existe una máquina con ese nombre en esta línea.";
  if (msg.includes("machines_ideal_cycle_positive")) return "El ciclo ideal debe ser mayor que 0.";
  if (msg.includes("duplicate key value")) return "Ya existe un registro con esos datos.";
  return e?.message ?? "Ocurrió un error.";
}

const uuid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);

/* ==== LocalStorage helpers (scope por org/plant/mes) ==== */
const LS_KEYS = {
  templates: (orgId: string) => `liwa:shifts:templates:${orgId}`,
  // por mes y planta
  calendar: (orgId: string, plantId: string, ym: string) =>
    `liwa:shifts:calendar:${orgId}:${plantId}:${ym}`, // ym = YYYY-MM
};

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function lsSet<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function validHHmm(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
function ymOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function isoDay(y: number, m: number, d: number) {
  // y-m-1 basado 0; m: 0..11
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/* ==== Página principal ==== */
export default function SettingsPage() {
  const supabase = createClientComponentClient(); // usaremos .schema("liwa") en cada query
  const router = useRouter();
  const search = useSearchParams();
  const activeTab = search.get("tab") ?? "lines";

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data?.session));
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  function setTab(t: string) {
    const q = new URLSearchParams(search.toString());
    q.set("tab", t);
    router.push(`/settings?${q.toString()}`);
  }

  if (checking) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse text-slate-400">Cargando…</div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Configuración de Planta</h1>
        <p className="text-sm text-slate-400 mb-6">
          Necesitas iniciar sesión para acceder a la configuración.
        </p>
        <Link
          href="/login?next=/settings"
          className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Configuración de Planta</h1>
        <p className="text-sm text-slate-400">
          Administra líneas, máquinas y parámetros operativos.
        </p>
      </header>

      <nav className="flex gap-2 border-b border-slate-800 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-3 py-2 text-sm border-b-2 -mb-[2px]",
              activeTab === t.key
                ? "border-sky-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="mt-4">
        {activeTab === "lines" && <LinesTab parentClient={supabase} />}
        {activeTab === "machines" && <MachinesTab parentClient={supabase} />}
        {activeTab === "shifts" && <ShiftsTab parentClient={supabase} />}
        {activeTab === "calendar" && <CalendarTab parentClient={supabase} />}
      </section>
    </div>
  );
}

/* =================== LÍNEAS =================== */
function LinesTab({ parentClient }: { parentClient: ReturnType<typeof createClientComponentClient> }) {
  const supabase = parentClient;
  const sb = supabase as any; // <-- bypass TS for .schema("liwa")

  const [rows, setRows] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Org + Plantas
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsErr, setPlantsErr] = useState<string | null>(null);

  // Alta
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPlantId, setNewPlantId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editPlantId, setEditPlantId] = useState<string>("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);

  // 1) org
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) {
          if (mounted) setOrgId(null);
          return;
        }
        const { data: memberships, error } = await sb
          .schema("liwa")
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1);
        if (error) throw error;
        if (mounted) setOrgId(memberships?.[0]?.org_id ?? null);
      } catch {
        if (mounted) setOrgId(null);
      }
    })();
    return () => { mounted = false; };
  }, [supabase, sb]);

  // 2) plantas
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!orgId) return;
      const { data, error } = await sb
        .schema("liwa")
        .from("plants")
        .select("id, org_id, name")
        .eq("org_id", orgId)
        .order("name");
      if (!mounted) return;
      if (error) {
        setPlantsErr(error.message);
        setPlants([]);
      } else {
        setPlants(data ?? []);
        if ((data ?? []).length === 1) setNewPlantId((data ?? [])[0].id);
      }
    })();
    return () => { mounted = false; };
  }, [orgId, sb]);

  // 3) líneas
  async function loadLines() {
    try {
      setLoading(true);
      setErr(null);
      const [{ data: lines, error: e1 }, { data: prows, error: e2 }] = await Promise.all([
        sb.schema("liwa").from("lines").select("id, org_id, plant_id, code, name, is_active, created_at").order("name"),
        sb.schema("liwa").from("plants").select("id, name"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = new Map((prows ?? []).map((p) => [p.id, p.name]));
      setRows((lines ?? []).map((l) => ({ ...l, plant_name: l.plant_id ? map.get(l.plant_id) ?? null : null })));
    } catch (e: any) {
      setErr(e?.message ?? "Error al cargar líneas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadLines(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(s) ||
      r.code.toLowerCase().includes(s) ||
      (r.plant_name ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  /* ===== Alta ===== */
  async function onCreateLine(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessRes } = await supabase.auth.getSession();
    if (!sessRes?.session) { setCreateErr("No hay sesión activa."); return; }
    if (!orgId) { setCreateErr("No se pudo determinar tu organización."); return; }
    if (!newPlantId) { setCreateErr("Selecciona una planta."); return; }
    if (!newCode.trim() || !newName.trim()) { setCreateErr("Completa código y nombre."); return; }

    setCreateErr(null);
    setCreating(true);
    try {
      const { error } = await sb.schema("liwa").from("lines").insert({
        org_id: orgId, plant_id: newPlantId, code: newCode.trim(), name: newName.trim(), is_active: true,
      });
      if (error) throw error;
      setShowNew(false); setNewCode(""); setNewName(""); setNewPlantId(plants.length === 1 ? plants[0].id : "");
      await loadLines();
    } catch (e: any) { setCreateErr(friendlyPgError(e)); }
    finally { setCreating(false); }
  }

  /* ===== Editar ===== */
  function openEdit(line: Line) {
    setEditLine(line);
    setEditPlantId(line.plant_id ?? "");
    setEditCode(line.code);
    setEditName(line.name);
    setEditActive(Boolean(line.is_active));
    setEditErr(null);
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLine) return;
    if (!editPlantId) { setEditErr("Selecciona una planta."); return; }
    if (!editCode.trim() || !editName.trim()) { setEditErr("Completa código y nombre."); return; }
    setEditErr(null); setEditSaving(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("lines")
        .update({ plant_id: editPlantId, code: editCode.trim(), name: editName.trim(), is_active: editActive })
        .eq("id", editLine.id);
      if (error) throw error;
      setEditOpen(false); setEditLine(null);
      await loadLines();
    } catch (e: any) { setEditErr(friendlyPgError(e)); }
    finally { setEditSaving(false); }
  }

  async function toggleActive(line: Line) {
    try {
      await sb.schema("liwa").from("lines").update({ is_active: !line.is_active }).eq("id", line.id);
      await loadLines();
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Líneas</h2>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o planta…" className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900" />
          <button onClick={() => setShowNew(true)} className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900">Nueva línea</button>
        </div>
      </div>

      {/* Modal NUEVA LÍNEA */}
      {showNew && (
        <Modal title="Crear nueva línea" onClose={() => setShowNew(false)}>
          <form onSubmit={onCreateLine} className="space-y-3">
            <Field label="Planta">
              {plantsErr ? <div className="text-xs text-red-400">{plantsErr}</div> :
                plants.length <= 1 ? (
                  <input value={plants[0]?.name ?? "—"} disabled className="input" />
                ) : (
                  <select value={newPlantId} onChange={(e) => setNewPlantId(e.target.value)} className="input">
                    <option value="">— Selecciona —</option>
                    {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
            </Field>
            <Field label="Código"><input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="input" placeholder="Ej: L1" /></Field>
            <Field label="Nombre"><input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder="Ej: Línea 1" /></Field>
            {createErr && <div className="text-xs text-red-400">{createErr}</div>}
            <Actions onCancel={() => setShowNew(false)} saving={creating} />
          </form>
        </Modal>
      )}

      {/* Modal EDITAR LÍNEA */}
      {editOpen && editLine && (
        <Modal title={`Editar línea ${editLine.code}`} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Planta">
              {plants.length <= 1 ? (
                <input value={plants[0]?.name ?? "—"} disabled className="input" />
              ) : (
                <select value={editPlantId} onChange={(e) => setEditPlantId(e.target.value)} className="input">
                  <option value="">— Selecciona —</option>
                  {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Código"><input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="input" /></Field>
            <Field label="Nombre"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" /></Field>
            <div className="flex items-center gap-2">
              <input id="line-active" type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              <label htmlFor="line-active" className="text-sm text-slate-300">Activa</label>
            </div>
            {editErr && <div className="text-xs text-red-400">{editErr}</div>}
            <Actions onCancel={() => setEditOpen(false)} saving={editSaving} />
          </form>
        </Modal>
      )}

      {loading ? <SkeletonTable /> : err ? (
        <div className="text-sm text-red-400">{err}</div>
      ) : filtered.length === 0 ? (
        <EmptyState hint="No hay líneas." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr className="[&>th]:py-2 [&>th]:px-2">
              <th>Código</th><th>Nombre</th><th>Planta</th><th>Activa</th><th>Creada</th><th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr key={r.id} className="[&>td]:py-2 [&>td]:px-2">
                <td className="font-mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.plant_name ?? "—"}</td>
                <td>{r.is_active ? "Sí" : "No"}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                <td className="text-right">
                  <button className="link" onClick={() => openEdit(r)}>Editar</button>
                  <span className="mx-1 text-slate-600">/</span>
                  <button className="link" onClick={() => toggleActive(r)}>{r.is_active ? "Desactivar" : "Activar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* =================== MÁQUINAS =================== */
function MachinesTab({ parentClient }: { parentClient: ReturnType<typeof createClientComponentClient> }) {
  const supabase = parentClient;
  const sb = supabase as any; // <-- bypass TS for .schema("liwa")

  const [rows, setRows] = useState<Machine[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Org + Líneas
  const [orgId, setOrgId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [linesErr, setLinesErr] = useState<string | null>(null);

  // Alta
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLineId, setNewLineId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCycle, setNewCycle] = useState<string>("60");
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editMachine, setEditMachine] = useState<Machine | null>(null);
  const [editLineId, setEditLineId] = useState<string>("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCycle, setEditCycle] = useState<string>("60");
  const [editActive, setEditActive] = useState(true);

  // 1) org
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) { if (mounted) setOrgId(null); return; }
        const { data: memberships, error } = await sb.schema("liwa").from("org_members").select("org_id").eq("user_id", userId).limit(1);
        if (error) throw error;
        if (mounted) setOrgId(memberships?.[0]?.org_id ?? null);
      } catch { if (mounted) setOrgId(null); }
    })();
    return () => { mounted = false; };
  }, [supabase, sb]);

  // 2) líneas (selector)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!orgId) return;
      setLinesErr(null);
      const { data, error } = await sb.schema("liwa").from("lines").select("id, name, code, org_id").eq("org_id", orgId).order("name");
      if (!mounted) return;
      if (error) { setLinesErr(error.message); setLines([]); }
      else { setLines(data ?? []); if ((data ?? []).length === 1) { setNewLineId((data ?? [])[0].id); } }
    })();
    return () => { mounted = false; };
  }, [orgId, sb]);

  // 3) máquinas + nombres de línea
  async function loadMachines() {
    try {
      setLoading(true);
      setErr(null);
      const [{ data: machines, error: e1 }, { data: lrows, error: e2 }] = await Promise.all([
        sb.schema("liwa").from("machines").select("id, org_id, line_id, code, name, ideal_cycle_s, is_active, created_at").order("name"),
        sb.schema("liwa").from("lines").select("id, name"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = new Map((lrows ?? []).map((l) => [l.id, l.name]));
      setRows((machines ?? []).map((m) => ({ ...m, line_name: m.line_id ? map.get(m.line_id) ?? null : null })));
    } catch (e: any) {
      setErr(e?.message ?? "Error al cargar máquinas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadMachines(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(s) ||
      r.code.toLowerCase().includes(s) ||
      (r.line_name ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  /* ===== Alta ===== */
  async function onCreateMachine(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessRes } = await supabase.auth.getSession();
    if (!sessRes?.session) { setCreateErr("No hay sesión activa."); return; }
    if (!orgId) { setCreateErr("No se pudo determinar tu organización."); return; }
    if (!newLineId) { setCreateErr("Selecciona una línea."); return; }
    if (!newCode.trim() || !newName.trim()) { setCreateErr("Completa código y nombre."); return; }
    const cycle = parseFloat(newCycle.replace(",", "."));
    if (!isFinite(cycle) || cycle <= 0) { setCreateErr("Ciclo ideal inválido (>0)."); return; }

    setCreateErr(null); setCreating(true);
    try {
      const { error } = await sb.schema("liwa").from("machines").insert({
        org_id: orgId, line_id: newLineId, code: newCode.trim(), name: newName.trim(), ideal_cycle_s: cycle, is_active: true,
      });
      if (error) throw error;
      setNewOpen(false); setNewCode(""); setNewName(""); setNewCycle("60"); setNewLineId(lines.length === 1 ? lines[0].id : "");
      await loadMachines();
    } catch (e: any) { setCreateErr(friendlyPgError(e)); }
    finally { setCreating(false); }
  }

  /* ===== Editar / mover ===== */
  function openEdit(m: Machine) {
    setEditMachine(m);
    setEditLineId(m.line_id ?? "");
    setEditCode(m.code);
    setEditName(m.name);
    setEditCycle(String(m.ideal_cycle_s ?? "60"));
    setEditActive(Boolean(m.is_active));
    setEditErr(null);
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editMachine) return;
    if (!editLineId) { setEditErr("Selecciona una línea."); return; }
    if (!editCode.trim() || !editName.trim()) { setEditErr("Completa código y nombre."); return; }
    const cycle = parseFloat(editCycle.replace(",", "."));
    if (!isFinite(cycle) || cycle <= 0) { setEditErr("Ciclo ideal inválido (>0)."); return; }

    setEditErr(null); setEditSaving(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("machines")
        .update({
          line_id: editLineId, code: editCode.trim(), name: editName.trim(), ideal_cycle_s: cycle, is_active: editActive,
        })
        .eq("id", editMachine.id);
      if (error) throw error;
      setEditOpen(false); setEditMachine(null);
      await loadMachines();
    } catch (e: any) { setEditErr(friendlyPgError(e)); }
    finally { setEditSaving(false); }
  }

  async function toggleActive(m: Machine) {
    try {
      await sb.schema("liwa").from("machines").update({ is_active: !m.is_active }).eq("id", m.id);
      await loadMachines();
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Máquinas</h2>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o línea…" className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900" />
          <button onClick={() => setNewOpen(true)} className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900">Nueva máquina</button>
        </div>
      </div>

      {/* Modal NUEVA MÁQUINA */}
      {newOpen && (
        <Modal title="Crear nueva máquina" onClose={() => setNewOpen(false)}>
          <form onSubmit={onCreateMachine} className="space-y-3">
            <Field label="Línea">
              {linesErr ? <div className="text-xs text-red-400">{linesErr}</div> :
                lines.length <= 1 ? (
                  <input value={lines[0]?.name ?? "—"} disabled className="input" />
                ) : (
                  <select value={newLineId} onChange={(e) => setNewLineId(e.target.value)} className="input">
                    <option value="">— Selecciona —</option>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
            </Field>
            <Field label="Código"><input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="input" placeholder="Ej: M1" /></Field>
            <Field label="Nombre"><input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder="Ej: Robot 1" /></Field>
            <Field label="Ciclo ideal (seg/ud)">
              <input type="number" inputMode="decimal" step="0.001" min="0.001" value={newCycle} onChange={(e) => setNewCycle(e.target.value)} className="input" placeholder="Ej: 12.5" />
            </Field>
            {createErr && <div className="text-xs text-red-400">{createErr}</div>}
            <Actions onCancel={() => setNewOpen(false)} saving={creating} />
          </form>
        </Modal>
      )}

      {/* Modal EDITAR/MOVER MÁQUINA */}
      {editOpen && editMachine && (
        <Modal title={`Editar máquina ${editMachine.code}`} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Línea (mover)">
              {lines.length <= 1 ? (
                <input value={lines[0]?.name ?? "—"} disabled className="input" />
              ) : (
                <select value={editLineId} onChange={(e) => setEditLineId(e.target.value)} className="input">
                  <option value="">— Selecciona —</option>
                  {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Código"><input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="input" /></Field>
            <Field label="Nombre"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" /></Field>
            <Field label="Ciclo ideal (seg/ud)">
              <input type="number" inputMode="decimal" step="0.001" min="0.001" value={editCycle} onChange={(e) => setEditCycle(e.target.value)} className="input" />
            </Field>
            <div className="flex items-center gap-2">
              <input id="m-active" type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              <label htmlFor="m-active" className="text-sm text-slate-300">Activa</label>
            </div>
            {editErr && <div className="text-xs text-red-400">{editErr}</div>}
            <Actions onCancel={() => setEditOpen(false)} saving={editSaving} />
          </form>
        </Modal>
      )}

      {loading ? <SkeletonTable /> : err ? (
        <div className="text-sm text-red-400">{err}</div>
      ) : filtered.length === 0 ? (
        <EmptyState hint="No hay máquinas. Crea una para comenzar." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr className="[&>th]:py-2 [&>th]:px-2">
              <th>Código</th><th>Nombre</th><th>Línea</th><th>Ciclo ideal (s/ud)</th><th>Activa</th><th>Creada</th><th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr key={r.id} className="[&>td]:py-2 [&>td]:px-2">
                <td className="font-mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.line_name ?? "—"}</td>
                <td>{r.ideal_cycle_s ?? "—"}</td>
                <td>{r.is_active ? "Sí" : "No"}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                <td className="text-right">
                  <button className="link" onClick={() => openEdit(r)}>Editar</button>
                  <span className="mx-1 text-slate-600">/</span>
                  <button className="link" onClick={() => toggleActive(r)}>{r.is_active ? "Desactivar" : "Activar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* =================== TURNOS (mock localStorage) =================== */
function ShiftsTab({ parentClient }: { parentClient: ReturnType<typeof createClientComponentClient> }) {
  const supabase = parentClient;
  const sb = supabase as any; // <-- bypass TS for .schema("liwa")

  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [q, setQ] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nCode, setNCode] = useState("");
  const [nName, setNName] = useState("");
  const [nStart, setNStart] = useState("06:00");
  const [nDur, setNDur] = useState("480");
  const [nOver, setNOver] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eId, setEId] = useState<string>("");
  const [eCode, setECode] = useState("");
  const [eName, setEName] = useState("");
  const [eStart, setEStart] = useState("06:00");
  const [eDur, setEDur] = useState("480");
  const [eOver, setEOver] = useState(false);

  // org
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) { if (mounted) setOrgId(null); return; }
        const { data: memberships, error } = await sb.schema("liwa").from("org_members").select("org_id").eq("user_id", userId).limit(1);
        if (error) throw error;
        const oid = memberships?.[0]?.org_id ?? null;
        if (mounted) setOrgId(oid);
        if (oid) {
          const t = lsGet<ShiftTemplate[]>(LS_KEYS.templates(oid), []);
          setTemplates(t);
        }
      } catch { if (mounted) setOrgId(null); }
    })();
    return () => { mounted = false; };
  }, [supabase, sb]);

  function persist(next: ShiftTemplate[]) {
    if (!orgId) return;
    setTemplates(next);
    lsSet(LS_KEYS.templates(orgId), next);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter(t =>
      t.code.toLowerCase().includes(s) ||
      t.name.toLowerCase().includes(s) ||
      t.startHHmm.includes(s)
    );
  }, [templates, q]);

  function openEdit(t: ShiftTemplate) {
    setEId(t.id);
    setECode(t.code);
    setEName(t.name);
    setEStart(t.startHHmm);
    setEDur(String(t.durationMin));
    setEOver(Boolean(t.overnight));
    setEditErr(null);
    setEditOpen(true);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const dur = Number(nDur);
    if (!nCode.trim() || !nName.trim()) { setNewErr("Completa código y nombre."); return; }
    if (!validHHmm(nStart)) { setNewErr("Hora inválida (HH:mm)."); return; }
    if (!isFinite(dur) || dur <= 0) { setNewErr("Duración inválida (>0)."); return; }
    if (templates.some(t => t.code.toLowerCase() === nCode.trim().toLowerCase())) { setNewErr("Código duplicado."); return; }

    setNewErr(null); setCreating(true);
    const t: ShiftTemplate = {
      id: uuid(),
      org_id: orgId,
      code: nCode.trim(),
      name: nName.trim(),
      startHHmm: nStart,
      durationMin: dur,
      tz: "local",
      overnight: nOver,
    };
    persist([...templates, t]);
    setNewOpen(false);
    setNCode(""); setNName(""); setNStart("06:00"); setNDur("480"); setNOver(false);
    setCreating(false);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    const dur = Number(eDur);
    if (!eCode.trim() || !eName.trim()) { setEditErr("Completa código y nombre."); return; }
    if (!validHHmm(eStart)) { setEditErr("Hora inválida (HH:mm)."); return; }
    if (!isFinite(dur) || dur <= 0) { setEditErr("Duración inválida (>0)."); return; }
    if (templates.some(t => t.id !== eId && t.code.toLowerCase() === eCode.trim().toLowerCase())) { setEditErr("Código duplicado."); return; }

    setEditErr(null); setSaving(true);
    persist(templates.map(t => t.id === eId ? {
      ...t,
      code: eCode.trim(),
      name: eName.trim(),
      startHHmm: eStart,
      durationMin: dur,
      overnight: eOver,
    } : t));
    setEditOpen(false);
    setSaving(false);
  }

  function removeTemplate(id: string) {
    persist(templates.filter(t => t.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Turnos (plantillas)</h2>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre u hora…" className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900" />
          <button onClick={() => setNewOpen(true)} className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900">Nueva plantilla</button>
        </div>
      </div>

      {templates.length === 0 ? (
        <EmptyState hint="Aún no hay plantillas de turno. Crea una para comenzar." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr className="[&>th]:py-2 [&>th]:px-2">
              <th>Código</th><th>Nombre</th><th>Inicio</th><th>Duración (min)</th><th>Cruza 00:00</th><th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((t) => (
              <tr key={t.id} className="[&>td]:py-2 [&>td]:px-2">
                <td className="font-mono">{t.code}</td>
                <td>{t.name}</td>
                <td>{t.startHHmm}</td>
                <td>{t.durationMin}</td>
                <td>{t.overnight ? "Sí" : "No"}</td>
                <td className="text-right">
                  <button className="link" onClick={() => openEdit(t)}>Editar</button>
                  <span className="mx-1 text-slate-600">/</span>
                  <button className="link" onClick={() => removeTemplate(t.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Nueva */}
      {newOpen && (
        <Modal title="Nueva plantilla de turno" onClose={() => setNewOpen(false)}>
          <form onSubmit={createTemplate} className="space-y-3">
            <Field label="Código"><input value={nCode} onChange={(e) => setNCode(e.target.value)} className="input" placeholder="Ej: M" /></Field>
            <Field label="Nombre"><input value={nName} onChange={(e) => setNName(e.target.value)} className="input" placeholder="Ej: Mañana" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio (HH:mm)">
                <input value={nStart} onChange={(e) => setNStart(e.target.value)} className="input" placeholder="06:00" />
              </Field>
              <Field label="Duración (min)">
                <input type="number" min={1} step={1} value={nDur} onChange={(e) => setNDur(e.target.value)} className="input" placeholder="480" />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input id="overnight-n" type="checkbox" checked={nOver} onChange={(e) => setNOver(e.target.checked)} />
              <label htmlFor="overnight-n" className="text-sm text-slate-300">Cruza medianoche</label>
            </div>
            {newErr && <div className="text-xs text-red-400">{newErr}</div>}
            <Actions onCancel={() => setNewOpen(false)} saving={creating} />
          </form>
        </Modal>
      )}

      {/* Editar */}
      {editOpen && (
        <Modal title="Editar plantilla de turno" onClose={() => setEditOpen(false)}>
          <form onSubmit={saveTemplate} className="space-y-3">
            <Field label="Código"><input value={eCode} onChange={(e) => setECode(e.target.value)} className="input" /></Field>
            <Field label="Nombre"><input value={eName} onChange={(e) => setEName(e.target.value)} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio (HH:mm)">
                <input value={eStart} onChange={(e) => setEStart(e.target.value)} className="input" />
              </Field>
              <Field label="Duración (min)">
                <input type="number" min={1} step={1} value={eDur} onChange={(e) => setEDur(e.target.value)} className="input" />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input id="overnight-e" type="checkbox" checked={eOver} onChange={(e) => setEOver(e.target.checked)} />
              <label htmlFor="overnight-e" className="text-sm text-slate-300">Cruza medianoche</label>
            </div>
            {editErr && <div className="text-xs text-red-400">{editErr}</div>}
            <Actions onCancel={() => setEditOpen(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  );
}

/* =================== CALENDARIO (mock localStorage) =================== */
function CalendarTab({ parentClient }: { parentClient: ReturnType<typeof createClientComponentClient> }) {
  const supabase = parentClient;
  const sb = supabase as any; // <-- bypass TS for .schema("liwa")

  const [orgId, setOrgId] = useState<string | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantId, setPlantId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [assign, setAssign] = useState<CalendarAssign>({});
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [selectDay, setSelectDay] = useState<string | null>(null);
  const [selTemplate, setSelTemplate] = useState<string>("");

  // org + plantas + templates
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) { if (mounted) setOrgId(null); return; }
        const { data: memberships, error } = await sb.schema("liwa").from("org_members").select("org_id").eq("user_id", userId).limit(1);
        if (error) throw error;
        const oid = memberships?.[0]?.org_id ?? null;
        if (!mounted) return;
        setOrgId(oid);

        if (oid) {
          const ts = lsGet<ShiftTemplate[]>(LS_KEYS.templates(oid), []);
          setTemplates(ts);
        }

        if (oid) {
          const { data: prows, error: e2 } = await sb.schema("liwa").from("plants").select("id, name").eq("org_id", oid).order("name");
          if (e2) throw e2;
          setPlants(prows ?? []);
          if ((prows ?? []).length === 1) setPlantId((prows ?? [])[0].id);
        }
      } catch (e: any) {
        setErr(e?.message ?? "No se pudieron cargar plantas.");
      }
    })();
    return () => { mounted = false; };
  }, [supabase, sb]);

  // cargar asignaciones del mes cuando cambian plant o mes
  useEffect(() => {
    if (!orgId || !plantId) return;
    const key = LS_KEYS.calendar(orgId, plantId, ymOf(month));
    setAssign(lsGet<CalendarAssign>(key, {}));
  }, [orgId, plantId, month]);

  function persist(newAssign: CalendarAssign) {
    if (!orgId || !plantId) return;
    const key = LS_KEYS.calendar(orgId, plantId, ymOf(month));
    setAssign(newAssign);
    lsSet(key, newAssign);
  }

  function daysGrid(d: Date) {
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    // semana inicia lunes
    const startIdx = (start.getDay() + 6) % 7; // 0..6 (lun=0)
    const totalDays = end.getDate();
    const cells: Array<{ iso?: string; day?: number; inMonth: boolean }> = [];

    // prev month blanks
    for (let i = 0; i < startIdx; i++) cells.push({ inMonth: false });

    // current month days
    for (let day = 1; day <= totalDays; day++) {
      cells.push({
        inMonth: true,
        day,
        iso: isoDay(start.getFullYear(), start.getMonth(), day),
      });
    }
    // pad to full weeks
    while (cells.length % 7 !== 0) cells.push({ inMonth: false });

    return cells;
  }

  const cells = useMemo(() => daysGrid(month), [month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-lg font-medium">Calendario de turnos</h2>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900" onClick={() => setMonth(addMonths(month, -1))}>← Mes anterior</button>
          <div className="text-sm text-slate-300 min-w-[160px] text-center">
            {month.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
          </div>
          <button className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900" onClick={() => setMonth(addMonths(month, +1))}>Mes siguiente →</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Field label="Planta">
          {err ? (
            <div className="text-xs text-red-400">{err}</div>
          ) : plants.length <= 1 ? (
            <input value={plants[0]?.name ?? "—"} disabled className="input" />
          ) : (
            <select value={plantId} onChange={(e) => setPlantId(e.target.value)} className="input">
              <option value="">— Selecciona —</option>
              {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Plantillas disponibles">
          <div className="flex gap-2 flex-wrap">
            {templates.length ? templates.map(t => (
              <span key={t.id} className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300">
                {t.code} · {t.startHHmm} · {t.durationMin}m
              </span>
            )) : <span className="text-xs text-slate-500">No hay plantillas. Crea alguna en la pestaña “Turnos”.</span>}
          </div>
        </Field>
      </div>

      {!plantId ? (
        <EmptyState hint="Selecciona una planta para ver y editar el calendario." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="grid grid-cols-7 text-xs bg-slate-950/70 text-slate-400">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="px-2 py-2 border-b border-slate-800">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, idx) => {
              if (!c.inMonth) return <div key={idx} className="h-24 border-b border-slate-800 bg-slate-950/40" />;
              const tplId = c.iso ? assign[c.iso] : undefined;
              const tpl = tplId ? templates.find(t => t.id === tplId) : undefined;
              return (
                <button
                  key={c.iso}
                  onClick={() => setSelectDay(c.iso!)}
                  className="h-24 text-left p-2 border-b border-slate-800 border-r last:border-r-0 hover:bg-white/[0.04]"
                >
                  <div className="text-xs text-slate-400">{c.day}</div>
                  {tpl ? (
                    <div className="mt-1 text-[11px] inline-flex items-center gap-2 rounded-md border border-slate-700 px-1.5 py-0.5">
                      <span className="font-mono">{tpl.code}</span>
                      <span className="text-slate-400">{tpl.startHHmm}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-slate-500">—</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal asignación */}
      {selectDay && (
        <Modal title={`Asignar turno al ${new Date(selectDay).toLocaleDateString("es-ES")}`} onClose={() => setSelectDay(null)}>
          <div className="space-y-3">
            <Field label="Plantilla">
              <select value={selTemplate} onChange={(e) => setSelTemplate(e.target.value)} className="input">
                <option value="">— Sin asignar —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.code} · {t.name} · {t.startHHmm} ({t.durationMin}m)</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-2 text-sm rounded-md border border-slate-800" onClick={() => setSelectDay(null)}>Cancelar</button>
              <button
                className="px-3 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-500"
                onClick={() => {
                  if (!selectDay) return;
                  const next = { ...assign };
                  if (!selTemplate) delete next[selectDay];
                  else next[selectDay] = selTemplate;
                  persist(next);
                  setSelTemplate("");
                  setSelectDay(null);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ==== UI helpers ==== */
function SkeletonTable() {
  return (
    <div className="w-full border border-slate-800 rounded-md">
      <div className="h-10 border-b border-slate-800" />
      <div className="h-10 border-b border-slate-800" />
      <div className="h-10 border-b border-slate-800" />
      <div className="h-10 border-b border-slate-800" />
    </div>
  );
}

function EmptyState({ hint }: { hint?: string }) {
  return (
    <div className="p-6 border border-slate-800 rounded-md text-sm text-slate-400">
      <div className="font-medium text-slate-200 mb-1">Sin registros</div>
      <div>{hint ?? "No se encontraron registros para mostrar."}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Actions({ onCancel, saving }: { onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-md border border-slate-800">Cancelar</button>
      <button type="submit" disabled={saving} className="px-3 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

/* Inputs base (mantener) */
declare global {
  interface HTMLElementTagNameMap {
    "input": HTMLInputElement;
  }
}

