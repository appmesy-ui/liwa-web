"use client";

import Image from "next/image";
import { SignOutButton } from "@/components/SignOutButton";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type Props = {
  orgName?: string;
  userEmail?: string;
  fromISO?: string;
  toISO?: string;
};

export default function AppHeader({ orgName, userEmail, fromISO, toISO }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  useEffect(() => setHydrated(true), []);

  const dtf = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <header className="w-full border-b border-slate-800/60 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Izquierda: logo + by TecnoFab */}
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="inline-flex items-center gap-4">
            <Image src="/liwa-logo.svg" alt="LIWA" width={64} height={64} priority />
            <span className="text-sm text-slate-500">by TecnoFab</span>
          </a>

          {/* Botón volver: solo visible en /pending */}
          {pathname.startsWith("/pending") && (
            <a
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900/60"
            >
              ← Volver al dashboard
            </a>
          )}
        </div>

        {/* Derecha: organización, usuario, rango, logout */}
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
              <SignOutButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

