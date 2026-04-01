// app/debug/telemetry/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

/** Estructura mínima que mostraremos por máquina */
type Row = {
  org: string;
  plant: string;
  machine: string;
  ts: string;              // ISO del mensaje
  status?: string;         // RUN/STOP/etc si viene
  speed_u_min?: number;    // si viene
  out_count?: number;      // si viene
  scrap_count?: number;    // si viene
  good_delta?: number;     // si viene
  scrap_delta?: number;    // si viene
  ideal_cycle_s?: number;  // si viene
  _raw?: any;              // por si quieres ver todo
};

export default function Page() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, Row>>({}); // key = org/plant/machine
  const clientRef = useRef<any>(null);

  const url = process.env.NEXT_PUBLIC_MQTT_URL!; // ws://localhost:9001

  // Conectar por CDN (igual que en /debug/mqtt) y mantener mapa con último mensaje por máquina
  useEffect(() => {
    if (!ready) return;

    try {
      const mqttObj: any = (window as any).mqtt;
      if (!mqttObj || typeof mqttObj.connect !== "function") {
        throw new Error("mqtt.connect no está disponible en window.mqtt");
      }

      const client = mqttObj.connect(url, {
        reconnectPeriod: 1500,
        protocolVersion: 4, // 3.1.1 — ya validado que funciona
      });
      clientRef.current = client;

      const onMsg = (topic: string, payload: Uint8Array) => {
        // Esperamos: liwa/<org>/<plant>/telemetry/<machine>
        const parts = topic.split("/");
        if (parts.length < 5 || parts[0] !== "liwa" || parts[3] !== "telemetry") return;
        const org = parts[1];
        const plant = parts[2];
        const machine = parts[4];

        // Decodificar JSON (si no es JSON, ignoramos)
        let data: any;
        try {
          data = JSON.parse(new TextDecoder().decode(payload));
        } catch {
          return;
        }

        const key = `${org}/${plant}/${machine}`;
        const row: Row = {
          org,
          plant,
          machine,
          ts: data.ts || new Date().toISOString(),
          status: data.status ?? data.state,
          speed_u_min: numberish(data.speed_u_min),
          out_count: numberish(data.out_count),
          scrap_count: numberish(data.scrap_count),
          good_delta: numberish(data.good_delta),
          scrap_delta: numberish(data.scrap_delta),
          ideal_cycle_s: numberish(data.ideal_cycle_s),
          _raw: data,
        };

        setMap((prev) => ({ ...prev, [key]: row }));
      };

      const onError = (e: any) => setErr(`MQTT error: ${e?.message || String(e)}`);

      client.on("message", onMsg);
      client.on("error", onError);

      client.subscribe("liwa/+/+/telemetry/#", { qos: 0 }, (e: any) => {
        if (e) setErr(`Error de suscripción: ${e?.message || String(e)}`);
      });

      return () => {
        try {
          client.off("message", onMsg);
          client.off("error", onError);
          client.end(true);
        } catch {}
      };
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, [ready, url]);

  // Tabla ordenada por org/plant/machine
  const rows = useMemo(() => {
    return Object.values(map).sort((a, b) => {
      const ka = `${a.org}/${a.plant}/${a.machine}`;
      const kb = `${b.org}/${b.plant}/${b.machine}`;
      return ka.localeCompare(kb);
    });
  }, [map]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Cargamos MQTT UMD desde CDN (ya comprobado que funciona) */}
      <Script
        src="https://unpkg.com/mqtt/dist/mqtt.min.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => setErr("No pude cargar mqtt.min.js desde CDN")}
      />

      <h1 className="text-2xl font-semibold">LIWA · Última telemetría por máquina</h1>

      {err && (
        <div className="text-xs rounded-lg border border-red-500/50 p-3">
          <div className="font-medium mb-1">Error</div>
          <pre className="whitespace-pre-wrap break-all">{err}</pre>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left border-b border-neutral-800">
            <tr>
              <th className="py-2 pr-4">Org</th>
              <th className="py-2 pr-4">Planta</th>
              <th className="py-2 pr-4">Máquina</th>
              <th className="py-2 pr-4">ts</th>
              <th className="py-2 pr-4">status</th>
              <th className="py-2 pr-4">speed_u_min</th>
              <th className="py-2 pr-4">out_count</th>
              <th className="py-2 pr-4">scrap_count</th>
              <th className="py-2 pr-4">Δ good</th>
              <th className="py-2 pr-4">Δ scrap</th>
              <th className="py-2 pr-4">ideal_cycle_s</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-4 opacity-70">
                  Aún no hay telemetría…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.org}/${r.plant}/${r.machine}`} className="border-b border-neutral-900/50">
                <td className="py-2 pr-4">{r.org}</td>
                <td className="py-2 pr-4">{r.plant}</td>
                <td className="py-2 pr-4 font-mono">{r.machine}</td>
                <td className="py-2 pr-4">{fmtTs(r.ts)}</td>
                <td className="py-2 pr-4">{r.status ?? "—"}</td>
                <td className="py-2 pr-4">{orDash(r.speed_u_min)}</td>
                <td className="py-2 pr-4">{orDash(r.out_count)}</td>
                <td className="py-2 pr-4">{orDash(r.scrap_count)}</td>
                <td className="py-2 pr-4">{orDash(r.good_delta)}</td>
                <td className="py-2 pr-4">{orDash(r.scrap_delta)}</td>
                <td className="py-2 pr-4">{orDash(r.ideal_cycle_s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-70">
        Nota: se muestra el último mensaje recibido por cada máquina. El payload completo queda en memoria (<code>_raw</code>) por si luego lo quieres usar.
      </p>
    </main>
  );
}

/* ==== helpers ==== */
function numberish(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function orDash(v?: number) {
  return typeof v === "number" ? v : "—";
}
function fmtTs(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}
