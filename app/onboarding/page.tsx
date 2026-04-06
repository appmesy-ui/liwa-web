// app/onboarding/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const sb = createClientComponentClient() as any;

/* ── tipos ── */
type Machine = { code: string; name: string; ideal_cycle_s: string };

/* ── helpers ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
    />
  );
}

function Btn({
  children,
  disabled,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "border border-slate-700 text-slate-300 hover:bg-slate-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ── pasos ── */
const STEPS = ["Línea", "Máquinas", "Turno", "Listo"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plantId, setPlantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Step 1 — Línea
  const [lineCode, setLineCode] = useState("");
  const [lineName, setLineName] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);

  // Step 2 — Máquinas
  const [machines, setMachines] = useState<Machine[]>([
    { code: "", name: "", ideal_cycle_s: "" },
  ]);

  // Step 3 — Turno
  const [shiftName, setShiftName] = useState("Turno mañana");
  const [shiftCode, setShiftCode] = useState("T1");
  const [shiftStart, setShiftStart] = useState("06:00");
  const [shiftDuration, setShiftDuration] = useState("480");

  /* Obtener org y plant del usuario */
  useEffect(() => {
    (async () => {
      const { data: userRes } = await sb.auth.getUser();
      if (!userRes?.user) { router.replace("/signin"); return; }

      const { data: memberships } = await sb
        .schema("liwa")
        .from("org_members")
        .select("org_id")
        .eq("user_id", userRes.user.id)
        .limit(1);

      const oid = memberships?.[0]?.org_id ?? null;
      if (!oid) return;
      setOrgId(oid);

      // Obtener la primera planta
      const { data: plants } = await sb
        .schema("liwa")
        .from("plants")
        .select("id")
        .eq("org_id", oid)
        .limit(1);
      setPlantId(plants?.[0]?.id ?? null);
    })();
  }, []);

  /* ── Step 1: crear línea ── */
  async function saveLineAndNext() {
    if (!lineCode.trim() || !lineName.trim()) { setErr("Completa código y nombre de la línea"); return; }
    if (!orgId || !plantId) { setErr("No se encontró organización o planta"); return; }
    setSaving(true); setErr(null);

    const { data, error } = await sb.schema("liwa").from("lines").insert({
      org_id: orgId,
      plant_id: plantId,
      code: lineCode.trim().toUpperCase(),
      name: lineName.trim(),
      is_active: true,
    }).select().single();

    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setErr(`Ya existe una línea con el código "${lineCode.trim().toUpperCase()}". Usa un código diferente.`);
      } else {
        setErr(error.message);
      }
      return;
    }
    setLineId(data.id);
    setStep(1);
  }

  /* ── Step 2: crear máquinas ── */
  function updateMachine(i: number, field: keyof Machine, value: string) {
    setMachines(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  function addMachineRow() {
    setMachines(prev => [...prev, { code: "", name: "", ideal_cycle_s: "" }]);
  }

  function removeMachineRow(i: number) {
    setMachines(prev => prev.filter((_, idx) => idx !== i));
  }

  async function saveMachinesAndNext() {
    const valid = machines.filter(m => m.code.trim() && m.name.trim());
    if (valid.length === 0) { setStep(2); return; } // skip si no hay máquinas
    if (!orgId || !lineId) { setErr("Falta línea creada"); return; }
    setSaving(true); setErr(null);

    const rows = valid.map(m => ({
      org_id: orgId,
      line_id: lineId,
      code: m.code.trim().toUpperCase(),
      name: m.name.trim(),
      ideal_cycle_s: m.ideal_cycle_s ? Number(m.ideal_cycle_s) : null,
      is_active: true,
    }));

    const { error } = await sb.schema("liwa").from("machines").insert(rows);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setStep(2);
  }

  /* ── Step 3: crear turno ── */
  async function saveShiftAndNext() {
    if (!shiftCode.trim() || !shiftName.trim()) { setErr("Completa código y nombre del turno"); return; }
    if (!orgId) { setErr("No se encontró organización"); return; }
    setSaving(true); setErr(null);

    // Calcular starts_at / ends_at igual que Settings
    const [hStr, mStr] = shiftStart.split(":");
    const h = Number(hStr); const m = Number(mStr);
    const dur = Math.min(1439, Math.max(1, Number(shiftDuration) || 480));
    const startMin = h * 60 + m;
    let endMin = startMin + dur;
    if (endMin >= 24 * 60) endMin -= 24 * 60;
    const endH = Math.floor(endMin / 60); const endM = endMin % 60;
    const starts_at = `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:00`;
    const ends_at   = `${endH.toString().padStart(2,"0")}:${endM.toString().padStart(2,"0")}:00`;
    const overnight = endMin <= startMin;

    const { error } = await sb.schema("liwa").from("shift_templates").insert({
      org_id: orgId,
      plant_id: plantId,
      code: shiftCode.trim().toUpperCase(),
      name: shiftName.trim(),
      starts_at,
      ends_at,
      is_active: true,
    });

    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setErr(`Ya existe un turno con el código "${shiftCode.trim().toUpperCase()}". Usa un código diferente.`);
      } else {
        setErr(error.message);
      }
      return;
    }
    setStep(3);
  }

  /* ── render ── */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      {/* Logo / título */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Bienvenido a Liwa</h1>
        <p className="text-slate-400 mt-1 text-sm">Configura tu planta en 3 pasos</p>
      </div>

      {/* Barra de progreso */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex justify-between mb-2">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={[
                "text-xs font-medium",
                i <= step ? "text-sky-400" : "text-slate-600",
              ].join(" ")}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-500"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Tarjeta */}
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        {err && (
          <div className="mb-4 rounded-md bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-300">
            {err}
          </div>
        )}

        {/* STEP 0 — Línea */}
        {step === 0 && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">Tu primera línea de producción</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Una línea agrupa las máquinas que trabajan juntas para producir un producto.
              </p>
            </div>
            <Field label="Código de línea (ej: L1, ENVASADO)">
              <Input
                autoFocus
                placeholder="L1"
                value={lineCode}
                onChange={e => setLineCode(e.target.value)}
              />
            </Field>
            <Field label="Nombre de la línea">
              <Input
                placeholder="Línea de envasado"
                value={lineName}
                onChange={e => setLineName(e.target.value)}
              />
            </Field>
            <div className="flex justify-end pt-2">
              <Btn onClick={saveLineAndNext} disabled={saving}>
                {saving ? "Guardando…" : "Siguiente →"}
              </Btn>
            </div>
          </div>
        )}

        {/* STEP 1 — Máquinas */}
        {step === 1 && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">Máquinas de la línea</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Añade las máquinas que componen la línea <strong>{lineName}</strong>.
                Puedes añadir más después desde Configuración.
              </p>
            </div>
            <div className="grid gap-2">
              {machines.map((m, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="Código (ej: M1)"
                    value={m.code}
                    onChange={e => updateMachine(i, "code", e.target.value)}
                    className="w-24 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  <Input
                    placeholder="Nombre"
                    value={m.name}
                    onChange={e => updateMachine(i, "name", e.target.value)}
                    className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  <Input
                    placeholder="Ciclo ideal (s)"
                    type="number"
                    value={m.ideal_cycle_s}
                    onChange={e => updateMachine(i, "ideal_cycle_s", e.target.value)}
                    className="w-28 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  {machines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMachineRow(i)}
                      className="mt-2 text-slate-500 hover:text-red-400 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addMachineRow}
              className="text-sm text-sky-400 hover:text-sky-300 text-left"
            >
              + Añadir otra máquina
            </button>
            <div className="flex justify-between pt-2">
              <Btn variant="ghost" onClick={() => setStep(2)}>
                Saltar este paso
              </Btn>
              <Btn onClick={saveMachinesAndNext} disabled={saving}>
                {saving ? "Guardando…" : "Siguiente →"}
              </Btn>
            </div>
          </div>
        )}

        {/* STEP 2 — Turno */}
        {step === 2 && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">Configura un turno</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Define el horario de producción. Podrás añadir más turnos desde Configuración.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código de turno">
                <Input
                  placeholder="T1"
                  value={shiftCode}
                  onChange={e => setShiftCode(e.target.value)}
                />
              </Field>
              <Field label="Nombre">
                <Input
                  placeholder="Turno mañana"
                  value={shiftName}
                  onChange={e => setShiftName(e.target.value)}
                />
              </Field>
              <Field label="Hora de inicio">
                <Input
                  type="time"
                  value={shiftStart}
                  onChange={e => setShiftStart(e.target.value)}
                />
              </Field>
              <Field label="Duración (minutos)">
                <Input
                  type="number"
                  placeholder="480"
                  value={shiftDuration}
                  onChange={e => setShiftDuration(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              {shiftDuration ? `${Math.floor(Number(shiftDuration) / 60)}h ${Number(shiftDuration) % 60}min` : ""}{" "}
              · Podrás asignar este turno a las líneas desde Configuración → Calendario.
            </p>
            <div className="flex justify-between pt-2">
              <Btn variant="ghost" onClick={() => setStep(3)}>
                Saltar este paso
              </Btn>
              <Btn onClick={saveShiftAndNext} disabled={saving}>
                {saving ? "Guardando…" : "Finalizar →"}
              </Btn>
            </div>
          </div>
        )}

        {/* STEP 3 — Listo */}
        {step === 3 && (
          <div className="text-center grid gap-4 py-4">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-semibold">¡Tu planta está lista!</h2>
            <p className="text-sm text-slate-400">
              Ya puedes ver el dashboard, clasificar paros y empezar a medir el OEE de tu producción.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Btn onClick={() => router.push("/dashboard")}>
                Ir al dashboard →
              </Btn>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Seguir configurando en Ajustes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
