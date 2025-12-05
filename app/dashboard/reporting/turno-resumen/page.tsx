// app/dashboard/reporting/turno-resumen/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ==== Tipos de datos ==== */
type ShiftSummary = {
  availability: number; // 0–1
  performance: number;  // 0–1
  quality: number;      // 0–1
  oee: number;          // 0–1

  units_total: number;
  units_good: number;
  units_scrap: number;

  planned_runtime_min?: number | null;
  run_time_min?: number | null;
  downtime_min?: number | null;
};

type ShiftSummaryResponse = {
  ok: boolean;
  error?: string | null;
  data?: ShiftSummary | null;
};

type Plant = { id: string; name: string };
type Line = { id: string; code: string; name: string };
type ShiftTemplate = { id: string; code: string; name: string };

/* ==== Página ==== */
export default function TurnoResumenReportPage() {
  const supabase = createClientComponentClient();
  const sb = supabase as any;

  // Contexto de organización / planta / catálogo
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);

  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Filtros
  const [selectedLineCodes, setSelectedLineCodes] = useState<string[]>([]);
  const [shiftTemplateId, setShiftTemplateId] = useState("");
  const [shiftDate, setShiftDate] = useState(""); // YYYY-MM-DD

  // Resultado
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTried, setHasTried] = useState(false);

  /* ============================
   * 1) Cargar org_id, planta, turnos y líneas desde las MISMAS tablas que Settings
   * ============================ */
  useEffect(() => {
    let mounted = true;

    async function loadMeta() {
      try {
        setMetaLoading(true);
        setMetaError(null);

        // 1) org_id desde org_members (igual que en Settings)
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes?.user?.id ?? null;

        if (!userId) {
          throw new Error("No se pudo determinar el usuario actual (sin sesión).");
        }

        const { data: memberships, error: errMember } = await sb
          .schema("liwa")
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1);

        if (errMember) throw errMember;

        const oid = memberships?.[0]?.org_id ?? null;
        if (!oid) {
          throw new Error("No se pudo determinar tu organización (org_id).");
        }

        if (!mounted) return;
        setOrgId(oid);

        // 2) plantas de esa org (igual patrón que LinesTab/CalendarTab)
        const { data: plants, error: errPlants } = await sb
          .schema("liwa")
          .from("plants")
          .select("id, name")
          .eq("org_id", oid)
          .order("name");

        if (errPlants) throw errPlants;

        if (!plants || plants.length === 0) {
          throw new Error(
            "No hay ninguna planta configurada. Crea al menos una en Configuración → Planta."
          );
        }

        const firstPlant = plants[0] as any;
        const currentPlant: Plant = {
          id: firstPlant.id as string,
          name: (firstPlant.name as string) ?? "Planta",
        };

        if (!mounted) return;
        setPlant(currentPlant);

        // 3) plantillas de turno activas de esa org (igual patrón que ShiftsTab)
        const { data: shifts, error: errShifts } = await sb
          .schema("liwa")
          .from("shift_templates")
          .select("id, org_id, code, name, is_active")
          .eq("org_id", oid)
          .eq("is_active", true)
          .order("code", { ascending: true });

        if (errShifts) throw errShifts;

        const templates: ShiftTemplate[] =
          (shifts ?? []).map((t: any) => ({
            id: t.id as string,
            code: (t.code as string) ?? "",
            name: (t.name as string) ?? "",
          })) ?? [];

        if (!mounted) return;
        setShiftTemplates(templates);

        // 4) líneas activas de esa planta (igual patrón que LinesTab)
        const { data: linesData, error: errLines } = await sb
          .schema("liwa")
          .from("lines")
          .select("id, code, name, plant_id, is_active")
          .eq("plant_id", currentPlant.id)
          .eq("is_active", true)
          .order("code", { ascending: true });

        if (errLines) throw errLines;

        const linesList: Line[] =
          (linesData ?? []).map((ln: any) => ({
            id: ln.id as string,
            code: (ln.code as string) ?? "",
            name: (ln.name as string) ?? "",
          })) ?? [];

        if (!mounted) return;
        setLines(linesList);
        setSelectedLineCodes(linesList.map((l) => l.code));
      } catch (err: any) {
        if (!mounted) return;
        console.error("[turno-resumen] Error al cargar metadatos:", err);
        setMetaError(
          err?.message ||
            "No se pudo cargar la planta actual, los turnos o las líneas configuradas."
        );
      } finally {
        if (mounted) setMetaLoading(false);
      }
    }

    loadMeta();

    return () => {
      mounted = false;
    };
  }, [supabase, sb]);

  /* ============================
   * Helpers de selección de líneas
   * ============================ */
  function toggleLine(code: string) {
    setSelectedLineCodes((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  }

  function selectAllLines() {
    setSelectedLineCodes(lines.map((l) => l.code));
  }

  function clearLines() {
    setSelectedLineCodes([]);
  }

  /* ============================
   * 2) Aplicar filtros → llamar a /api/reporting/turno-resumen
   * ============================ */
  async function handleApplyFilters(e: FormEvent) {
    e.preventDefault();
    setHasTried(true);
    setError(null);
    setSummary(null);

    try {
      if (!plant) {
        throw new Error(
          "No se ha podido determinar la planta actual. Revisa Configuración → Planta."
        );
      }
      if (!shiftTemplateId || !shiftDate) {
        throw new Error("Debes seleccionar turno y día del turno.");
      }
      if (!lines.length) {
        throw new Error(
          "No hay líneas configuradas para la planta. Configúralas en Configuración → Líneas."
        );
      }

      const effectiveLines =
        selectedLineCodes.length > 0
          ? selectedLineCodes
          : lines.map((l) => l.code);

      if (!effectiveLines.length) {
        throw new Error(
          "Debes seleccionar al menos una línea para generar el informe."
        );
      }

      const primaryLine = effectiveLines[0]; // de momento 1 línea → la primera

      const params = new URLSearchParams();
      params.set("plantId", plant.id);
      params.set("lineId", primaryLine);
      params.set("shiftTemplateId", shiftTemplateId);
      params.set("shiftDate", `${shiftDate}T12:00`);

      setLoading(true);

      const res = await fetch(
        `/api/reporting/turno-resumen?${params.toString()}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el resumen del turno (HTTP ${res.status}).`
        );
      }

      const json = (await res.json()) as ShiftSummaryResponse;
      if (!json.ok || !json.data) {
        throw new Error(
          json.error || "No se encontraron datos para ese turno."
        );
      }

      setSummary(json.data);
    } catch (err: any) {
      console.error("Error al cargar resumen de turno:", err);
      setError(err?.message || "Error de red al cargar el informe.");
    } finally {
      setLoading(false);
    }
  }

  /* ============================
   * Helpers de formato
   * ============================ */
  function formatPct(value?: number | null) {
    if (value === null || value === undefined) return "--.-%";
    const pct = value * 100;
    return `${pct.toFixed(1)}%`;
  }

  function formatNumber(value?: number | null) {
    if (value === null || value === undefined) return "--";
    return value.toLocaleString("es-ES");
  }

  function formatMinutes(value?: number | null) {
    if (value === null || value === undefined) return "-- min";
    return `${value.toFixed(1)} min`;
  }

  function progressWidth(value?: number | null) {
    if (value === null || value === undefined) return "0%";
    const pct = Math.max(0, Math.min(100, value * 100));
    return `${pct}%`;
  }

  const plantLabel =
    plant?.name || (metaLoading ? "Cargando…" : "Sin planta");

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 px-5 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb simple */}
        <div className="text-sm text-slate-400 mb-2">
          <Link href="/dashboard/reporting" className="hover:underline">
            Reporting
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-emerald-300">
            Resumen de turno
          </span>
        </div>

        {/* Cabecera */}
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Informe de turno – Resumen global
          </h1>
          <p className="text-sm text-slate-400">
            Resumen global de un turno (A, P, Q, OEE, unidades producidas,
            scrap y tiempos clave). Usamos la planta, líneas y turnos que ya
            tienes configurados en la sección de Configuración.
          </p>
        </header>

        {/* Filtros del informe */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-200">
              Filtros del informe
            </h2>
            <div className="text-xs text-slate-400">
              Planta actual:{" "}
              <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                {plantLabel}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Los turnos y líneas disponibles se cargan desde tu configuración de
            planta (Turnos – plantillas, asignación de líneas). De momento el
            resumen numérico se calcula sobre la primera línea seleccionada;
            más adelante lo convertiremos en una tabla de trabajo con todas las
            líneas del turno lista para Excel.
          </p>

          <form
            onSubmit={handleApplyFilters}
            className="grid gap-4 md:grid-cols-4"
          >
            {/* Líneas (multi) */}
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs text-slate-400">
                Líneas (puedes seleccionar varias)
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllLines}
                  disabled={metaLoading || !lines.length}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium ${
                    selectedLineCodes.length === lines.length &&
                    lines.length > 0
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                      : "border-slate-600 bg-slate-900/60 text-slate-200"
                  }`}
                >
                  Todas las líneas
                </button>
                <button
                  type="button"
                  onClick={clearLines}
                  disabled={metaLoading || !lines.length}
                  className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/40 px-3 py-1 text-[11px] text-slate-300"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {lines.map((l) => {
                  const active = selectedLineCodes.includes(l.code);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLine(l.code)}
                      disabled={metaLoading}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] ${
                        active
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                          : "border-slate-600 bg-slate-900/60 text-slate-200"
                      }`}
                    >
                      {l.code}
                    </button>
                  );
                })}
                {!lines.length && !metaLoading && (
                  <span className="text-[11px] text-amber-300">
                    No hay líneas configuradas para la planta.
                  </span>
                )}
              </div>
            </div>

            {/* Turno */}
            <div className="flex flex-col gap-1">
              <label
                className="text-xs text-slate-400"
                htmlFor="shiftTemplateId"
              >
                Turno
              </label>
              <select
                id="shiftTemplateId"
                className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                value={shiftTemplateId}
                onChange={(e) => setShiftTemplateId(e.target.value)}
                disabled={metaLoading || shiftTemplates.length === 0}
              >
                <option value="">
                  {metaLoading
                    ? "Cargando turnos…"
                    : shiftTemplates.length === 0
                    ? "Sin turnos configurados"
                    : "Selecciona turno…"}
                </option>
                {shiftTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} – {t.name || "Sin nombre"}
                  </option>
                ))}
              </select>
            </div>

            {/* Día del turno */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400" htmlFor="shiftDate">
                Día del turno
              </label>
              <input
                id="shiftDate"
                type="date"
                className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                disabled={metaLoading}
              />
            </div>

            {/* Botón aplicar */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Acciones</label>
              <button
                type="submit"
                className="h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={loading || metaLoading}
              >
                {loading ? "Cargando..." : "Aplicar filtros"}
              </button>
            </div>
          </form>

          {metaError && (
            <p className="mt-1 text-xs text-red-400">{metaError}</p>
          )}
          {hasTried && !loading && !summary && !error && !metaError && (
            <p className="mt-1 text-xs text-amber-300/80">
              No se encontraron datos para los filtros seleccionados.
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-red-400">
              {error}
            </p>
          )}
        </section>

        {/* Resumen numérico A, P, Q, OEE */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Disponibilidad", key: "availability" as const },
            { label: "Rendimiento", key: "performance" as const },
            { label: "Calidad", key: "quality" as const },
            { label: "OEE", key: "oee" as const },
          ].map(({ label, key }) => {
            const value = summary ? summary[key] : undefined;
            return (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-xs text-slate-400 mb-1">{label}</div>
                <div className="text-2xl font-semibold">
                  {formatPct(value)}
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/70"
                    style={{ width: progressWidth(value) }}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {/* Producción del turno */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Producción del turno
            </h2>
            <p className="text-xs text-slate-400">
              Unidades producidas, unidades buenas, scrap y desglose de tiempos
              (planificado, en marcha y parado) calculados a partir de los datos
              devueltos por la API de resumen de turno. Pensado para poder
              exportar a Excel por línea/turno.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Unidades totales</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.units_total)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Unidades buenas</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.units_good)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Scrap</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.units_scrap)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">
                Tiempo planificado (turno)
              </div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.planned_runtime_min)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Tiempo en marcha</div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.run_time_min)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Tiempo parado</div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.downtime_min)}
              </div>
            </div>
          </div>
        </section>

        {/* Botones export (placeholder) */}
        <section className="flex flex-wrap gap-3 justify-end">
          <button
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
            type="button"
          >
            Exportar a Excel (WIP)
          </button>
          <button
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
            type="button"
          >
            Exportar a PDF (WIP)
          </button>
        </section>
      </div>
    </main>
  );
}
