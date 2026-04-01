// app/dashboard/live/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import LiveKpiCard from "@/components/LiveKpiCard";

/* ===== Config máquinas para tarjetas MQTT ===== */
const MACHINES = ["M1", "M2", "M5", "M7"];

/* ===== Tipos ===== */
type LiveRow = {
  line_code: string;
  plant_id: string | null;
  planned_runtime_sec: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  units_total: number;
  units_good: number;
  units_scrap: number;
  units_rework: number;
};

type LiveShift = {
  shift_instance_id: string;
  org_id: string | null;
  plant_id: string | null;
  template_id: string | null;
  shift_date: string | null;
  starts_at: string;
  ends_at: string;
};

type LiveWindow = {
  from: string;
  to: string;
  elapsed_sec: number;
  shift_total_sec: number;
};

type LiveResp =
  | {
      ok: true;
      now: string;
      active_shift: LiveShift | null;
      window: LiveWindow | null;
      rows: LiveRow[];
    }
  | { ok: false; error: string };

/* ===== Helpers ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));

const pct = (n?: number | null, d = 1) =>
  n == null ? "—" : `${(clamp01(n) * 100).toFixed(d)}%`;

function fmtHMS(sec?: number | null) {
  if (!Number.isFinite(sec as number) || (sec ?? 0) <= 0) return "—";
  const s = Math.trunc(sec as number);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

const nf = new Intl.NumberFormat("es-ES");

function fmtDateTime(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("es-ES", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

/* ===== Página Live Turno + Máquinas ===== */
export default function LiveDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<LiveResp | null>(null);

  // refresco simple cada 30s
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        setLoading(true);
        const res = await fetch("/api/live-kpis", { cache: "no-store" });
        const json: LiveResp = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          throw new Error((json as any).error || "Error en live-kpis");
        }
        setData(json);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "Error cargando live KPIs");
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 30000); // cada 30s
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const activeShift = data && data.ok ? data.active_shift : null;
  const windowInfo = data && data.ok ? data.window : null;
  const rows = data && data.ok ? data.rows : [];

  const resumen = useMemo(() => {
    if (!rows || rows.length === 0) {
      return {
        aAvg: null as number | null,
        pAvg: null as number | null,
        qAvg: null as number | null,
        oAvg: null as number | null,
      };
    }
    let w = 0;
    let sumA = 0;
    let sumP = 0;
    let sumQ = 0;
    let sumO = 0;

    for (const r of rows) {
      const weight = Math.max(1, r.planned_runtime_sec ?? 1);
      const a = typeof r.availability === "number" ? clamp01(r.availability) : null;
      const p = typeof r.performance === "number" ? clamp01(r.performance) : null;
      const q = typeof r.quality === "number" ? clamp01(r.quality) : null;
      const o = typeof r.oee === "number" ? clamp01(r.oee) : null;

      w += weight;
      if (a != null) sumA += a * weight;
      if (p != null) sumP += p * weight;
      if (q != null) sumQ += q * weight;
      if (o != null) sumO += o * weight;
    }

    if (w <= 0) {
      return { aAvg: null, pAvg: null, qAvg: null, oAvg: null };
    }

    return {
      aAvg: sumA / w,
      pAvg: sumP / w,
      qAvg: sumQ / w,
      oAvg: sumO / w,
    };
  }, [rows]);

  const progressPct =
    windowInfo && windowInfo.shift_total_sec > 0
      ? windowInfo.elapsed_sec / windowInfo.shift_total_sec
      : null;

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 space-y-6">
      <header className="mb-2 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Live · Turno actual
        </h1>
        <p className="text-sm text-slate-300">
          KPIs en curso del turno activo (A, P, Q, OEE) calculados desde el
          inicio del turno hasta el momento actual, sin esperar al cierre del día.
        </p>
      </header>

      {err && (
        <div className="mb-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200 text-sm">
          {err}
        </div>
      )}

      {/* Info de turno activo */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 mb-3">
          Turno en curso
        </h2>

        {!activeShift && !loading && (
          <div className="text-sm text-slate-300">
            No hay ningún turno activo en este momento.
          </div>
        )}

        {activeShift && windowInfo && (
          <div className="grid gap-3 md:grid-cols-4 text-sm text-slate-200">
            <div>
              <div className="text-xs text-slate-400">Fecha de turno</div>
              <div className="font-medium">
                {activeShift.shift_date ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Inicio / Fin</div>
              <div className="font-medium">
                {fmtDateTime(activeShift.starts_at)} →{" "}
                {fmtDateTime(activeShift.ends_at)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Tiempo transcurrido</div>
              <div className="font-medium">
                {fmtHMS(windowInfo.elapsed_sec)} de{" "}
                {fmtHMS(windowInfo.shift_total_sec)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Progreso turno</div>
              <div className="font-medium">
                {pct(progressPct, 1)}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* KPIs agregados live */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card
          title="Availability (A) · live"
          value={loading ? "…" : pct(resumen.aAvg)}
          hint="Disponibilidad del turno hasta ahora"
        />
        <Card
          title="Performance (P) · live"
          value={loading ? "…" : pct(resumen.pAvg)}
          hint="Velocidad vs ciclo ideal en el turno"
        />
        <Card
          title="Quality (Q) · live"
          value={loading ? "…" : pct(resumen.qAvg)}
          hint="Calidad del turno hasta ahora"
        />
        <Card
          title="OEE · live"
          value={loading ? "…" : pct(resumen.oAvg)}
          hint="A × P × Q sobre el turno en curso"
        />
      </section>

      {/* Tabla por línea */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            Líneas en el turno actual
          </h2>
          {loading && (
            <span className="text-xs text-slate-400">Actualizando…</span>
          )}
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950/60 text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2">Línea</th>
                  <th className="text-right px-3 py-2">A (live)</th>
                  <th className="text-right px-3 py-2">P (live)</th>
                  <th className="text-right px-3 py-2">Q (live)</th>
                  <th className="text-right px-3 py-2">OEE (live)</th>
                  <th className="text-right px-3 py-2">Tiempo planificado</th>
                  <th className="text-right px-3 py-2">Buenas</th>
                  <th className="text-right px-3 py-2">Scrap</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-4 text-slate-400"
                    >
                      Cargando…
                    </td>
                  </tr>
                )}
                {!loading && (!rows || rows.length === 0) && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-4 text-slate-400"
                    >
                      Sin datos de producción todavía en el turno actual.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows &&
                  rows.map((r) => (
                    <tr
                      key={r.line_code}
                      className="border-t border-white/10 hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2 font-medium text-slate-100">
                        {r.line_code}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pct(r.availability)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pct(r.performance)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pct(r.quality)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pct(r.oee)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtHMS(r.planned_runtime_sec)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {nf.format(r.units_good)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {nf.format(r.units_scrap)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Máquinas en tiempo (casi) real via MQTT */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 mb-3">
          Máquinas · telemetría en vivo
        </h2>

        <p className="text-xs text-slate-400 mb-3">
          Vista rápida de estado y velocidad por máquina (MQTT). No afecta al
          cálculo de KPIs; sirve como monitor de línea.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MACHINES.map((code) => (
            <LiveKpiCard
              key={code}
              title={code}
              orgPlantFilter="tecno/demo"
              machineId={code}
            />
          ))}

          {MACHINES.length === 0 && (
            <div className="text-sm text-slate-400">
              No hay máquinas configuradas.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ===== UI bits ===== */
function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5">
      <div className="text-slate-200/90 text-sm">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-slate-400">{hint}</div>
      ) : null}
    </div>
  );
}

