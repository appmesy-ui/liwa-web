// lib/use-liwa-telemetry.ts
"use client";

import { useEffect, useRef, useState } from "react";

/** Último mensaje por máquina que expone el hook */
export type TelemetryRow = {
  org: string;
  plant: string;
  machine: string;
  ts: string;              // ISO del mensaje
  status?: string;         // RUN/STOP/etc
  speed_u_min?: number;
  out_count?: number;
  scrap_count?: number;
  good_delta?: number;
  scrap_delta?: number;
  ideal_cycle_s?: number;
  _raw?: any;              // payload completo
};

export type TelemetryState = {
  status: "idle" | "connecting" | "connected" | "error";
  error?: string | null;
  lastByMachine: Record<string, TelemetryRow>; // key = org/plant/machine
};

/** Carga mqtt.min.js (UMD) desde CDN y resuelve cuando window.mqtt está listo */
async function ensureMqtt(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).mqtt) {
    return (window as any).mqtt;
  }
  return new Promise((resolve, reject) => {
    const id = "cdn-mqtt-umd";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
      el.async = true;
      el.onload = () => {
        const mqtt = (window as any).mqtt;
        mqtt ? resolve(mqtt) : reject(new Error("mqtt UMD cargado pero no disponible"));
      };
      el.onerror = () => reject(new Error("No pude cargar mqtt.min.js desde CDN"));
      document.head.appendChild(el);
    } else {
      el.onload = () => {
        const mqtt = (window as any).mqtt;
        mqtt ? resolve(mqtt) : reject(new Error("mqtt no disponible tras onload"));
      };
    }
  });
}

/** Hook de telemetría LIWA por MQTT (WS) */
export function useLiwaTelemetry() {
  const [state, setState] = useState<TelemetryState>({
    status: "idle",
    error: null,
    lastByMachine: {},
  });

  const clientRef = useRef<any>(null);
  const subOnce = useRef(false);
  const url = process.env.NEXT_PUBLIC_MQTT_URL || "ws://localhost:9001";

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        setState((s) => ({ ...s, status: "connecting", error: null }));
        const mqtt = await ensureMqtt();
        if (canceled) return;

        // Conectar con MQTT 3.1.1 (v4) — validado con tu broker
        const client = mqtt.connect(url, {
          reconnectPeriod: 1500,
          protocolVersion: 4,
        });
        clientRef.current = client;

        client.on("connect", () =>
          !canceled && setState((s) => ({ ...s, status: "connected", error: null }))
        );

        client.on("error", (e: any) =>
          !canceled &&
          setState((s) => ({
            ...s,
            status: "error",
            error: `MQTT error: ${e?.message || String(e)}`,
          }))
        );

        client.on("message", (topic: string, payload: Uint8Array) => {
          if (canceled) return;

          // liwa/<org>/<plant>/telemetry/<machine>
          const parts = topic.split("/");
          if (parts.length < 5 || parts[0] !== "liwa" || parts[3] !== "telemetry") return;

          const org = parts[1];
          const plant = parts[2];
          const machine = parts[4];

          let data: any;
          try {
            data = JSON.parse(new TextDecoder().decode(payload));
          } catch {
            return; // ignorar si no es JSON
          }

          const key = `${org}/${plant}/${machine}`;
          const row: TelemetryRow = {
            org,
            plant,
            machine,
            ts: data.ts || new Date().toISOString(),
            status: data.status ?? data.state,
            speed_u_min: toNum(data.speed_u_min),
            out_count: toNum(data.out_count),
            scrap_count: toNum(data.scrap_count),
            good_delta: toNum(data.good_delta),
            scrap_delta: toNum(data.scrap_delta),
            ideal_cycle_s: toNum(data.ideal_cycle_s),
            _raw: data,
          };

          setState((s) => ({
            ...s,
            lastByMachine: { ...s.lastByMachine, [key]: row },
          }));
        });

        if (!subOnce.current) {
          client.subscribe("liwa/+/+/telemetry/#", { qos: 0 }, (err: any) => {
            if (err && !canceled) {
              setState((s) => ({
                ...s,
                status: "error",
                error: `Error de suscripción: ${err?.message || String(err)}`,
              }));
            }
          });
          subOnce.current = true;
        }
      } catch (e: any) {
        if (!canceled)
          setState((s) => ({
            ...s,
            status: "error",
            error: e?.message || String(e),
          }));
      }
    })();

    return () => {
      canceled = true;
      try {
        clientRef.current?.end?.(true);
      } catch {}
    };
  }, [url]);

  return state;
}

/* helpers */
function toNum(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
