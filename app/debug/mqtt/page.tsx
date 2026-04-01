// app/debug/mqtt/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type Item = { ts: number; topic: string; payload: string };

export default function Page() {
  // ---- Estados generales ----
  const [mqttStatus, setMqttStatus] =
    useState<"connecting" | "connected" | "closed" | "error" | "reconnect">(
      "connecting"
    );
  const [mqttErr, setMqttErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [scriptReady, setScriptReady] = useState(false);

  // ---- Probe WebSocket crudo ----
  const [wsProbe, setWsProbe] = useState<{ phase: string; detail?: string }[]>(
    []
  );

  const subOnce = useRef(false);
  const clientRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const url = process.env.NEXT_PUBLIC_MQTT_URL!; // ej: ws://localhost:9001

  // 1) PROBE: probar handshake WebSocket nativo
  useEffect(() => {
    try {
      setWsProbe([{ phase: "init", detail: `Intentando WS → ${url}` }]);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setWsProbe((p) => [...p, { phase: "open", detail: "WS abierto ✅" }]);
        ws.close();
      };
      ws.onerror = (e: any) => {
        setWsProbe((p) => [
          ...p,
          { phase: "error", detail: `WS error: ${e?.message || "desconocido"}` },
        ]);
      };
      ws.onclose = (ev) => {
        setWsProbe((p) => [
          ...p,
          {
            phase: "close",
            detail: `WS cerrado (code=${ev.code} reason="${ev.reason}")`,
          },
        ]);
      };
    } catch (e: any) {
      setWsProbe((p) => [
        ...p,
        { phase: "exception", detail: String(e?.message || e) },
      ]);
    }
  }, [url]);

  // 2) MQTT via CDN (con protocolo 3.1.1 = v4)
  useEffect(() => {
    if (!scriptReady) return;

    try {
      const mqttObj: any = (window as any).mqtt;
      if (!mqttObj || typeof mqttObj.connect !== "function") {
        throw new Error("mqtt.connect no está disponible en window.mqtt");
      }

      const client = mqttObj.connect(url, {
        reconnectPeriod: 1500,
        // 🔽 Forzamos MQTT 3.1.1 para compatibilidad de handshake
        protocolVersion: 4,
        // Si tu servidor WS publica en raíz, no toques path.
        // Si más tarde vemos 1002/1006, probaremos path: "/mqtt".
        // path: "/",
      });
      clientRef.current = client;

      const onConnect = () => {
        clearTimeout(timerRef.current);
        setMqttStatus("connected");
        setMqttErr(null);
      };
      const onClose = () => setMqttStatus("closed");
      const onMsg = (topic: string, payload: Uint8Array) => {
        const text = new TextDecoder().decode(payload);
        setItems((prev) =>
          [{ ts: Date.now(), topic, payload: text }, ...prev].slice(0, 50)
        );
      };
      const onError = (e: any) => {
        setMqttStatus("error");
        setMqttErr(
          `Error de conexión a ${url} → ${e?.message || e?.code || String(e)}`
        );
      };
      const onReconnect = () => setMqttStatus("reconnect");

      client.on("connect", onConnect);
      client.on("close", onClose);
      client.on("message", onMsg);
      client.on("error", onError);
      client.on("reconnect", onReconnect);

      if (!subOnce.current) {
        client.subscribe("liwa/+/+/telemetry/#", { qos: 0 }, (e: any) => {
          if (e) console.error("MQTT subscribe error:", e);
        });
        subOnce.current = true;
      }

      // Timeout de cortesía
      timerRef.current = setTimeout(() => {
        if (mqttStatus !== "connected") {
          setMqttStatus("error");
          setMqttErr(
            `No conecta a ${url} con MQTT v3.1.1. Si el WS necesita un path (p. ej. /mqtt), lo probamos a continuación.`
          );
        }
      }, 5000);
    } catch (e: any) {
      setMqttStatus("error");
      setMqttErr(String(e?.message || e));
    }

    return () => {
      try {
        clearTimeout(timerRef.current);
        clientRef.current?.end?.(true);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, url]);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Cargar MQTT UMD desde CDN */}
      <Script
        src="https://unpkg.com/mqtt/dist/mqtt.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => {
          setMqttErr("No pude cargar mqtt.min.js desde CDN");
          setMqttStatus("error");
        }}
      />

      <h1 className="text-2xl font-semibold">LIWA · Debug MQTT</h1>

      {/* Probe WebSocket crudo */}
      <div className="text-sm">
        <div className="font-medium">WS Probe (handshake)</div>
        <div className="mt-2 rounded-xl border border-neutral-700 p-3 text-xs font-mono">
          {wsProbe.map((r, i) => (
            <div key={i}>
              {r.phase}: {r.detail}
            </div>
          ))}
        </div>
      </div>

      {/* Estado MQTT */}
      <div className="text-sm">
        <span className="font-medium">Estado MQTT:</span>{" "}
        {mqttStatus === "connected"
          ? "✅ Conectado"
          : mqttStatus === "connecting"
          ? "🟡 Conectando..."
          : mqttStatus === "reconnect"
          ? "🟠 Reintentando…"
          : mqttStatus === "closed"
          ? "🔴 Cerrado"
          : "❌ Error"}
      </div>

      {mqttErr && (
        <div className="text-xs rounded-lg border border-red-500/50 p-3">
          <div className="font-medium mb-1">Error</div>
          <pre className="whitespace-pre-wrap break-all">{mqttErr}</pre>
        </div>
      )}

      <div className="text-sm">
        <div className="font-medium">Suscripción</div>
        <code>liwa/+/+/telemetry/#</code>
      </div>

      <div className="text-sm">
        <div className="font-medium">Últimos mensajes ({items.length})</div>
        <div className="mt-2 grid gap-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border border-neutral-700 p-3">
              <div className="text-xs opacity-70">
                {new Date(it.ts).toLocaleString()}
              </div>
              <div className="font-mono text-xs break-all mt-1">
                <div>
                  <span className="opacity-70">topic:</span> {it.topic}
                </div>
                <div className="mt-1">
                  <span className="opacity-70">payload:</span> {it.payload}
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="opacity-70">Aún no han llegado mensajes…</div>
          )}
        </div>
      </div>
    </main>
  );
}



