"use client";

import { useLiwaTelemetry } from "@/lib/use-liwa-telemetry";

export default function LiveKpiCard({
  orgPlantFilter, // ej: "tecno/demo"
  machineId,      // ej: "M1"
  title = "Producción en vivo",
}: {
  orgPlantFilter?: string;
  machineId?: string;
  title?: string;
}) {
  const { status, lastByMachine } = useLiwaTelemetry();

  const candidates = Object.values(lastByMachine).filter((r) => {
    const okOrgPlant = orgPlantFilter
      ? `${r.org}/${r.plant}` === orgPlantFilter
      : true;
    const okMachine = machineId ? r.machine === machineId : true;
    return okOrgPlant && okMachine;
  });

  const row =
    candidates.find((r) => r.status === "RUN") ??
    candidates[0] ??
    undefined;

  return (
    <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs opacity-70">
          {status === "connected"
            ? "✅ conectado"
            : status === "connecting"
            ? "🟡 conectando…"
            : status === "error"
            ? "❌ error"
            : "—"}
        </div>
      </div>

      {row ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-70">
                {row.org} / {row.plant}
              </div>
              <div className="text-lg font-mono font-semibold">
                {row.machine}
              </div>
            </div>
            <StatusBadge status={row.status} />
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Velocidad" value={numOrDash(row.speed_u_min)} suffix="u/min" />
            <Stat label="Producidas" value={numOrDash(row.out_count)} />
            <Stat label="Scrap" value={numOrDash(row.scrap_count)} />
          </div>

          <div className="text-[11px] opacity-70">Último: {fmtTs(row.ts)}</div>
        </>
      ) : (
        <div className="text-sm opacity-70">Sin datos aún…</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const badge =
    status === "RUN"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : status === "STOP"
      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : "bg-slate-500/20 text-slate-300 border-slate-500/40";
  return (
    <div className={`text-xs px-2 py-1 rounded-full border ${badge}`}>
      {status ?? "—"}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-semibold">
        {value} {suffix ?? ""}
      </div>
    </div>
  );
}

function numOrDash(n?: number) {
  return typeof n === "number" ? String(n) : "—";
}
function fmtTs(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}
