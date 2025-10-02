// components/AppHeader.tsx
"use client";

import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import AiDiscoButton from "../components/AiDiscoButton";

/* Botón Cerrar sesión (inline) */
function SignOutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/signin");
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

type Props = {
  orgName?: string;
  userEmail?: string;
  fromISO?: string;
  toISO?: string;
};

export default function AppHeader({ orgName, userEmail, fromISO, toISO }: Props) {
  const pathname = usePathname();
  const supabase = createClientComponentClient();

  // ⛔️ Si estamos en /signin no renderizamos NADA del header
  if (pathname.startsWith("/signin")) return null;

  const [hydrated, setHydrated] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean>(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) setIsAuthed(!!data.session?.user);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session?.user);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const dtf = useMemo(
    () =>
      new Intl.DateTimeFormat("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    []
  );

  const nextParam = encodeURIComponent(pathname || "/dashboard");
  const signinHref = `/signin?next=${nextParam}`;

  const onDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // ====== HEADER MINIMAL SIN SESIÓN ======
  if (hydrated && !isAuthed) {
    return (
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <Image src="/liwa-logo.svg" alt="LIWA" width={32} height={32} priority />
            <span className="text-sm text-slate-300">LIWA</span>
          </a>
          <a
            href={signinHref}
            className="inline-flex items-center rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium hover:bg-sky-600"
          >
            Iniciar sesión
          </a>
        </div>
      </header>
    );
  }

  // ====== HEADER COMPLETO CON SESIÓN ======
  return (
    <>
      {/* Top Nav (Dashboard | IA | Pendientes | Configuración) */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          {/* Izquierda */}
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-300">
                LIWA
              </span>
              <span className="text-sm text-slate-300">Dashboard</span>
            </a>

            {/* 👉 IA circular justo a la derecha de “Dashboard” */}
            {onDashboard && <AiDiscoButton className="ml-1 h-8 w-8" />}
          </div>

          {/* Derecha */}
          <nav className="flex items-center gap-4">
            <a href="/pending" className="text-sm text-slate-300 hover:text-white">
              Pendientes
            </a>
            <a
              href="/settings"
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
            >
              Configuración
            </a>
            <SignOutButton />
          </nav>
        </div>
      </header>

      {/* Header informativo de página */}
      <div className="w-full border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Izquierda: logo + by TecnoFab + volver en /pending */}
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="inline-flex items-center gap-4">
              <Image src="/liwa-logo.svg" alt="LIWA" width={64} height={64} priority />
              <span className="text-sm text-slate-500">by TecnoFab</span>
            </a>

            {pathname.startsWith("/pending") && (
              <a
                href="/dashboard"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900/60"
              >
                ← Volver al dashboard
              </a>
            )}
          </div>

          {/* Derecha: organización, usuario, rango */}
          <div className="flex items-center gap-4 text-sm text-slate-300">
            {hydrated && (
              <>
                {orgName && <span className="font-medium text-slate-200">{orgName}</span>}
                {userEmail && <span className="text-slate-400">{userEmail}</span>}
                {fromISO && toISO && (
                  <span className="text-slate-400">
                    Últimas 24h · {dtf.format(new Date(fromISO))} → {dtf.format(new Date(toISO))}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
