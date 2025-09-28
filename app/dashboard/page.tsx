"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* =========================
   Tipos
========================= */
type KpiRow = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  trend_pp?: number | null;
  spark?: number[] | null;
};
type KpisResponse = {
  ok?: boolean;
  rows?: KpiRow[];
  series?: { bucket_ts: string; line_code: string | null; oee: number | null }[];
  pending?: number;
  error?: string;
};

/* =========================
   Helpers
========================= */
const clamp01 = (n?: number | null) =>
  Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));
const pct = (n?: number | null) => `${(clamp01(n) * 100).toFixed(1)}%`;
const dtf = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/* =========================
   Sign out
========================= */
function SignOutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
      title="Cerrar sesión"
    >
      Cerrar sesión
    </button>
  );
}

/* =========================
   Sparkline
========================= */
function Sparkline({ values, width = 120, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length === 0) return <svg width={width} height={height} aria-label="sparkline" />;
  const v = values.map((x) => clamp01(Number(x) > 1 ? Number(x) / 100 : Number(x)));
  const n = v.length, pad = 1.5, w = width - pad * 2, h = height - pad * 2;
  const max = Math.max(...v), min = Math.min(...v), range = Math.max(0.0001, max - min), stepX = n > 1 ? w / (n - 1) : 0;
  const pts = v.map((val, i) => [pad + i * stepX, pad + (1 - (range ? (val - min) / range : 0)) * h] as const);
  const d = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
  const last = v[n - 1] ?? 0;
  const color = last < 0.75 ? "#f43f5e" : last < 0.85 ? "#f59e0b" : "#10b981";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#22c55e" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#eab308" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#sparkGrad)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />
    </svg>
  );
}

/* =========================
   Tarjeta móvil por línea
========================= */
function LineCardMobile({ code, a, p, q, oee, serie }: { code: string; a: number; p: number; q: number; oee: number; serie: number[]; }) {
  const last = serie?.length ? serie[serie.length - 1] : oee;
  const color = last < 0.75 ? "bg-rose-400/20 text-rose-200" : last < 0.85 ? "bg-amber-400/20 text-amber-200" : "bg-emerald-400/20 text-emerald-200";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{code}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${color}`}>{pct(oee)}</span>
        </div>
        <div className="text-xs text-slate-400">A {pct(a)} · P {pct(p)} · Q {pct(q)}</div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="grow"><Sparkline values={serie} width={180} height={36} /></div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-slate-400">OEE</div>
          <div className="text-lg font-semibold">{pct(oee)}</div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   KPI Card
========================= */
function KpiCard({ title, valueNum, value, subtitle }: { title: string; valueNum?: number | null; value: string; subtitle?: string; }) {
  const v = clamp01(valueNum ?? 0);
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-slate-200/90 text-sm">{title}</div>
        {subtitle ? <div className="text-[11px] px-2 py-1 rounded-lg border border-white/10 text-slate-300/80">{subtitle}</div> : <span />}
      </div>
      <div className="mt-2 text-4xl font-semibold tracking-tight">{value}</div>
      <div className="mt-4 h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${v * 100}%`,
            background: "linear-gradient(90deg, rgba(59,130,246,.9) 0%, rgba(34,197,94,.95) 60%, rgba(234,179,8,.95) 100%)",
          }}
        />
      </div>
    </div>
  );
}

/* =========================
   Página
========================= */
export default function DashboardPage() {
  const supabase = createClientComponentClient();

  const [hydrated, setHydrated] = useState(false);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [fromISO, setFromISO] = useState("");
  const [toISO, setToISO] = useState("");

  const [rows, setRows] = useState<KpiRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  const [seriesByLine, setSeriesByLine] = useState<Record<string, number[]>>({});

  // --- filtro por línea ---
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  const lineCodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.line_code) set.add(r.line_code.toUpperCase());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (lineCodes.length && selectedLines.size === 0) {
      setSelectedLines(new Set(lineCodes));
    }
  }, [lineCodes, selectedLines.size]);

  const toggleLine = (code: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const selectAll = () => setSelectedLines(new Set(lineCodes));
  const selectNone = () => setSelectedLines(new Set());

  const rowsFiltered = useMemo(() => {
    if (!rows.length) return [];
    if (!selectedLines.size) return [];
    return rows.filter((r) => selectedLines.has((r.line_code || "").toUpperCase()));
  }, [rows, selectedLines]);

  // rango
  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    if (range === "24h") from.setDate(now.getDate() - 1);
    if (range === "7d") from.setDate(now.getDate() - 7);
    if (range === "30d") from.setDate(now.getDate() - 30);
    setToISO(now.toISOString());
    setFromISO(from.toISOString());
    setHydrated(true);
  }, [range]);

  // usuario/org
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUserEmail(data.session?.user?.email ?? null);
      } catch { setUserEmail(null); }
      try {
        const meRes = await fetch("/api/me");
        const me = await meRes.json();
        setOrgName(me?.ok && me.orgs?.[0]?.name ? me.orgs[0].name : null);
      } catch { setOrgName(null); }
    })();
  }, [hydrated, supabase]);

  // ========================
  //  Fetch KPIs robusto
  // ========================
  useEffect(() => {
    if (!hydrated || !fromISO || !toISO) return;
    let mounted = true;

    const parseJsonLoosely = async (res: Response) => {
      const txt = await res.text();
      try { return JSON.parse(txt); } catch { return null; }
    };

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) intento con rango
        const q = new URLSearchParams({ from: fromISO, to: toISO, step: "all" }).toString();
        let res = await fetch(`/api/kpis?${q}`);
        let json = (await parseJsonLoosely(res)) as KpisResponse | null;

        // si viene vacío, 2) intento sin rango
        if (!json || (!Array.isArray(json.rows) || json.rows.length === 0)) {
          const res2 = await fetch(`/api/kpis`);
          const json2 = (await parseJsonLoosely(res2)) as KpisResponse | null;
          if (json2) json = json2;
        }

        if (!mounted) return;

        const kRows: KpiRow[] = Array.isArray(json?.rows) ? (json!.rows as KpiRow[]) : [];
        setRows(kRows.slice().sort((a, b) => (a.line_code || "").localeCompare(b.line_code || "")));

        if (typeof json?.pending === "number") setPendingCount(Number(json?.pending ?? 0));
        else setPendingCount(0);

        // series (usa row.spark si viene)
        const by: Record<string, number[]> = {};
        for (const r of kRows) {
          const code = (r.line_code || "—").toUpperCase();
          const arr = Array.isArray(r.spark) ? r.spark : [];
          if (arr.length) {
            by[code] = arr.map((x) => clamp01((Number(x) > 1 ? Number(x) / 100 : Number(x)) || 0));
          }
        }
        if (json?.series?.length) {
          const arr = json.series.slice().sort(
            (a, b) => new Date(a.bucket_ts).getTime() - new Date(b.bucket_ts).getTime()
          );
          for (const r of arr) {
            const code = (r.line_code || "—").toUpperCase();
            const n = clamp01(Number(r.oee));
            if (!by[code]) by[code] = [];
            by[code].push(n);
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
    };

    load();
    return () => { mounted = false; };
  }, [hydrated, fromISO, toISO]);

  // usar todas las líneas si aún no hay selección
  const rowsForAgg = useMemo(
    () => (selectedLines.size ? rowsFiltered : rows),
    [selectedLines.size, rowsFiltered, rows]
  );

  const agg = useMemo(() => {
    const rs = rowsForAgg;
    if (!rs.length) return null;
    const totPlan = rs.reduce((acc, r) => acc + (r.planned_runtime_sec ?? 0), 0);
    const w = (r: KpiRow) => (r.planned_runtime_sec ?? 0) / (totPlan || 1);
    const availability = rs.reduce((a, r) => a + clamp01(r.availability) * w(r), 0);
    const performance  = rs.reduce((a, r) => a + clamp01(r.performance)  * w(r), 0);
    const quality      = rs.reduce((a, r) => a + clamp01(r.quality)      * w(r), 0);
    const oee = availability * performance * quality;
    return { availability, performance, quality, oee };
  }, [rowsForAgg]);

  const rangeBtn = (r: "24h" | "7d" | "30d") =>
    `px-3 py-1 rounded-lg text-xs ${
      range === r ? "bg-emerald-500 text-emerald-950 font-medium shadow-[0_10px_25px_-10px_rgba(16,185,129,.7)]"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
    }`;

  const rangeQS = useMemo(
    () => new URLSearchParams({ from: fromISO, to: toISO }).toString(),
    [fromISO, toISO]
  );

  return (
    <main className="min-h-screen w-full text-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur px-5">
        <div className="max-w-7xl mx-auto py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/liwa-logo.svg" alt="LIWA" width={132} height={56} priority />
            <div className="hidden md:block text-sm text-slate-400">by TecnoFab</div>
          </div>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            {orgName && <span className="text-slate-300">{orgName}</span>}
            {userEmail && <span className="hidden md:block text-slate-400">{userEmail}</span>}
            {fromISO && toISO && (
              <span className="text-slate-400/80">
                {range === "24h" ? "Últimas 24h" : range === "7d" ? "Últimos 7 días" : "Últimos 30 días"} ·{" "}
                {dtf.format(new Date(fromISO))} → {dtf.format(new Date(toISO))}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <button className={rangeBtn("24h")} onClick={() => setRange("24h")}>24h</button>
              <button className={rangeBtn("7d")} onClick={() => setRange("7d")}>7d</button>
              <button className={rangeBtn("30d")} onClick={() => setRange("30d")}>30d</button>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-5 py-8">
        {/* KPIs globales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <div className="relative group">
            <KpiCard title="OEE" valueNum={agg?.oee} value={!hydrated || loading ? "…" : pct(agg?.oee)} subtitle="A × P × Q" />
            <Link href={`/dashboard/oee?${rangeQS}`} aria-label="Ver detalle de OEE" className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition shadow-[0_0_0_2px_rgba(255,255,255,0.08)]" />
          </div>
          <div className="relative group">
            <KpiCard title="Disponibilidad" valueNum={agg?.availability} value={!hydrated || loading ? "…" : pct(agg?.availability)} />
            <Link href={`/dashboard/availability?${rangeQS}`} aria-label="Ver detalle de Disponibilidad" className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition shadow-[0_0_0_2px_rgba(255,255,255,0.08)]" />
          </div>
          <div className="relative group">
            <KpiCard title="Rendimiento" valueNum={agg?.performance} value={!hydrated || loading ? "…" : pct(agg?.performance)} />
            <Link href={`/dashboard/performance?${rangeQS}`} aria-label="Ver detalle de Rendimiento" className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition shadow-[0_0_0_2px_rgba(255,255,255,0.08)]" />
          </div>
          <div className="relative group">
            <KpiCard title="Calidad" valueNum={agg?.quality} value={!hydrated || loading ? "…" : pct(agg?.quality)} />
            <Link href={`/dashboard/quality?${rangeQS}`} aria-label="Ver detalle de Calidad" className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition shadow-[0_0_0_2px_rgba(255,255,255,0.08)]" />
          </div>
        </div>

        {err && <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">{err}</div>}

        {/* Filtro por línea */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-400">Filtrar líneas:</span>
          {lineCodes.map((code) => {
            const active = selectedLines.has(code);
            return (
              <button
                key={code}
                onClick={() => toggleLine(code)}
                className={
                  "px-3 py-1 rounded-full text-xs border transition " +
                  (active
                    ? "bg-emerald-600/90 border-emerald-500 text-white"
                    : "bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-700")
                }
              >
                {code}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button onClick={selectAll}  className="px-3 py-1 rounded-full text-xs border bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-700">Todos</button>
          <button onClick={selectNone} className="px-3 py-1 rounded-full text-xs border bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-700">Ninguno</button>
        </div>

        {/* KPIs por línea */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 mb-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold tracking-tight">KPIs por línea</h2>
            <div className="text-sm text-slate-400">
              {loading ? "Cargando…" : `${(selectedLines.size ? rowsFiltered.length : rows.length)} línea${(selectedLines.size ? rowsFiltered.length : rows.length) === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="overflow-x-auto hidden md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950/70">
                <tr className="text-slate-400 whitespace-nowrap">
                  <th className="text-left py-2 pr-4">Línea</th>
                  <th className="text-right py-2 px-4 w-28">A</th>
                  <th className="text-right py-2 px-4 w-28">P</th>
                  <th className="text-right py-2 px-4 w-28">Q</th>
                  <th className="text-right py-2 px-4 w-28">OEE</th>
                  <th className="text-right py-2 pl-4 w-[180px]">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {(selectedLines.size ? rowsFiltered : rows).map((r) => {
                  const code = (r.line_code || "—").toUpperCase();
                  const a = clamp01(r.availability), p = clamp01(r.performance), q = clamp01(r.quality), oee = clamp01(r.oee);
                  const serie = seriesByLine[code] || [];
                  let trendPP: number | null = null;
                  if (serie.length >= 2) trendPP = (serie[serie.length - 1] - serie[0]) * 100;
                  const arrow = trendPP == null ? "—" : trendPP > 0 ? "▲" : trendPP < 0 ? "▼" : "—";
                  const color = trendPP == null ? "text-slate-400" : trendPP > 0 ? "text-emerald-400" : trendPP < 0 ? "text-rose-400" : "text-slate-400";
                  const ppText = trendPP == null ? "—" : `${Math.abs(trendPP).toFixed(1)} pts`;
                  return (
                    <tr key={code} className="border-t border-white/10 hover:bg-white/[0.06] transition-colors">
                      <td className="py-3 pr-4 font-medium">{code}</td>
                      <td className="py-3 px-4 text-right">{pct(a)}</td>
                      <td className="py-3 px-4 text-right">{pct(p)}</td>
                      <td className="py-3 px-4 text-right">{pct(q)}</td>
                      <td className="py-3 px-4 text-right">{pct(oee)}</td>
                      <td className="py-3 pl-4">
                        <div className="flex items-center justify-end gap-2">
                          <Sparkline values={serie} />
                          <span className={`inline-flex items-center gap-1 text-xs ${color}`}>{arrow} {ppText}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {!(selectedLines.size ? rowsFiltered.length : rows.length) ? (
              <div className="py-3 text-slate-400">{!hydrated || loading ? "Cargando…" : "Sin datos"}</div>
            ) : (
              <div className="flex flex-col gap-3">
                {(selectedLines.size ? rowsFiltered : rows).map((r) => {
                  const code = (r.line_code || "—").toUpperCase();
                  const a = clamp01(r.availability), p = clamp01(r.performance), q = clamp01(r.quality), oee = clamp01(r.oee);
                  const serie = seriesByLine[code] || [];
                  return <LineCardMobile key={code} code={code} a={a} p={p} q={q} oee={oee} serie={serie} />;
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pendientes + CTA */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <div className="text-sm text-slate-300/80">Paros sin clasificar</div>
            <div className="text-3xl font-semibold mt-1 tracking-tight">{!hydrated || loading ? "…" : pendingCount}</div>
          </div>
          <a href="/pending" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium px-5 py-3 transition shadow-[0_10px_30px_-10px_rgba(16,185,129,.8)]">
            Ver pendientes <span className="text-sm opacity-80">→</span>
          </a>
        </div>
      </section>
    </main>
  );
}

