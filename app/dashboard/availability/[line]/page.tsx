"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

/* ===== Tipos ===== */
type LineDetail = {
  line_code: string;
  availability?: number | null;
  planned_s?: number | null;
  unplanned_s?: number | null;
  runtime_s?: number | null;
  events?: Array<{
    id: string;
    started_at: string;      // ISO
    ended_at: string | null; // ISO | null
    duration_s: number;
    machine_code?: string | null;
    n2?: string | null;
    n3?: string | null;
    classified?: boolean | null;
    notes?: string | null;
  }>;
};

type KpiRow = {
  line_code: string | null;
  availability: number | null;
};

type KpisResponse =
  | { ok: true; rows: KpiRow[] }
  | { ok: false; error: string }
  | any;

/* ===== Helpers ===== */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null) => `${(clamp01(n) * 100).toFixed(1)}%`;

const fmtHM = (s?: number | null) => {
  const v = Math.max(0, Math.floor(Number(s || 0)));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/* ===== Página ===== */
export default function AvailabilityByLinePage({ params }: { params: { line: string } }) {
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const qs = (() => {
    const u = new URLSearchParams();
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    const s = u.toString();
    return s ? `?${s}` : "";
  })();

  const lineParam = decodeURIComponent(params.line || "").toUpperCase();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<LineDetail | null>(null);

  useEffect(() => {
    let mounted = true;

    const safeJson = async (res: Response) => {
      try {
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // (1) KPI base de la línea (con rango)
        const u = new URL("/api/kpis", window.location.origin);
        if (from) u.searchParams.set("from", from);
        if (to) u.searchParams.set("to", to);
        u.searchParams.set("step", "all");
        const resK = await fetch(u.toString(), { cache: "no-store" });
        const jsonK = (await safeJson(resK)) as KpisResponse | null;

        const row = jsonK?.ok
          ? (jsonK.rows || []).find(
              (r) => (r.line_code || "").toUpperCase() === lineParam
            )
          : null;

        // (2) Detalle desde endpoint real (si existe) con rango
        let det: LineDetail | null = null;
        try {
          const u2 = new URL("/api/availability", window.location.origin);
          u2.searchParams.set("line", lineParam);
          if (from) u2.searchParams.set("from", from);
          if (to) u2.searchParams.set("to", to);
          const resA = await fetch(u2.toString(), { cache: "no-store" });
          const jA = await safeJson(resA);
          if (jA && jA.ok) det = jA.data as LineDetail;
        } catch { /* sin endpoint; mock abajo */ }

        // (3) Mock consistente si no hay endpoint real
        if (!det) {
          const a = row?.availability ?? 0.86;
          const planned = 8 * 3600; // 8h
          const unplanned = Math.round(planned * Math.max(0, 1 - clamp01(a)) * 0.8);
          const runtime = planned - unplanned;

          const now = new Date();
          const iso = (d: Date) => d.toISOString();
          const mkEvent = (mins: number, n2: string, n3: string, offsetMin: number, machine = "E1") => {
            const end = new Date(now.getTime() - offsetMin * 60 * 1000);
            const start = new Date(end.getTime() - mins * 60 * 1000);
            return {
              id: uid(),
              started_at: iso(start),
              ended_at: iso(end),
              duration_s: mins * 60,
              machine_code: machine,
              n2, n3,
              classified: Math.random() > 0.3,
              notes: null,
            };
          };

          det = {
            line_code: lineParam,
            availability: a,
            planned_s: planned,
            unplanned_s: unplanned,
            runtime_s: runtime,
            events: [
              mkEvent(35, "Avería", "Atasco en salida", 45, "E2"),
              mkEvent(22, "Setup", "Cambio de formato", 160, "E1"),
              mkEvent(12, "Microparo", "Sensor ocupado", 260, "E3"),
              mkEvent(18, "Avería", "Corte de cinta", 360, "E1"),
              mkEvent(8, "Calidad", "Revisión de lote", 500, "E2"),
            ],
          };
        }

        if (!mounted) return;

        if (row && (det?.availability == null)) {
          det = { ...(det || { line_code: lineParam }), availability: row.availability };
        }

        setDetail(det || { line_code: lineParam });
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setDetail({ line_code: lineParam });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [lineParam, from, to]);

  const events = useMemo(
    () => (detail?.events || []).slice().sort((a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    ),
    [detail]
  );

  return (
    <main className="max-w-7xl mx-auto px-5 py-8 text-slate-100">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">
            <Link href={`/dashboard${qs}`} className="hover:underline">Dashboard</Link>
            <span className="mx-2">/</span>
            <Link href={`/dashboard/availability${qs}`} className="hover:underline">Disponibilidad</Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-emerald-300">{lineParam}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">Disponibilidad · {lineParam}</h1>
        </div>
        <Link
          href={`/dashboard/availability${qs}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          ← Volver a ranking
        </Link>
      </div>

      {/* Resumen KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <CardMini title="Disponibilidad" value={pct(detail?.availability)} ring="ring-emerald-400/90" />
        <CardMini title="Planificado" value={fmtHM(detail?.planned_s)} />
        <CardMini title="Paro (no planificado)" value={fmtHM(detail?.unplanned_s)} />
        <CardMini title="En marcha" value={fmtHM(detail?.runtime_s)} />
      </div>

      {err && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}

      {/* Paros recientes */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Paros recientes (no planificados)</h2>
          <div className="text-sm text-slate-400">
            {loading ? "Cargando…" : `${events.length} evento${events.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70">
              <tr className="text-slate-400 whitespace-nowrap">
                <th className="text-left py-2 pr-4">Fecha</th>
                <th className="text-left py-2 px-4">Máquina</th>
                <th className="text-left py-2 px-4">N2</th>
                <th className="text-left py-2 px-4">N3</th>
                <th className="text-right py-2 px-4 w-28">Duración</th>
                <th className="text-right py-2 px-4 w-32">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>Cargando…</td>
                </tr>
              )}
              {!loading && events.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>Sin paros registrados.</td>
                </tr>
              )}
              {!loading && events.map((e) => {
                const state = e.classified ? "Clasificado" : "Pendiente";
                const stateCls = e.classified ? "text-emerald-300" : "text-amber-300";
                return (
                  <tr key={e.id} className="border-t border-white/10 hover:bg-white/[0.06] transition-colors">
                    <td className="py-3 pr-4">{dtf.format(new Date(e.started_at))}</td>
                    <td className="py-3 px-4">{e.machine_code || "—"}</td>
                    <td className="py-3 px-4">{e.n2 || "—"}</td>
                    <td className="py-3 px-4">{e.n3 || "—"}</td>
                    <td className="py-3 px-4 text-right">{fmtHM(e.duration_s)}</td>
                    <td className={`py-3 px-4 text-right ${stateCls}`}>{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href={`/pending?line=${encodeURIComponent(lineParam)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium px-4 py-2"
          >
            Clasificar paros →
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ===== UI bits ===== */
function CardMini({ title, value, ring = "ring-white/10" }: { title: string; value: string; ring?: string }) {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
        <div className="text-slate-200/90 text-sm">{title}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value || "—"}</div>
      </div>
      <div className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ring-2 ${ring}`} />
    </div>
  );
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
