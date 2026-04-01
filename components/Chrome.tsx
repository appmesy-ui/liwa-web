// components/Chrome.tsx
"use client";

import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import AiDiscoButton from "./AiDiscoButton";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Ocultar la “cromática” (header/botón) en el flujo de invitación
  const hideChrome = pathname?.startsWith("/invite");

  return (
    <>
      {!hideChrome && <AppHeader />}

      <main className={hideChrome ? "mx-auto max-w-3xl px-4 py-6" : "mx-auto max-w-6xl px-4 py-6"}>
        {children}
      </main>

      {/* El botón solo cuando mostramos el header */}
      {!hideChrome && <AiDiscoButton />}
    </>
  );
}
