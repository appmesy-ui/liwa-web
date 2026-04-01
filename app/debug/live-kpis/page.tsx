// app/debug/live-kpis/page.tsx
"use client";

import { useMemo } from "react";
// 👇 Import RELATIVO desde app/debug/live-kpis → lib
import { useLiwaTelemetry } from "@/lib/use-liwa-telemetry";


export default function Page() {
  const { status, error, lastByMachine } = useLiwaTelemetry();

  const rows = useMemo(() => {
    return Object.values(lastByMachine).sort((a, b) => {
      const ka = `${a.org}/${a.plant}/${a.machine}`;
      const kb = `${b.org}/${b.plant}/${b.machine}`;
      return ka.localeCompare(kb);
    });
  }, [lastByMachine]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">LIWA · KPIs en vivo</h1>

      <div className="text-sm">
        <span className="font-medium">Estado de conexión:</span>{" "}
        {status === "connected"
          ? "✅ Conectado"
          : status === "connecting"
          ? "🟡 Conectando…"
          : status === "error"
          ? "❌ Error"
          : "—"}
      </div>

      {error && (
        <div className="text-xs rounded-lg border border-red-500/50 p-3">
          <div className="font-medium mb-1">Error</div>
          <pre className="whitespace-pre-wrap break-all">{error}</pre>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.length === 0 && (
          <div className="opacity-70">Aún no hay telemetría…</div>
        )}
        {rows.map((r) => (
          <KpiCard
            key={`${r.org}/${r.plant}/${r.machine}`}
            org={r.org}
            plant={r.plant}
            machine={r.machine}
            ts={r.ts}
            status={r.status}
            speed={r.speed_u_min}
            outCount={r.out_count}
            scrapCount={r.scrap_count}
          />
        ))}
      </div>
    </main>
  );
}

function KpiCard(props: {
  org: string;
  plant: string;
  machine: string;
  ts: string;
  status?: string;
  speed?: number;
  outCount?: number;
  scrapCount?: number;
}) {
  const badge =
    props.status === "RUN"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : props.status === "STOP"
      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : "bg-slate-500/20 text-slate-300 border-slate-500/40";

  return (
    <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs opacity-70">
            {props.org} / {props.plant}
          </div>
          <div className="text-lg font-semibold font-mono">{props.machine}</div>
        </div>
        <div className={`text-xs px-2 py-1 rounded-full border ${badge}`}>
          {props.status ?? "—"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Velocidad" value={numOrDash(props.speed)} suffix="u/min" />
        <Stat label="Producidas" value={numOrDash(props.outCount)} />
        <Stat label="Scrap" value={numOrDash(props.scrapCount)} />
      </div>

      <div className="text-[11px] opacity-70">Último: {fmtTs(props.ts)}</div>
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
