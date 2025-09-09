// app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ==== Tipos de datos ==== */
type KpiRow = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
};

type KpisResponse = { ok: boolean; rows: KpiRow[]; error?: string };
type PendingCountResponse = { ok: boolean; count: number; error?: string };
type SeriesRow = { bucket_ts: string; line_code: string | null; oee: number | null };
type SeriesResp = { ok: boolean; rows: SeriesRow[]; error?: string };

/* ==== Helpers ==== */
function clamp01(n: number | null | undefined) {
  if (n == null || isNaN(n as number)) return 0;
  return Math.max(0, Math.min(1, Number(n)));
}
function pct(n: number | null | undefined) {
  const v = clamp01(n);
  return `${(v * 100).toFixed(1)}%`;
}

const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/* ==== Botón Cerrar sesión ==== */
function SignOutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      onClick={signOut}
      className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900/60"
      title="Cerrar sesión"
    >
      Cerrar sesión
    </button>
  );
}

/* ==== Página ==== */
export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [hydrated, setHydrated] = useState(false);

  const [fromISO, setFromISO] = useState("");
  const [toISO, setToISO] = useState("");

  const [rows, setRows] = useState<KpiRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Header: org y usuario
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  // Sparklines
  const [seriesByLine, setSeriesByLine] = useState<Record<string, number[]>>({});

  /* Rango inicial 24h */
  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setToISO(to.toISOString());
    setFromISO(from.toISOString());
    setHydrated(true); // << solo después de setear fechas
  }, []);

  /* Cargar email y organización, solo en cliente */
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUserEmail(data.session?.user?.email ?? null);
      } catch {
        setUserEmail(null);
      }

      try {
        const meRes = await fetch("/api/me");
        const me = await meRes.json();
        if (me?.ok && Array.isArray(me.orgs) && me.orgs.length) {
          setOrgName(me.orgs[0]?.name ?? null);
        } else {
          setOrgName(null);
        }
      } catch {
        setOrgName(null);
      }
    })();
  }, [hydrated, supabase]);

  /* Cargar KPIs + pendientes + series */
  useEffect(() => {
    if (!hydrated || !fromISO || !toISO) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [kpisRes, pendingRes, seriesRes] = await Promise.all([
          fetch(
            `/api/kpis?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(
              toISO
            )}`
          ),
          fetch(
            `/api/pending-count?from=${encodeURIComponent(
              fromISO
            )}&to=${encodeURIComponent(toISO)}`
          ),
          fetch(
            `/api/kpis-series?from=${encodeURIComponent(
              fromISO
            )}&to=${encodeURIComponent(toISO)}`
          ),
        ]);

        const kpisJson = (await kpisRes.json()) as KpisResponse | any;
        const pendJson = (await pendingRes.json()) as PendingCountResponse | any;
        const seriesJson = (await seriesRes.json()) as SeriesResp | any;

        if (!mounted) return;

        if (!kpisJson?.ok) {
          setErr(kpisJson?.error || "Error cargando KPIs");
          setRows([]);
        } else {
          const sorted = (kpisJson.rows || [])
            .slice()
            .sort((a: KpiRow, b: KpiRow) =>
              (a.line_code || "").localeCompare(b.line_code || "")
            );
          setRows(sorted);
        }

        setPendingCount(pendJson?.ok ? Number(pendJson.count ?? 0) : 0);

        const by: Record<string, number[]> = {};
        if (seriesJson?.ok) {
          const arr: SeriesRow[] = seriesJson.rows || [];
          arr.sort(
            (a, b) =>
              new Date(a.bucket_ts).getTime() - new Date(b.bucket_ts).getTime()
          );
          for (const r of arr) {
            const code = (r.line_code || "—").toUpperCase();
            if (!by[code]) by[code] = [];
            by[code].push(clamp01(r.oee));
          }
        }
        setSeriesByLine(by);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error inesperado");
        setRows([]);
        setPendingCount(0);
        setSeriesByLine({});
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [hydrated, fromISO, toISO]);

  const agg = useMemo(() => {
    if (!rows.length) return null;
    const totPlan = rows.reduce((acc, r) => acc + (r.planned_runtime_sec ?? 0), 0);
    const w = (r: KpiRow) => (r.planned_runtime_sec ?? 0) / (totPlan || 1);
    const availability =
      rows.reduce((a, r) => a + clamp01(r.availability) * w(r), 0) || 0;
    const performance =
      rows.reduce((a, r) => a + clamp01(r.performance) * w(r), 0) || 0;
    const quality = rows.reduce((a, r) => a + clamp01(r.quality) * w(r), 0) || 0;
    const oee = availability * performance * quality;
    return { availability, performance, quality, oee };
  }, [rows]);

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100">
      {/* ===== Header ===== */}
      <header className="w-full border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Izquierda: logo más grande + by TecnoFab pequeño */}
          <div className="flex items-center gap-4">
            <Image
              src="/liwa-logo.svg"
              alt="LIWA"
              width={140} // tamaño aumentado
              height={64}
              priority
            />
            <span className="text-sm text-slate-500">by TecnoFab</span>
          </div>

          {/* Derecha: organización, usuario, rango, logout */}
          <div className="flex items-center gap-4 text-sm text-slate-300">
            {!hydrated ? null : (
              <>
                {orgName && (
                  <span className="font-medium text-slate-200">{orgName}</span>
                )}
                {userEmail && <span className="text-slate-400">{userEmail}</span>}
                {fromISO && toISO && (
                  <span className="text-slate-400">
                    Últimas 24h · {dtf.format(new Date(fromISO))} →{" "}
                    {dtf.format(new Date(toISO))}
                  </span>
                )}
                <SignOutButton />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== Contenido ===== */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

        {err && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
            {err}
          </div>
        )}

        {/* Tarjetas KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <KpiCard
            title="OEE"
            valueNum={agg?.oee ?? null}
            value={!hydrated || loading ? "…" : pct(agg?.oee ?? null)}
            subtitle="A × P × Q"
          />
          <KpiCard
            title="Disponibilidad"
            valueNum={agg?.availability ?? null}
            value={!hydrated || loading ? "…" : pct(agg?.availability ?? null)}
          />
          <KpiCard
            title="Rendimiento"
            valueNum={agg?.performance ?? null}
            value={!hydrated || loading ? "…" : pct(agg?.performance ?? null)}
          />
        </div>

        {/* Tabla por línea + sparkline */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 mb-8">
          <h2 className="text-lg font-medium mb-3">KPIs por línea</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-900/70 backdrop-blur z-10">
                <tr className="text-slate-400">
                  <th className="text-left py-2 pr-4">Línea</th>
                  <th className="text-right py-2 px-4 w-48">A</th>
                  <th className="text-right py-2 px-4 w-48">P</th>
                  <th className="text-right py-2 px-4 w-48">Q</th>
                  <th className="text-right py-2 px-4 w-48">OEE</th>
                  <th className="text-right py-2 pl-4 w-[140px]">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr>
                    <td className="py-3 text-slate-400" colSpan={6}>
                      {!hydrated || loading ? "Cargando…" : "Sin datos"}
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const code = (r.line_code || "—").toUpperCase();
                  const a = clamp01(r.availability),
                    p = clamp01(r.performance),
                    q = clamp01(r.quality),
                    oee = clamp01(r.oee);
                  const serie = seriesByLine[code] || [];
                  return (
                    <tr
                      key={code}
                      className="border-t border-slate-800/70 hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="py-3 pr-4 font-medium">{code}</td>
                      <td className="py-3 px-4 text-right">{pct(a)}</td>
                      <td className="py-3 px-4 text-right">{pct(p)}</td>
                      <td className="py-3 px-4 text-right">{pct(q)}</td>
                      <td className="py-3 px-4 text-right">{pct(oee)}</td>
                      <td className="py-3 pl-4 text-right">
                        <Sparkline values={serie} width={130} height={26} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bloque pendientes + CTA */}
        <div className="flex items-center justify-between">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4">
            <div className="text-sm text-slate-400">Paros sin clasificar</div>
            <div className="text-3xl font-semibold mt-1">
              {!hydrated || loading ? "…" : pendingCount}
            </div>
          </div>
          <a
            href="/pending"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-5 py-3 transition"
          >
            Ver pendientes <span className="text-sm opacity-80">→</span>
          </a>
        </div>
      </section>
    </main>
  );
}

/* ==== UI helpers ==== */
function KpiCard(props: {
  title: string;
  valueNum?: number | null;
  value: string;
  subtitle?: string;
}) {
  const { title, value, valueNum, subtitle } = props;
  const p = clamp01(valueNum ?? 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-sm">{title}</div>
        {subtitle ? (
          <div className="text-xs px-2 py-1 rounded-lg border border-slate-700 text-slate-400">
            {subtitle}
          </div>
        ) : (
          <span />
        )}
      </div>
      <div className="mt-2 text-4xl font-semibold">{value}</div>
      <div className="mt-4 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${p * 100}%`,
            background:
              "linear-gradient(90deg, rgba(16,185,129,0.9) 0%, rgba(34,197,94,0.9) 50%, rgba(59,130,246,0.9) 100%)",
          }}
        />
      </div>
    </div>
  );
}

function Sparkline({
  values,
  width = 120,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const v = (values && values.length ? values : [0]).map(clamp01);
  const n = v.length;
  const pad = 1.5;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const max = Math.max(...v);
  const min = Math.min(...v);
  const range = Math.max(0.0001, max - min);
  const stepX = n > 1 ? w / (n - 1) : 0;

  const pts = v.map((val, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (range ? (val - min) / range : 0)) * h;
    return [x, y] as const;
  });

  const d = pts
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");

  const last = v[n - 1] ?? 0;
  const color = last < 0.75 ? "#f43f5e" : last < 0.9 ? "#f59e0b" : "#10b981";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
          <stop offset="60%" stopColor="#22c55e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.length > 0 && (
        <circle
          cx={pts[pts.length - 1][0]}
          cy={pts[pts.length - 1][1]}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}
