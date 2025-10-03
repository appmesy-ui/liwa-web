// components/AppHeader.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import AiDiscoButton from "./AiDiscoButton";

/* Botón Cerrar sesión */
function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/signin");
  };

  return (
    <button
      onClick={signOut}
      className={`rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900/60 ${className}`}
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

  // ⛔️ Ocultar header en páginas públicas
  if (
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/invite")
  ) {
    return null;
  }

  const [hydrated, setHydrated] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

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

  // ====== HEADER COMPLETO (responsive) ======
  return (
    <>
      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          {/* Izquierda: hamburguesa en móvil / navegación en desktop */}
          <div className="flex items-center gap-3">
            {/* Hamburguesa (solo móvil) */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-900/60"
              aria-label="Abrir menú"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4 7h16a1 1 0 0 0 0-2H4a1 1 0 1 0 0 2Zm0 6h16a1 1 0 0 0 0-2H4a1 1 0 1 0 0 2Zm0 6h16a1 1 0 0 0 0-2H4a1 1 0 1 0 0 2Z"
                />
              </svg>
            </button>

            {/* Navegación (desktop) */}
            <nav className="hidden md:flex items-center gap-6">
              <a
                href="/dashboard"
                className={`text-sm hover:text-white ${
                  isActive("/dashboard") ? "text-white" : "text-slate-300"
                }`}
              >
                Dashboard
              </a>
              <a
                href="/pending"
                className={`text-sm hover:text-white ${
                  isActive("/pending") ? "text-white" : "text-slate-300"
                }`}
              >
                Pendientes
              </a>
              <a
                href="/settings"
                className={`text-sm hover:text-white ${
                  isActive("/settings") ? "text-white" : "text-slate-300"
                }`}
              >
                Configuración
              </a>
              <div className="ml-1">
                {/* Sin prop title, solo clase */}
                <AiDiscoButton className="h-8 w-8" />
              </div>
            </nav>
          </div>

          {/* Derecha: Cerrar sesión (solo desktop para no saturar móvil) */}
          <SignOutButton className="hidden md:inline-flex" />
        </div>
      </header>

      {/* Menú móvil (slide-in) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] border-r border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">Menú</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-900/60"
                aria-label="Cerrar menú"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6.225 4.811 4.811 6.225 9.586 11l-4.775 4.775 1.414 1.414L11 12.414l4.775 4.775 1.414-1.414L12.414 11l4.775-4.775-1.414-1.414L11 9.586z"
                  />
                </svg>
              </button>
            </div>

            <nav className="mt-4 flex flex-col gap-1">
              <a
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  isActive("/dashboard") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                Dashboard
              </a>
              <a
                href="/pending"
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  isActive("/pending") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                Pendientes
              </a>
              <a
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  isActive("/settings") ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                Configuración
              </a>

              <div className="mt-2 px-2">
                {/* Sin prop title */}
                <AiDiscoButton className="h-9 w-9" />
              </div>

              <div className="mt-4 border-t border-slate-800 pt-3">
                <SignOutButton className="w-full justify-center" />
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Subheader informativo (org · email · rango) */}
      <div className="w-full border-b border-slate-800/60 px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {orgName && <span className="font-medium text-slate-200">{orgName}</span>}
          {userEmail && <span className="text-slate-400">{userEmail}</span>}
          {fromISO && toISO && (
            <span className="text-slate-400">
              Últimas 24h · {dtf.format(new Date(fromISO))} → {dtf.format(new Date(toISO))}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

