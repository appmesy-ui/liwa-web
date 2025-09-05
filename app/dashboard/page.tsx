"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "../../lib/auth/useAuthSession";

export default function DashboardPage() {
  const router = useRouter();
  const status = useAuthSession();

  // Anti doble navegación
  const navigated = useRef(false);
  const safeReplace = (path: string) => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(path);
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen overflow-y-scroll grid place-items-center">
        <p className="text-slate-600">Cargando…</p>
      </main>
    );
  }

  if (status === "unauthed") {
    safeReplace("/login");
    return (
      <main className="min-h-screen overflow-y-scroll grid place-items-center">
        <p className="text-slate-600">Redirigiendo a login…</p>
      </main>
    );
  }

  // status === 'authed' → renderizamos el dashboard real
  return (
    <main className="min-h-screen overflow-y-scroll p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {/* ...tu contenido... */}
    </main>
  );
}
