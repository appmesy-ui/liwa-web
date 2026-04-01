// app/settings/page.tsx
"use client";

import type React from "react";
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

/* === Turnos / calendario === */
type ShiftTemplate = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  startHHmm: string; // "06:00"
  durationMin: number; // 480
  tz: string; // "local" (solo UI)
  overnight: boolean; // true si cruza medianoche
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
  if (msg.includes("liwa_lines_plant_code_unq"))
    return "Ya existe una línea con ese código en esta planta.";
  if (msg.includes("liwa_lines_plant_name_unq"))
    return "Ya existe una línea con ese nombre en esta planta.";
  if (msg.includes("liwa_machines_line_code_unq"))
    return "Ya existe una máquina con ese código en esta línea.";
  if (msg.includes("liwa_machines_line_name_unq"))
    return "Ya existe una máquina con ese nombre en esta línea.";
  if (msg.includes("machines_ideal_cycle_positive"))
    return "El ciclo ideal debe ser mayor que 0.";
  if (msg.includes("duplicate key value"))
    return "Ya existe un registro con esos datos.";
  return e?.message ?? "Ocurrió un error.";
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

/* ==== Local helpers fechas ==== */
function ymOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}
function isoDay(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
    2,
    "0"
  )}`;
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
function validHHmm(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/* ==== Página principal ==== */
export default function SettingsPage() {
  const supabase = createClientComponentClient();
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
        <h1 className="text-2xl font-semibold mb-2">
          Configuración de Planta
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Necesitas iniciar sesión para acceder a la configuración.
        </p>
        <Link
          href="/signin?next=/settings"
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

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/settings/admin-users"
          className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"
        >
          Administración de usuarios →
        </Link>
      </div>

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
        {activeTab === "calendar" && (
          <CalendarTab parentClient={supabase} />
        )}
      </section>
    </div>
  );
}

/* =================== LÍNEAS =================== */
function LinesTab({
  parentClient,
}: {
  parentClient: ReturnType<typeof createClientComponentClient>;
}) {
  const supabase = parentClient;
  const sb = supabase as any;

  const [rows, setRows] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsErr, setPlantsErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPlantId, setNewPlantId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editPlantId, setEditPlantId] = useState<string>("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);

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
    return () => {
      mounted = false;
    };
  }, [supabase, sb]);

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
    return () => {
      mounted = false;
    };
  }, [orgId, sb]);

  async function loadLines() {
    try {
      setLoading(true);
      setErr(null);
      const [{ data: lines, error: e1 }, { data: prows, error: e2 }] =
        await Promise.all([
          sb
            .schema("liwa")
            .from("lines")
            .select(
              "id, org_id, plant_id, code, name, is_active, created_at"
            )
            .order("name"),
          sb.schema("liwa").from("plants").select("id, name"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = new Map((prows ?? []).map((p: any) => [p.id, p.name]));
      setRows(
        (lines ?? []).map((l: any) => ({
          ...l,
          plant_name: l.plant_id ? map.get(l.plant_id) ?? null : null,
        }))
      );
    } catch (e: any) {
      setErr(e?.message ?? "Error al cargar líneas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.code.toLowerCase().includes(s) ||
        (r.plant_name ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  async function onCreateLine(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessRes } = await supabase.auth.getSession();
    if (!sessRes?.session) {
      setCreateErr("No hay sesión activa.");
      return;
    }
    if (!orgId) {
      setCreateErr("No se pudo determinar tu organización.");
      return;
    }
    if (!newPlantId) {
      setCreateErr("Selecciona una planta.");
      return;
    }
    if (!newCode.trim() || !newName.trim()) {
      setCreateErr("Completa código y nombre.");
      return;
    }

    setCreateErr(null);
    setCreating(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("lines")
        .insert({
          org_id: orgId,
          plant_id: newPlantId,
          code: newCode.trim(),
          name: newName.trim(),
          is_active: true,
        });
      if (error) throw error;
      setShowNew(false);
      setNewCode("");
      setNewName("");
      setNewPlantId(plants.length === 1 ? plants[0].id : "");
      await loadLines();
    } catch (e: any) {
      setCreateErr(friendlyPgError(e));
    } finally {
      setCreating(false);
    }
  }

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
    if (!editPlantId) {
      setEditErr("Selecciona una planta.");
      return;
    }
    if (!editCode.trim() || !editName.trim()) {
      setEditErr("Completa código y nombre.");
      return;
    }
    setEditErr(null);
    setEditSaving(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("lines")
        .update({
          plant_id: editPlantId,
          code: editCode.trim(),
          name: editName.trim(),
          is_active: editActive,
        })
        .eq("id", editLine.id);
      if (error) throw error;
      setEditOpen(false);
      setEditLine(null);
      await loadLines();
    } catch (e: any) {
      setEditErr(friendlyPgError(e));
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(line: Line) {
    try {
      await sb
        .schema("liwa")
        .from("lines")
        .update({ is_active: !line.is_active })
        .eq("id", line.id);
      await loadLines();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Líneas</h2>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, nombre o planta…"
            className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900"
          />
          <button
            onClick={() => setShowNew(true)}
            className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900"
          >
            Nueva línea
          </button>
        </div>
      </div>

      {showNew && (
        <Modal title="Crear nueva línea" onClose={() => setShowNew(false)}>
          <form onSubmit={onCreateLine} className="space-y-3">
            <Field label="Planta">
              {plantsErr ? (
                <div className="text-xs text-red-400">{plantsErr}</div>
              ) : plants.length <= 1 ? (
                <input
                  value={plants[0]?.name ?? "—"}
                  disabled
                  className="input"
                />
              ) : (
                <select
                  value={newPlantId}
                  onChange={(e) => setNewPlantId(e.target.value)}
                  className="input"
                >
                  <option value="">— Selecciona —</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Código">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="input"
                placeholder="Ej: L1"
              />
            </Field>
            <Field label="Nombre">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input"
                placeholder="Ej: Línea 1"
              />
            </Field>
            {createErr && (
              <div className="text-xs text-red-400">{createErr}</div>
            )}
            <Actions onCancel={() => setShowNew(false)} saving={creating} />
          </form>
        </Modal>
      )}

      {editOpen && editLine && (
        <Modal
          title={`Editar línea ${editLine.code}`}
          onClose={() => setEditOpen(false)}
        >
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Planta">
              {plants.length <= 1 ? (
                <input
                  value={plants[0]?.name ?? "—"}
                  disabled
                  className="input"
                />
              ) : (
                <select
                  value={editPlantId}
                  onChange={(e) => setEditPlantId(e.target.value)}
                  className="input"
                >
                  <option value="">— Selecciona —</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Código">
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Nombre">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input"
              />
            </Field>
            <div className="flex items-center gap-2">
              <input
                id="line-active"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              <label htmlFor="line-active" className="text-sm text-slate-300">
                Activa
              </label>
            </div>
            {editErr && (
              <div className="text-xs text-red-400">{editErr}</div>
            )}
            <Actions onCancel={() => setEditOpen(false)} saving={editSaving} />
          </form>
        </Modal>
      )}

      {loading ? (
        <SkeletonTable />
      ) : err ? (
        <div className="text-sm text-red-400">{err}</div>
      ) : filtered.length === 0 ? (
        <EmptyState hint="No hay líneas." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr className="[&>th]:py-2 [&>th]:px-2">
              <th>Código</th>
              <th>Nombre</th>
              <th>Planta</th>
              <th>Activa</th>
              <th>Creada</th>
              <th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr key={r.id} className="[&>td]:py-2 [&>td]:px-2">
                <td className="font-mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.plant_name ?? "—"}</td>
                <td>{r.is_active ? "Sí" : "No"}</td>
                <td>
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString()
                    : "—"}
                </td>
                <td className="text-right">
                  <button className="link" onClick={() => openEdit(r)}>
                    Editar
                  </button>
                  <span className="mx-1 text-slate-600">/</span>
                  <button className="link" onClick={() => toggleActive(r)}>
                    {r.is_active ? "Desactivar" : "Activar"}
                  </button>
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
function MachinesTab({
  parentClient,
}: {
  parentClient: ReturnType<typeof createClientComponentClient>;
}) {
  const supabase = parentClient;
  const sb = supabase as any;

  const [rows, setRows] = useState<Machine[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [linesErr, setLinesErr] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLineId, setNewLineId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCycle, setNewCycle] = useState<string>("60");
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editMachine, setEditMachine] = useState<Machine | null>(null);
  const [editLineId, setEditLineId] = useState<string>("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCycle, setEditCycle] = useState<string>("60");
  const [editActive, setEditActive] = useState(true);

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
    return () => {
      mounted = false;
    };
  }, [supabase, sb]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!orgId) return;
      setLinesErr(null);
      const { data, error } = await sb
        .schema("liwa")
        .from("lines")
        .select("id, name, code, org_id")
        .eq("org_id", orgId)
        .order("name");
      if (!mounted) return;
      if (error) {
        setLinesErr(error.message);
        setLines([]);
      } else {
        setLines(data ?? []);
        if ((data ?? []).length === 1) setNewLineId((data ?? [])[0].id);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orgId, sb]);

  async function loadMachines() {
    try {
      setLoading(true);
      setErr(null);
      const [{ data: machines, error: e1 }, { data: lrows, error: e2 }] =
        await Promise.all([
          sb
            .schema("liwa")
            .from("machines")
            .select(
              "id, org_id, line_id, code, name, ideal_cycle_s, is_active, created_at"
            )
            .order("name"),
          sb.schema("liwa").from("lines").select("id, name"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = new Map((lrows ?? []).map((l: any) => [l.id, l.name]));
      setRows(
        (machines ?? []).map((m: any) => ({
          ...m,
          line_name: m.line_id ? map.get(m.line_id) ?? null : null,
        }))
      );
    } catch (e: any) {
      setErr(e?.message ?? "Error al cargar máquinas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadMachines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.code.toLowerCase().includes(s) ||
        (r.line_name ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  async function onCreateMachine(e: React.FormEvent) {
    e.preventDefault();
    const { data: sessRes } = await supabase.auth.getSession();
    if (!sessRes?.session) {
      setCreateErr("No hay sesión activa.");
      return;
    }
    if (!orgId) {
      setCreateErr("No se pudo determinar tu organización.");
      return;
    }
    if (!newLineId) {
      setCreateErr("Selecciona una línea.");
      return;
    }
    if (!newCode.trim() || !newName.trim()) {
      setCreateErr("Completa código y nombre.");
      return;
    }
    const cycle = parseFloat(newCycle.replace(",", "."));
    if (!isFinite(cycle) || cycle <= 0) {
      setCreateErr("Ciclo ideal inválido (>0).");
      return;
    }

    setCreateErr(null);
    setCreating(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("machines")
        .insert({
          org_id: orgId,
          line_id: newLineId,
          code: newCode.trim(),
          name: newName.trim(),
          ideal_cycle_s: cycle,
          is_active: true,
        });
      if (error) throw error;
      setNewOpen(false);
      setNewCode("");
      setNewName("");
      setNewCycle("60");
      setNewLineId(lines.length === 1 ? lines[0].id : "");
      await loadMachines();
    } catch (e: any) {
      setCreateErr(friendlyPgError(e));
    } finally {
      setCreating(false);
    }
  }

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
    if (!editLineId) {
      setEditErr("Selecciona una línea.");
      return;
    }
    if (!editCode.trim() || !editName.trim()) {
      setEditErr("Completa código y nombre.");
      return;
    }
    const cycle = parseFloat(editCycle.replace(",", "."));
    if (!isFinite(cycle) || cycle <= 0) {
      setEditErr("Ciclo ideal inválido (>0).");
      return;
    }

    setEditErr(null);
    setEditSaving(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("machines")
        .update({
          line_id: editLineId,
          code: editCode.trim(),
          name: editName.trim(),
          ideal_cycle_s: cycle,
          is_active: editActive,
        })
        .eq("id", editMachine.id);
      if (error) throw error;
      setEditOpen(false);
      setEditMachine(null);
      await loadMachines();
    } catch (e: any) {
      setEditErr(friendlyPgError(e));
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(m: Machine) {
    try {
      await sb
        .schema("liwa")
        .from("machines")
        .update({ is_active: !m.is_active })
        .eq("id", m.id);
      await loadMachines();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Máquinas</h2>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, nombre o línea…"
            className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900"
          />
          <button
            onClick={() => setNewOpen(true)}
            className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900"
          >
            Nueva máquina
          </button>
        </div>
      </div>

      {newOpen && (
        <Modal title="Crear nueva máquina" onClose={() => setNewOpen(false)}>
          <form onSubmit={onCreateMachine} className="space-y-3">
            <Field label="Línea">
              {linesErr ? (
                <div className="text-xs text-red-400">{linesErr}</div>
              ) : lines.length <= 1 ? (
                <input
                  value={lines[0]?.name ?? "—"}
                  disabled
                  className="input"
                />
              ) : (
                <select
                  value={newLineId}
                  onChange={(e) => setNewLineId(e.target.value)}
                  className="input"
                >
                  <option value="">— Selecciona —</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Código">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="input"
                placeholder="Ej: M1"
              />
            </Field>
            <Field label="Nombre">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input"
                placeholder="Ej: Robot 1"
              />
            </Field>
            <Field label="Ciclo ideal (seg/ud)">
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0.001"
                value={newCycle}
                onChange={(e) => setNewCycle(e.target.value)}
                className="input"
                placeholder="Ej: 12.5"
              />
            </Field>
            {createErr && (
              <div className="text-xs text-red-400">{createErr}</div>
            )}
            <Actions onCancel={() => setNewOpen(false)} saving={creating} />
          </form>
        </Modal>
      )}

      {editOpen && editMachine && (
        <Modal
          title={`Editar máquina ${editMachine.code}`}
          onClose={() => setEditOpen(false)}
        >
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Línea (mover)">
              {lines.length <= 1 ? (
                <input
                  value={lines[0]?.name ?? "—"}
                  disabled
                  className="input"
                />
              ) : (
                <select
                  value={editLineId}
                  onChange={(e) => setEditLineId(e.target.value)}
                  className="input"
                >
                  <option value="">— Selecciona —</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Código">
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Nombre">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Ciclo ideal (seg/ud)">
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0.001"
                value={editCycle}
                onChange={(e) => setEditCycle(e.target.value)}
                className="input"
              />
            </Field>
            <div className="flex items-center gap-2">
              <input
                id="m-active"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              <label htmlFor="m-active" className="text-sm text-slate-300">
                Activa
              </label>
            </div>
            {editErr && (
              <div className="text-xs text-red-400">{editErr}</div>
            )}
            <Actions onCancel={() => setEditOpen(false)} saving={editSaving} />
          </form>
        </Modal>
      )}

      {loading ? (
        <SkeletonTable />
      ) : err ? (
        <div className="text-sm text-red-400">{err}</div>
      ) : filtered.length === 0 ? (
        <EmptyState hint="No hay máquinas. Crea una para comenzar." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr className="[&>th]:py-2 [&>th]:px-2">
              <th>Código</th>
              <th>Nombre</th>
              <th>Línea</th>
              <th>Ciclo ideal (s/ud)</th>
              <th>Activa</th>
              <th>Creada</th>
              <th className="text-right pr-2">Acciones</th>
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
                <td>
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString()
                    : "—"}
                </td>
                <td className="text-right">
                  <button className="link" onClick={() => openEdit(r)}>
                    Editar
                  </button>
                  <span className="mx-1 text-slate-600">/</span>
                  <button className="link" onClick={() => toggleActive(r)}>
                    {r.is_active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* =================== TURNOS (plantillas + asignar líneas HOY) =================== */
function ShiftsTab({
  parentClient,
}: {
  parentClient: ReturnType<typeof createClientComponentClient>;
}) {
  const supabase = parentClient;
  const sb = supabase as any;

  const [orgId, setOrgId] = useState<string | null>(null);

  // Plantillas de turno (UI)
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [q, setQ] = useState("");

  // Carga inicial desde BD
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Nueva plantilla
  const [newOpen, setNewOpen] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nCode, setNCode] = useState("");
  const [nName, setNName] = useState("");
  const [nStart, setNStart] = useState("06:00");
  const [nDur, setNDur] = useState("480");
  const [nOver, setNOver] = useState(false);

  // Editar plantilla
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eId, setEId] = useState<string>("");
  const [eCode, setECode] = useState("");
  const [eName, setEName] = useState("");
  const [eStart, setEStart] = useState("06:00");
  const [eDur, setEDur] = useState("480");
  const [eOver, setEOver] = useState(false);

  function computeStartEnd(hhmm: string, durationMinutes: number) {
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    const startMinutes = h * 60 + m;

    let dur = Math.floor(durationMinutes);
    if (!isFinite(dur) || dur < 1) dur = 1;
    if (dur > 1439) dur = 1439;

    let endMinutes = startMinutes + dur;
    if (endMinutes >= 24 * 60) {
      endMinutes -= 24 * 60;
    }

    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;

    const starts_at = `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:00`;
    const ends_at = `${endH.toString().padStart(2, "0")}:${endM
      .toString()
      .padStart(2, "0")}:00`;

    const overnight = endMinutes <= startMinutes;

    return { starts_at, ends_at, durationMinutes: dur, overnight };
  }

  function computeDurationFromTimes(starts_at: string, ends_at: string) {
    const [sh, sm] = starts_at.split(":").map((x) => Number(x));
    const [eh, em] = ends_at.split(":").map((x) => Number(x));

    const startTotal = sh * 60 + sm;
    const endTotal = eh * 60 + em;

    let diff = endTotal - startTotal;
    if (diff <= 0) diff += 24 * 60;

    const overnight = endTotal <= startTotal;
    const startHHmm = `${sh.toString().padStart(2, "0")}:${sm
      .toString()
      .padStart(2, "0")}`;

    return { durationMin: diff, overnight, startHHmm };
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) {
          if (mounted) {
            setOrgId(null);
            setTemplates([]);
            setLoadingTemplates(false);
          }
          return;
        }

        const { data: memberships, error } = await sb
          .schema("liwa")
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1);

        if (error) throw error;
        const oid = memberships?.[0]?.org_id ?? null;

        if (!mounted) return;
        setOrgId(oid);

        if (oid) {
          await loadTemplatesFromDb(oid);
        } else {
          setTemplates([]);
          setLoadingTemplates(false);
        }
      } catch (e: any) {
        if (!mounted) return;
        setOrgId(null);
        setTemplates([]);
        setLoadErr(e?.message ?? "No se pudieron cargar las plantillas.");
        setLoadingTemplates(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, sb]);

  async function loadTemplatesFromDb(oid: string) {
    try {
      setLoadingTemplates(true);
      setLoadErr(null);

      const { data, error } = await sb
        .schema("liwa")
        .from("shift_templates")
        .select(
          "id, org_id, code, name, starts_at, ends_at, is_active, created_at"
        )
        .eq("org_id", oid)
        .eq("is_active", true)
        .order("starts_at", { ascending: true });

      if (error) throw error;

      const mapped: ShiftTemplate[] =
        (data ?? []).map((t: any) => {
          const starts_at: string = t.starts_at;
          const ends_at: string = t.ends_at;
          const { durationMin, overnight, startHHmm } =
            computeDurationFromTimes(starts_at, ends_at);
          return {
            id: t.id,
            org_id: t.org_id,
            code: t.code ?? "",
            name: t.name ?? "",
            startHHmm,
            durationMin,
            tz: "local",
            overnight,
          };
        }) ?? [];

      setTemplates(mapped);
    } catch (e: any) {
      setTemplates([]);
      setLoadErr(e?.message ?? "Error al cargar las plantillas de turno.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter(
      (t) =>
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
    if (!orgId) {
      setNewErr("No se pudo determinar tu organización.");
      return;
    }

    const dur = Number(nDur);

    if (!nCode.trim() || !nName.trim()) {
      setNewErr("Completa código y nombre.");
      return;
    }
    if (!validHHmm(nStart)) {
      setNewErr("Hora inválida (HH:mm).");
      return;
    }
    if (!isFinite(dur) || dur < 1 || dur > 1439) {
      setNewErr("Duración inválida (1–1439 min).");
      return;
    }
    if (
      templates.some(
        (t) => t.code.toLowerCase() === nCode.trim().toLowerCase()
      )
    ) {
      setNewErr("Código duplicado.");
      return;
    }

    const { starts_at, ends_at, durationMinutes } = computeStartEnd(
      nStart,
      dur
    );

    setNewErr(null);
    setCreating(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("shift_templates")
        .insert({
          org_id: orgId,
          code: nCode.trim(),
          name: nName.trim(),
          starts_at,
          ends_at,
          is_active: true,
        });

      if (error) throw error;

      setNewOpen(false);
      setNCode("");
      setNName("");
      setNStart("06:00");
      setNDur(String(durationMinutes));
      setNOver(false);

      await loadTemplatesFromDb(orgId);
    } catch (e: any) {
      setNewErr(e?.message ?? "Error al crear plantilla.");
    } finally {
      setCreating(false);
    }
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!eId) return;
    if (!orgId) {
      setEditErr("No se pudo determinar tu organización.");
      return;
    }

    const dur = Number(eDur);

    if (!eCode.trim() || !eName.trim()) {
      setEditErr("Completa código y nombre.");
      return;
    }
    if (!validHHmm(eStart)) {
      setEditErr("Hora inválida (HH:mm).");
      return;
    }
    if (!isFinite(dur) || dur < 1 || dur > 1439) {
      setEditErr("Duración inválida (1–1439 min).");
      return;
    }
    if (
      templates.some(
        (t) =>
          t.id !== eId &&
          t.code.toLowerCase() === eCode.trim().toLowerCase()
      )
    ) {
      setEditErr("Código duplicado.");
      return;
    }

    const { starts_at, ends_at, durationMinutes } = computeStartEnd(
      eStart,
      dur
    );

    setEditErr(null);
    setSaving(true);
    try {
      const { error } = await sb
        .schema("liwa")
        .from("shift_templates")
        .update({
          code: eCode.trim(),
          name: eName.trim(),
          starts_at,
          ends_at,
        })
        .eq("id", eId)
        .eq("org_id", orgId);

      if (error) throw error;

      setEditOpen(false);
      setEDur(String(durationMinutes));
      await loadTemplatesFromDb(orgId);
    } catch (er: any) {
      setEditErr(er?.message ?? "Error al guardar plantilla.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(id: string) {
    if (!orgId) return;
    try {
      await sb
        .schema("liwa")
        .from("shift_templates")
        .update({ is_active: false })
        .eq("id", id)
        .eq("org_id", orgId);

      await loadTemplatesFromDb(orgId);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium">Turnos (plantillas)</h2>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, nombre u hora…"
              className="px-3 py-2 text-sm rounded-md border border-slate-800 bg-slate-900"
            />
            <button
              onClick={() => setNewOpen(true)}
              className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900"
            >
              Nueva plantilla
            </button>
          </div>
        </div>

        {loadingTemplates ? (
          <SkeletonTable />
        ) : loadErr ? (
          <div className="text-sm text-red-400">{loadErr}</div>
        ) : templates.length === 0 ? (
          <EmptyState hint="Aún no hay plantillas de turno. Crea una para comenzar." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr className="[&>th]:py-2 [&>th]:px-2">
                <th>Código</th>
                <th>Nombre</th>
                <th>Inicio</th>
                <th>Duración (min)</th>
                <th>Cruza 00:00</th>
                <th className="text-right pr-2">Acciones</th>
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
                    <button className="link" onClick={() => openEdit(t)}>
                      Editar
                    </button>
                    <span className="mx-1 text-slate-600">/</span>
                    <button
                      className="link"
                      onClick={() => removeTemplate(t.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {newOpen && (
          <Modal
            title="Nueva plantilla de turno"
            onClose={() => setNewOpen(false)}
          >
            <form onSubmit={createTemplate} className="space-y-3">
              <Field label="Código">
                <input
                  value={nCode}
                  onChange={(e) => setNCode(e.target.value)}
                  className="input"
                  placeholder="Ej: M"
                />
              </Field>
              <Field label="Nombre">
                <input
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  className="input"
                  placeholder="Ej: Mañana"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio (HH:mm)">
                  <input
                    value={nStart}
                    onChange={(e) => setNStart(e.target.value)}
                    className="input"
                    placeholder="06:00"
                  />
                </Field>
                <Field label="Duración (min)">
                  <input
                    type="number"
                    min={1}
                    max={1439}
                    step={1}
                    value={nDur}
                    onChange={(e) => setNDur(e.target.value)}
                    className="input"
                    placeholder="480"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="overnight-n"
                  type="checkbox"
                  checked={nOver}
                  onChange={(e) => setNOver(e.target.checked)}
                />
                <label
                  htmlFor="overnight-n"
                  className="text-sm text-slate-300"
                >
                  Cruza medianoche (solo informativo en UI)
                </label>
              </div>
              {newErr && (
                <div className="text-xs text-red-400">{newErr}</div>
              )}
              <Actions onCancel={() => setNewOpen(false)} saving={creating} />
            </form>
          </Modal>
        )}

        {editOpen && (
          <Modal
            title="Editar plantilla de turno"
            onClose={() => setEditOpen(false)}
          >
            <form onSubmit={saveTemplate} className="space-y-3">
              <Field label="Código">
                <input
                  value={eCode}
                  onChange={(e) => setECode(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Nombre">
                <input
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio (HH:mm)">
                  <input
                    value={eStart}
                    onChange={(e) => setEStart(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Duración (min)">
                  <input
                    type="number"
                    min={1}
                    max={1439}
                    step={1}
                    value={eDur}
                    onChange={(e) => setEDur(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="overnight-e"
                  type="checkbox"
                  checked={eOver}
                  onChange={(e) => setEOver(e.target.checked)}
                />
                <label
                  htmlFor="overnight-e"
                  className="text-sm text-slate-300"
                >
                  Cruza medianoche (solo informativo en UI)
                </label>
              </div>
              {editErr && (
                <div className="text-xs text-red-400">{editErr}</div>
              )}
              <Actions onCancel={() => setEditOpen(false)} saving={saving} />
            </form>
          </Modal>
        )}
      </div>

      {/* Panel de asignación de líneas (BD) */}
      <AssignLinesPanel />
    </div>
  );
}

/** Panel para asignar líneas a una plantilla (usa endpoint /api/shifts/templates/[id]/lines) */
function AssignLinesPanel() {
  const supabase = createClientComponentClient() as any;
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; plant_id: string }>
  >([]);
  const [lines, setLines] = useState<
    Array<{ id: string; code: string; name: string; plant_id: string }>
  >([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [{ data: tpls }, { data: lns }] = await Promise.all([
          supabase
            .schema("liwa")
            .from("shift_templates")
            .select("id,name,plant_id")
            .eq("is_active", true)
            .order("created_at"),
          supabase
            .schema("liwa")
            .from("lines")
            .select("id,code,name,plant_id")
            .eq("is_active", true)
            .order("code"),
        ]);
        if (!mounted) return;
        setTemplates(tpls ?? []);
        setLines(lns ?? []);
        if ((tpls ?? []).length) setTemplateId((tpls ?? [])[0].id);
        if ((lns ?? []).length) setSelected([(lns ?? [])[0].id]);
      } catch (e: any) {
        setMsg(`Error cargando datos: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  async function save() {
    try {
      setMsg("Guardando…");
      const res = await fetch(`/api/shifts/templates/${templateId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: selected }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Error guardando");
      const a = j.result?.[0]?.added_cnt ?? 0;
      const r = j.result?.[0]?.removed_cnt ?? 0;
      setMsg(`OK ✓ (añadidas: ${a}, quitadas: ${r})`);
    } catch (e: any) {
      setMsg(`Error: ${e.message || e}`);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 p-4 space-y-4">
      <div className="text-sm font-semibold">
        Asignar líneas a plantilla (BD)
      </div>
      {loading ? (
        <div className="text-sm opacity-70">Cargando…</div>
      ) : (
        <>
          <label className="text-xs opacity-70">Plantilla</label>
          <select
            className="w-full rounded-lg border border-neutral-700 bg-transparent p-2"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="text-xs opacity-70">Líneas</div>
          <div className="grid grid-cols-2 gap-2">
            {lines.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-2 rounded-lg border border-neutral-800 p-2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(l.id)}
                  onChange={() => toggle(l.id)}
                />
                <span className="text-sm">
                  {l.code} · {l.name}
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={save}
            disabled={!templateId}
            className="rounded-xl border border-emerald-600 px-3 py-2 text-sm hover:bg-emerald-600/10 disabled:opacity-50"
          >
            Guardar líneas de la plantilla
          </button>

          <div className="text-xs opacity-70">{msg}</div>
        </>
      )}
    </div>
  );
}

/* =================== CALENDARIO (BD - editable) =================== */
function CalendarTab({
  parentClient,
}: {
  parentClient: ReturnType<typeof createClientComponentClient>;
}) {
  const supabase = parentClient;
  const sb = supabase as any;

  type CalendarInstance = {
    id: string;
    template_id: string | null;
    template_code: string | null;
    template_name: string | null;
    starts_at: string;
    ends_at: string;
    line_count: number;
  };

  type CalendarDay = {
    date: string; // YYYY-MM-DD
    instances: CalendarInstance[];
  };

  type LiteTemplate = {
    id: string;
    code: string;
    name: string;
  };

  type PlantLine = {
    id: string;
    code: string;
    name: string;
  };

  const [orgId, setOrgId] = useState<string | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantId, setPlantId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Datos para el modal (plantillas, líneas, etc.)
  const [templates, setTemplates] = useState<LiteTemplate[]>([]);
  const [lines, setLines] = useState<PlantLine[]>([]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalMsg, setModalMsg] = useState<string>("");

  // Formulario "nuevo turno"
  const [newTemplateId, setNewTemplateId] = useState<string>("");
  const [modalScope, setModalScope] = useState<"plant" | "lines">("plant");
  const [modalLineIds, setModalLineIds] = useState<string[]>([]);

  // Edición de plantillas por instancia
  const [editTemplates, setEditTemplates] =
    useState<Record<string, string>>({});

  // 1) Obtener org_id y plantas
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;
        if (!userId) {
          if (mounted) {
            setOrgId(null);
            setPlants([]);
          }
          return;
        }

        const { data: memberships, error } = await sb
          .schema("liwa")
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1);
        if (error) throw error;

        const oid = memberships?.[0]?.org_id ?? null;
        if (!mounted) return;
        setOrgId(oid);

        if (oid) {
          const { data: prows, error: e2 } = await sb
            .schema("liwa")
            .from("plants")
            .select("id, name")
            .eq("org_id", oid)
            .order("name");
          if (e2) throw e2;
          setPlants(prows ?? []);
          if ((prows ?? []).length === 1) {
            setPlantId((prows ?? [])[0].id as string);
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "No se pudieron cargar plantas.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabase, sb]);

  // 2) Cargar calendario desde el endpoint /api/shifts/calendar
  useEffect(() => {
    if (!plantId) {
      setDays([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setLoadErr(null);

        const year = month.getFullYear();
        const m = month.getMonth();
        const fromDate = new Date(year, m, 1);
        const toDate = new Date(year, m + 1, 0);
        const fmt = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(d.getDate()).padStart(2, "0")}`;

        const from = fmt(fromDate);
        const to = fmt(toDate);

        const res = await fetch(
          `/api/shifts/calendar?plant_id=${plantId}&from=${from}&to=${to}`
        );
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          throw new Error(j.error || "Error cargando calendario");
        }
        setDays((j.days ?? []) as CalendarDay[]);
      } catch (e: any) {
        if (!cancelled) {
          setLoadErr(e?.message ?? String(e));
          setDays([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plantId, month]);

  // 2.b) Recargar calendario tras crear/editar/borrar
  async function reloadCalendar() {
    if (!plantId) return;
    try {
      const year = month.getFullYear();
      const m = month.getMonth();
      const fromDate = new Date(year, m, 1);
      const toDate = new Date(year, m + 1, 0);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;

      const from = fmt(fromDate);
      const to = fmt(toDate);

      const res = await fetch(
        `/api/shifts/calendar?plant_id=${plantId}&from=${from}&to=${to}`
      );
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Error recargando calendario");
      }
      setDays((j.days ?? []) as CalendarDay[]);
    } catch (e: any) {
      setLoadErr(e?.message ?? String(e));
      setDays([]);
    }
  }

  // 3) Cargar plantillas y líneas para la planta seleccionada
  useEffect(() => {
    if (!orgId || !plantId) {
      setTemplates([]);
      setLines([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const [{ data: tpls, error: tErr }, { data: lns, error: lErr }] =
          await Promise.all([
            sb
              .schema("liwa")
              .from("shift_templates")
              .select("id, code, name, is_active, org_id")
              .eq("org_id", orgId)
              .eq("is_active", true)
              .order("starts_at", { ascending: true }),
            sb
              .schema("liwa")
              .from("lines")
              .select("id, code, name, plant_id, is_active")
              .eq("plant_id", plantId)
              .eq("is_active", true)
              .order("code"),
          ]);
        if (cancelled) return;
        if (tErr) throw tErr;
        if (lErr) throw lErr;

        setTemplates(
          (tpls ?? []).map((t: any) => ({
            id: t.id as string,
            code: (t.code ?? "") as string,
            name: (t.name ?? "") as string,
          }))
        );
        setLines(
          (lns ?? []).map((l: any) => ({
            id: l.id as string,
            code: (l.code ?? "") as string,
            name: (l.name ?? "") as string,
          }))
        );
      } catch (e) {
        if (!cancelled) {
          setTemplates([]);
          setLines([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, plantId, sb]);

  // 4) Helpers para pintar calendario
  function daysGrid(d: Date) {
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const startIdx = (start.getDay() + 6) % 7; // Lunes=0
    const totalDays = end.getDate();
    const cells: Array<{ iso?: string; day?: number; inMonth: boolean }> = [];
    for (let i = 0; i < startIdx; i++) cells.push({ inMonth: false });
    for (let day = 1; day <= totalDays; day++) {
      cells.push({
        inMonth: true,
        day,
        iso: isoDay(start.getFullYear(), start.getMonth(), day),
      });
    }
    while (cells.length % 7 !== 0) cells.push({ inMonth: false });
    return cells;
  }

  const cells = useMemo(() => daysGrid(month), [month]);

  const templateSummary = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const d of days) {
      for (const inst of d.instances) {
        const key =
          inst.template_id || inst.template_name || inst.template_code;
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, {
            code:
              inst.template_code ??
              (inst.template_name ? inst.template_name[0] : "?"),
            name: inst.template_name ?? "(sin nombre)",
          });
        }
      }
    }
    return Array.from(map.values());
  }, [days]);

  // 🔑 Día seleccionado: siempre desde `days`, sin Map intermedio
  const selectedDayData = useMemo(
    () =>
      selectedDate
        ? days.find((d) => d.date === selectedDate) ?? null
        : null,
    [days, selectedDate]
  );

  const currentPlantName = useMemo(
    () => plants.find((p) => p.id === plantId)?.name ?? "",
    [plants, plantId]
  );

  // ⚙️ fmtTime: sin Date(), solo lee HH:mm del string ISO
  function fmtTime(s: string) {
    if (!s) return "—";
    const match = s.match(/T(\d{2}:\d{2})/);
    if (match) return match[1]; // HH:mm
    if (s.length >= 16) return s.slice(11, 16); // fallback
    return s;
  }

  function resetNewTurnForm() {
    setNewTemplateId("");
    setModalScope("plant");
    setModalLineIds([]);
  }

  function toggleLine(id: string) {
    setModalLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function onSelectDay(iso?: string) {
    if (!iso) return;
    setSelectedDate(iso);
    setModalMsg("");
  }

  // Acciones API: crear / editar / borrar
  async function handleAddShift() {
    if (!selectedDate || !plantId) return;
    if (!newTemplateId) {
      setModalMsg("Selecciona una plantilla para el nuevo turno.");
      return;
    }
    if (modalScope === "lines" && modalLineIds.length === 0) {
      setModalMsg("Selecciona al menos una línea.");
      return;
    }

    setModalSaving(true);
    setModalMsg("Creando turno…");
    try {
      const res = await fetch("/api/shifts/calendar/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          plant_id: plantId,
          date: selectedDate,
          template_id: newTemplateId,
          scope: modalScope,
          line_ids: modalScope === "lines" ? modalLineIds : [],
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Error creando turno.");
      }
      setModalMsg("Turno creado correctamente.");
      resetNewTurnForm();
      await reloadCalendar();
    } catch (e: any) {
      setModalMsg(e?.message ?? "Error creando turno.");
    } finally {
      setModalSaving(false);
    }
  }

  function handleEditTemplateChange(instanceId: string, value: string) {
    setEditTemplates((prev) => ({ ...prev, [instanceId]: value }));
  }

  async function handleApplyEditTemplate(instanceId: string) {
    if (!plantId) return;
    const template_id = editTemplates[instanceId];
    if (!template_id) {
      setModalMsg("Selecciona una plantilla para aplicar al turno.");
      return;
    }

    setModalSaving(true);
    setModalMsg("Actualizando turno…");
    try {
      const res = await fetch("/api/shifts/calendar/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "edit",
          instance_id: instanceId,
          template_id,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Error actualizando turno.");
      }
      setModalMsg("Turno actualizado.");
      await reloadCalendar();
    } catch (e: any) {
      setModalMsg(e?.message ?? "Error actualizando turno.");
    } finally {
      setModalSaving(false);
    }
  }

  async function handleDeleteShift(id: string) {
    if (!plantId) return;
    setModalSaving(true);
    setModalMsg("Eliminando turno…");
    try {
      const res = await fetch("/api/shifts/calendar/instances", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Error eliminando turno.");
      }
      setModalMsg("Turno eliminado.");
      await reloadCalendar();
    } catch (e: any) {
      setModalMsg(e?.message ?? "Error eliminando turno.");
    } finally {
      setModalSaving(false);
    }
  }

  const selectedInstances = selectedDayData?.instances ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-lg font-medium">Calendario de turnos</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            ← Mes anterior
          </button>
          <div className="text-sm text-slate-300 min-w-[160px] text-center">
            {month.toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-900"
            onClick={() => setMonth(addMonths(month, +1))}
          >
            Mes siguiente →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Field label="Planta">
          {err ? (
            <div className="text-xs text-red-400">{err}</div>
          ) : plants.length <= 1 ? (
            <input
              value={plants[0]?.name ?? "—"}
              disabled
              className="input"
            />
          ) : (
            <select
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="input"
            >
              <option value="">— Selecciona —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Plantillas detectadas en el mes">
          <div className="flex gap-2 flex-wrap">
            {templateSummary.length ? (
              templateSummary.map((t) => (
                <span
                  key={t.code + t.name}
                  className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300"
                >
                  {t.code} · {t.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">
                No hay turnos en este rango de fechas.
              </span>
            )}
          </div>
        </Field>
      </div>

      {/* Grid calendario */}
      {!plantId ? (
        <EmptyState hint="Selecciona una planta para ver el calendario." />
      ) : loading ? (
        <SkeletonTable />
      ) : loadErr ? (
        <div className="text-sm text-red-400">{loadErr}</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="grid grid-cols-7 text-xs bg-slate-950/70 text-slate-400">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 border-b border-slate-800 text-center"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, idx) => {
              if (!c.inMonth)
                return (
                  <div
                    key={idx}
                    className="h-24 border-b border-slate-800 bg-slate-950/40"
                  />
                );
              // Día desde `days` directamente
              const day = c.iso
                ? days.find((d) => d.date === c.iso)
                : undefined;
              const instances = day?.instances ?? [];
              const visible = instances.slice(0, 3);

              return (
                <button
                  key={c.iso}
                  onClick={() => onSelectDay(c.iso)}
                  className="h-24 text-left p-2 border-b border-slate-800 border-r last:border-r-0 hover:bg-white/[0.04]"
                >
                  <div className="text-xs text-slate-400">{c.day}</div>
                  {instances.length === 0 ? (
                    <div className="mt-1 text-[11px] text-slate-500">—</div>
                  ) : (
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px] leading-tight">
                      {visible.map((inst) => {
                        const code =
                          inst.template_code ??
                          (inst.template_name
                            ? inst.template_name[0]
                            : "?");
                        return (
                          <div
                            key={inst.id}
                            className="flex items-center gap-1 truncate"
                          >
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] font-mono">
                              {code}
                            </span>
                            <span className="truncate text-slate-300">
                              {fmtTime(inst.starts_at)}–
                              {fmtTime(inst.ends_at)}
                            </span>
                            {inst.line_count > 0 && (
                              <span className="text-[9px] text-emerald-400 shrink-0">
                                {inst.line_count}L
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {instances.length > 3 && (
                        <div className="text-[10px] text-slate-500">
                          +{instances.length - 3} turno
                          {instances.length - 3 > 1 ? "s" : ""} más…
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de detalle (siempre que haya fecha seleccionada, aunque no haya turnos) */}
      {selectedDate && (
        <Modal
          title={`Turnos del ${new Date(
            selectedDate
          ).toLocaleDateString("es-ES")}`}
          onClose={() => {
            setSelectedDate(null);
            setModalMsg("");
            resetNewTurnForm();
          }}
        >
          <div className="space-y-4 text-sm">
            <div className="text-xs text-slate-400">
              Planta: <span className="text-slate-200">{currentPlantName}</span>
            </div>

            {/* Turnos existentes */}
            {selectedInstances.length === 0 ? (
              <div className="text-sm text-slate-400">
                No hay turnos configurados para este día.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedInstances.map((inst) => (
                  <div
                    key={inst.id}
                    className="border border-slate-800 rounded-md p-2 space-y-2"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {inst.template_name ?? "(sin nombre)"}
                        </div>
                        <div className="text-xs text-slate-400">
                          Horario: {fmtTime(inst.starts_at)} –{" "}
                          {fmtTime(inst.ends_at)}
                        </div>
                        <div className="text-xs text-slate-400">
                          Ámbito:{" "}
                          {inst.line_count > 0
                            ? `${inst.line_count} línea${
                                inst.line_count > 1 ? "s" : ""
                              }`
                            : "Planta completa"}
                        </div>
                      </div>
                      <button
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => handleDeleteShift(inst.id)}
                        disabled={modalSaving}
                      >
                        Eliminar
                      </button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                      <select
                        className="input text-xs"
                        value={
                          editTemplates[inst.id] ??
                          inst.template_id ??
                          ""
                        }
                        onChange={(e) =>
                          handleEditTemplateChange(
                            inst.id,
                            e.target.value
                          )
                        }
                      >
                        <option value="">
                          — Mantener plantilla actual —
                        </option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="px-3 py-1 text-xs rounded-md border border-sky-600 hover:bg-sky-600/10 disabled:opacity-60"
                        onClick={() => handleApplyEditTemplate(inst.id)}
                        disabled={
                          modalSaving ||
                          !(editTemplates[inst.id] ?? inst.template_id)
                        }
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nueva instancia para este día */}
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div className="text-sm font-medium">
                Nuevo turno para este día
              </div>

              <Field label="Plantilla">
                <select
                  className="input"
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ámbito">
                <div className="flex items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="scope"
                      value="plant"
                      checked={modalScope === "plant"}
                      onChange={() => setModalScope("plant")}
                    />
                    <span>Planta completa</span>
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="scope"
                      value="lines"
                      checked={modalScope === "lines"}
                      onChange={() => setModalScope("lines")}
                    />
                    <span>Líneas específicas</span>
                  </label>
                </div>
              </Field>

              {modalScope === "lines" && (
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">
                    Selecciona líneas:
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-auto">
                    {lines.map((l) => (
                      <label
                        key={l.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={modalLineIds.includes(l.id)}
                          onChange={() => toggleLine(l.id)}
                        />
                        <span>
                          {l.code} · {l.name}
                        </span>
                      </label>
                    ))}
                    {lines.length === 0 && (
                      <div className="text-[11px] text-slate-500 col-span-2">
                        No hay líneas activas en esta planta.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalMsg && (
                <div className="text-[11px] text-slate-400">
                  {modalMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-700"
                  onClick={() => {
                    resetNewTurnForm();
                    setModalMsg("");
                  }}
                  disabled={modalSaving}
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded-md bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60"
                  onClick={handleAddShift}
                  disabled={modalSaving}
                >
                  Añadir turno
                </button>
              </div>

              <div className="text-[11px] text-slate-500 pt-1">
                Esta vista actualiza <code>shift_instances</code> y{" "}
                <code>shift_instance_lines</code>. Los turnos se usan
                automáticamente por la ingesta de producción y paros.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =================== UI HELPERS COMUNES =================== */

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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text_base font-semibold">{title}</h3>
          <button
            className="text-slate-400 hover:text-slate-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Actions({
  onCancel,
  saving,
}: {
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-2 text-sm rounded-md border border-slate-800"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-3 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

