// app/dashboard/reporting/turno-paros/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ===== Tipos que casan con /api/reporting/turno-paros ===== */

type ParoRow = {
  id: string;
  plant_id?: string | null;
  line_code?: string | null;
  machine_code?: string | null;
  machine_name?: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  is_planned: boolean | null;
  status: string | null;
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  notes?: string | null;
};

type ParosSummary = {
  total_events: number;
  total_downtime_min: number;
  total_planned_downtime_min: number;
  total_unplanned_downtime_min: number;
  total_pending_events: number;
};

type ParosResponse = {
  ok: boolean;
  error?: string | null;
  filters?: {
    from: string;
    to: string;
  };
  rows?: ParoRow[];
  summary?: ParosSummary;
};

type Plant = { id: string; name: string };

/* ================= Página ================= */

export default function TurnoParosReportPage() {
  const supabase = createClientComponentClient();
  const sb = supabase as any;

  // Planta para mostrar etiqueta (igual que en otros reports)
  const [plant, setPlant] = useState<Plant | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Datos del informe
  const [rows, setRows] = useState<ParoRow[]>([]);
  const [summary, setSummary] = useState<ParosSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTried, setHasTried] = useState(false);

  /* ========== 1) Cargar planta actual (solo para mostrar nombre) ========== */

  useEffect(() => {
    let mounted = true;

    async function loadMeta() {
      try {
        setMetaLoading(true);
        setMetaError(null);

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

        const orgId = memberships?.[0]?.org_id ?? null;
        if (!orgId) {
          throw new Error("No se pudo determinar tu organización (org_id).");
        }

        const { data: plants, error: errPlants } = await sb
          .schema("liwa")
          .from("plants")
          .select("id, name")
          .eq("org_id", orgId)
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
      } catch (err: any) {
        if (!mounted) return;
        console.error("[turno-paros] Error metadatos:", err);
        setMetaError(
          err?.message ||
            "No se pudo cargar la planta actual para el informe de paros."
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

  /* ========== 2) Aplicar filtros → llamar a /api/reporting/turno-paros ========== */

  async function handleApplyFilters(e: FormEvent) {
    e.preventDefault();
    setHasTried(true);
    setError(null);
    setRows([]);
    setSummary(null);

    try {
      if (!fromDate || !toDate) {
        throw new Error("Debes seleccionar rango de fechas (desde y hasta).");
      }

      const params = new URLSearchParams();
      params.set("from", fromDate);
      params.set("to", toDate);

      setLoading(true);

      const res = await fetch(
        `/api/reporting/turno-paros?${params.toString()}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el informe de paros (HTTP ${res.status}).`
        );
      }

      const json = (await res.json()) as ParosResponse;
      if (!json.ok) {
        throw new Error(json.error || "No se encontraron paros en ese rango.");
      }

      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
    } catch (err: any) {
      console.error("Error al cargar informe de paros:", err);
      setError(err?.message || "Error de red al cargar el informe.");
    } finally {
      setLoading(false);
    }
  }

  /* ========== 3) Exportar a CSV (punto y coma para Excel ES) ========== */

  function handleExportCsv() {
    if (!rows.length) {
      alert("No hay datos que exportar para los filtros actuales.");
      return;
    }

    const DELIM = ";";

    const header = [
      "id",
      "plant_id",
      "line_code",
      "machine_code",
      "machine_name",
      "started_at",
      "ended_at",
      "duration_min",
      "is_planned",
      "status",
      "level1",
      "level2",
      "level3",
      "notes",
    ];

    const linesCsv = rows.map((r) =>
      [
        r.id,
        r.plant_id ?? "",
        r.line_code ?? "",
        r.machine_code ?? "",
        r.machine_name ?? "",
        r.started_at,
        r.ended_at ?? "",
        r.duration_min ?? "",
        r.is_planned === null ? "" : r.is_planned ? "planned" : "unplanned",
        r.status ?? "",
        r.level1 ?? "",
        r.level2 ?? "",
        r.level3 ?? "",
        r.notes ?? "",
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
    link.download = `liwa_turno_paros_${fromLabel}_a_${toLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ========== Helpers de formato ========== */

  function formatMinutes(value?: number | null) {
    if (value === null || value === undefined) return "-- min";
    return `${value.toFixed(1)} min`;
  }

  function formatDateTime(value?: string | null) {
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

  function formatPlanned(is_planned: boolean | null) {
    if (is_planned === null) return "—";
    return is_planned ? "Planificado" : "No planificado";
  }

  function formatStatus(status: string | null) {
    if (!status) return "—";
    if (status === "pending") return "Pendiente de clasificar";
    if (status === "classified") return "Clasificado";
    return status;
  }

  function formatNumber(value?: number | null) {
    if (value === null || value === undefined) return "--";
    return value.toLocaleString("es-ES");
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
            Paros y pérdidas
          </span>
        </div>

        {/* Cabecera del informe */}
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Informe de turno – Paros detallados
          </h1>
          <p className="text-sm text-slate-400">
            Lista de eventos de paro en un rango de fechas. Pensado como dataset
            de trabajo para descargar a Excel (id, timestamps, duración, tipo de
            paro, estado de clasificación y notas).
          </p>
        </header>

        {/* Filtros */}
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
            Selecciona un rango de fechas. El informe traerá todos los eventos de
            paro registrados en ese periodo. Más adelante podemos añadir filtros
            por línea, máquina o niveles N1–N3, pero para el MVP nos centramos en
            el dataset crudo listo para Excel.
          </p>

          <form
            onSubmit={handleApplyFilters}
            className="grid gap-4 md:grid-cols-4"
          >
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

            {/* Acciones */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs text-slate-400">Acciones</label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="h-9 flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading || metaLoading}
                >
                  {loading ? "Cargando..." : "Aplicar filtros"}
                </button>
              </div>
            </div>
          </form>

          {metaError && (
            <p className="mt-1 text-xs text-red-400">{metaError}</p>
          )}
          {hasTried && !loading && !error && rows.length === 0 && (
            <p className="mt-1 text-xs text-amber-300/80">
              No se encontraron paros en el rango seleccionado.
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-red-400">{error}</p>
          )}
        </section>

        {/* Resumen agregado */}
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs text-slate-400 mb-1">
              Nº total de eventos
            </div>
            <div className="text-2xl font-semibold">
              {formatNumber(summary?.total_events)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs text-slate-400 mb-1">
              Minutos totales de paro
            </div>
            <div className="text-xl font-semibold">
              {formatMinutes(summary?.total_downtime_min)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs text-slate-400 mb-1">
              Minutos planificados
            </div>
            <div className="text-xl font-semibold">
              {formatMinutes(summary?.total_planned_downtime_min)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs text-slate-400 mb-1">
              Minutos no planificados
            </div>
            <div className="text-xl font-semibold">
              {formatMinutes(summary?.total_unplanned_downtime_min)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Pendientes de clasificar:{" "}
              <span className="font-mono text-emerald-300">
                {formatNumber(summary?.total_pending_events)}
              </span>
            </div>
          </div>
        </section>

        {/* Tabla de paros */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Paros del rango seleccionado
              </h2>
              <p className="text-xs text-slate-400">
                Una fila por evento de paro. Este dataset es el que podrás
                descargar a Excel para hacer Pareto, análisis por máquina, etc.
              </p>
            </div>

            {/* Botones de export */}
            <div className="flex items-center gap-2">
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
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60">
            <table className="min-w-full text-[11px]">
              <thead className="bg-slate-900/80 text-slate-300">
                <tr>
                  <th className="text-left py-2 px-3">Inicio</th>
                  <th className="text-left py-2 px-3">Fin</th>
                  <th className="text-right py-2 px-3">Duración (min)</th>
                  <th className="text-left py-2 px-3">Línea</th>
                  <th className="text-left py-2 px-3">Máquina</th>
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Motivo (N1/N2/N3)</th>
                  <th className="text-left py-2 px-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="border-t border-white/5">
                    <td
                      className="py-3 px-3 text-slate-500"
                      colSpan={9}
                    >
                      No hay eventos de paro en el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-white/5 hover:bg-slate-900/40"
                    >
                      <td className="py-2 px-3 text-slate-100">
                        {formatDateTime(r.started_at)}
                      </td>
                      <td className="py-2 px-3 text-slate-100">
                        {formatDateTime(r.ended_at)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-100">
                        {formatMinutes(r.duration_min)}
                      </td>
                      <td className="py-2 px-3 text-slate-200">
                        {r.line_code || "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-200">
                        {r.machine_name || r.machine_code || "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-200">
                        {formatPlanned(r.is_planned)}
                      </td>
                      <td className="py-2 px-3 text-slate-200">
                        {formatStatus(r.status)}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {[r.level1, r.level2, r.level3]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
