// app/dashboard/reporting/turno-resumen/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ==== Tipos de datos (API nuevo reporting) ==== */
type TurnoResumenRow = {
  plant_id: string;
  line_code: string;
  shift_start: string;
  shift_end: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  units_total: number;
  units_good: number;
  units_scrap: number;
  planned_runtime_min: number | null;
  run_time_min: number | null;
  downtime_min: number | null;
};

type TurnoResumenSummary = {
  total_shifts: number;
  avg_availability: number | null;
  avg_performance: number | null;
  avg_quality: number | null;
  avg_oee: number | null;
  total_units_total: number;
  total_units_good: number;
  total_units_scrap: number;
  total_planned_runtime_min: number;
  total_run_time_min: number;
  total_downtime_min: number;
};

type TurnoResumenResponse = {
  ok: boolean;
  error?: string | null;
  filters?: {
    from: string;
    to: string;
    plantId: string | null;
    lineId: string | null;
  };
  rows?: TurnoResumenRow[];
  summary?: TurnoResumenSummary;
};

type Plant = { id: string; name: string };
type Line = { id: string; code: string; name: string };

/* ==== Página ==== */
export default function TurnoResumenReportPage() {
  const supabase = createClientComponentClient();
  const sb = supabase as any;

  // Contexto de organización / planta / líneas
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Filtros
  const [selectedLineCodes, setSelectedLineCodes] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState(""); // YYYY-MM-DD

  // Resultado
  const [rows, setRows] = useState<TurnoResumenRow[]>([]);
  const [summary, setSummary] = useState<TurnoResumenSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTried, setHasTried] = useState(false);

  /* ============================
   * 1) Cargar org_id, planta y líneas (igual patrón que Settings)
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
          throw new Error(
            "No se pudo determinar el usuario actual (sin sesión)."
          );
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

        // 3) líneas activas de esa planta (igual patrón que LinesTab)
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
            "No se pudo cargar la planta actual o las líneas configuradas."
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
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
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
    setRows([]);
    setSummary(null);

    try {
      if (!plant) {
        throw new Error(
          "No se ha podido determinar la planta actual. Revisa Configuración → Planta."
        );
      }
      if (!fromDate || !toDate) {
        throw new Error("Debes seleccionar un rango de fechas (desde y hasta).");
      }
      if (!lines.length) {
        throw new Error(
          "No hay líneas configuradas para la planta. Configúralas en Configuración → Líneas."
        );
      }

      // Si el usuario no selecciona líneas, interpretamos "todas"
      const effectiveLines =
        selectedLineCodes.length > 0
          ? selectedLineCodes
          : lines.map((l) => l.code);

      if (!effectiveLines.length) {
        throw new Error(
          "Debes seleccionar al menos una línea para visualizar el informe."
        );
      }

      const params = new URLSearchParams();
      params.set("from", fromDate);
      params.set("to", toDate);
      params.set("plantId", plant.id);
      // No filtramos por línea en el backend: las filtramos en el front.

      setLoading(true);

      const res = await fetch(
        `/api/reporting/turno-resumen?${params.toString()}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el resumen de turnos (HTTP ${res.status}).`
        );
      }

      const json = (await res.json()) as TurnoResumenResponse;
      if (!json.ok) {
        throw new Error(json.error || "No se encontraron datos para el rango.");
      }

      const apiRows = json.rows ?? [];
      const apiSummary = json.summary ?? null;

      setRows(apiRows);
      setSummary(apiSummary);
    } catch (err: any) {
      console.error("Error al cargar resumen de turnos:", err);
      setError(err?.message || "Error de red al cargar el informe.");
    } finally {
      setLoading(false);
    }
  }

  /* ============================
   * 3) Exportar a CSV (para Excel, separador ;)
   * ============================ */
  function handleExportCsv() {
    if (!visibleRows.length) {
      alert("No hay datos que exportar para los filtros actuales.");
      return;
    }

    const DELIM = ";";

    const header = [
      "plant_id",
      "line_code",
      "shift_start",
      "shift_end",
      "availability",
      "performance",
      "quality",
      "oee",
      "units_good",
      "units_scrap",
      "units_total",
      "planned_runtime_min",
      "run_time_min",
      "downtime_min",
    ];

    const linesCsv = visibleRows.map((r) =>
      [
        r.plant_id,
        r.line_code,
        r.shift_start,
        r.shift_end,
        r.availability,
        r.performance,
        r.quality,
        r.oee,
        r.units_good,
        r.units_scrap,
        r.units_total,
        r.planned_runtime_min ?? "",
        r.run_time_min ?? "",
        r.downtime_min ?? "",
      ]
        .map((value) => {
          const str = String(value);
          if (str.includes(DELIM) || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(DELIM)
    );

    const csvContent = [header.join(DELIM), ...linesCsv].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const fromLabel = fromDate || "desde";
    const toLabel = toDate || "hasta";
    link.download = `liwa_turno_resumen_${fromLabel}_a_${toLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  function formatDateTime(value: string) {
    if (!value) return "--";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString("es-ES", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const plantLabel =
    plant?.name || (metaLoading ? "Cargando…" : "Sin planta");

  // Filtrado de filas según las líneas seleccionadas
  const visibleRows =
    rows.length && selectedLineCodes.length
      ? rows.filter((r) => selectedLineCodes.includes(r.line_code))
      : rows;

  return (
    <main className="liwa-page w-full px-5 py-8">
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
            Resumen global de turnos por línea en un rango de fechas (A, P, Q,
            OEE, unidades producidas, scrap y tiempos clave). Pensado como
            dataset de trabajo para descargar a Excel y analizar por turno/línea.
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
            Selecciona un rango de fechas y las líneas que quieras analizar. El
            sistema consulta la vista de resumen de turnos y devuelve una tabla
            lista para exportar a Excel (una fila = una línea en un turno).
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

            {/* Desde */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400" htmlFor="fromDate">
                Desde (fecha inicio)
              </label>
              <input
                id="fromDate"
                type="date"
                className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={metaLoading}
              />
            </div>

            {/* Hasta */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400" htmlFor="toDate">
                Hasta (fecha fin)
              </label>
              <input
                id="toDate"
                type="date"
                className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
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
          {hasTried &&
            !loading &&
            !error &&
            !metaError &&
            visibleRows.length === 0 && (
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

        {/* Resumen numérico A, P, Q, OEE (promedios) */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            {
              label: "Disponibilidad promedio",
              key: "avg_availability" as const,
            },
            {
              label: "Rendimiento promedio",
              key: "avg_performance" as const,
            },
            { label: "Calidad promedio", key: "avg_quality" as const },
            { label: "OEE promedio", key: "avg_oee" as const },
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

        {/* Producción agregada del rango */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Producción agregada del rango
            </h2>
            <p className="text-xs text-slate-400">
              Unidades totales, unidades buenas, scrap y tiempos agregados de
              todos los turnos devueltos por el informe. Esto resume el rango
              completo que luego puedes desglosar en la tabla de detalle o en
              Excel.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Unidades totales</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.total_units_total)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Unidades buenas</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.total_units_good)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">Scrap</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatNumber(summary?.total_units_scrap)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">
                Tiempo planificado (suma)
              </div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.total_planned_runtime_min)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">
                Tiempo en marcha (suma)
              </div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.total_run_time_min)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs text-slate-400">
                Tiempo parado (suma)
              </div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinutes(summary?.total_downtime_min)}
              </div>
            </div>
          </div>
        </section>

        {/* Tabla de detalle por turno y línea (dataset para Excel) */}
        {visibleRows.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 mb-1">
                  Detalle por turno y línea
                </h2>
                <p className="text-xs text-slate-400">
                  Una fila por turno y línea dentro del rango seleccionado.
                  Este es el dataset que luego podrás exportar a Excel para
                  seguir trabajando (pivots, gráficos, etc.).
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Total filas:{" "}
                <span className="font-mono text-emerald-300">
                  {visibleRows.length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-900/80 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Línea</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Inicio turno
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Fin turno
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Disp.
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Rend.
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Calidad
                    </th>
                    <th className="px-3 py-2 text-right font-medium">OEE</th>
                    <th className="px-3 py-2 text-right font-medium">
                      U. buenas
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Scrap
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      U. totales
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Run (min)
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Paro (min)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {visibleRows.map((r, idx) => (
                    <tr
                      key={`${r.plant_id}-${r.line_code}-${r.shift_start}-${idx}`}
                    >
                      <td className="px-3 py-2 font-mono text-emerald-200">
                        {r.line_code}
                      </td>
                      <td className="px-3 py-2 text-slate-200">
                        {formatDateTime(r.shift_start)}
                      </td>
                      <td className="px-3 py-2 text-slate-200">
                        {formatDateTime(r.shift_end)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPct(r.availability)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPct(r.performance)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPct(r.quality)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPct(r.oee)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(r.units_good)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(r.units_scrap)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(r.units_total)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMinutes(r.run_time_min)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMinutes(r.downtime_min)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Botones export */}
        <section className="flex flex-wrap gap-3 justify-end">
          <button
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
            type="button"
            onClick={handleExportCsv}
          >
            Exportar a Excel (CSV)
          </button>
          <button
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
            type="button"
            disabled
            title="Pendiente de implementar"
          >
            Exportar a PDF (WIP)
          </button>
        </section>
      </div>
    </main>
  );
}
