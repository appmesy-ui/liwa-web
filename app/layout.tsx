export const dynamic = "force-dynamic";
export const revalidate = false;

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import AiDiscoButton from "../components/AiDiscoButton";

export const metadata: Metadata = {
  title: "LIWA",
  description: "Operaciones con LIWA",

  // 👉 PWA manifest + theme
  manifest: "/manifest.webmanifest",
  themeColor: "#0ea5b7",

  // 👉 Iconos para navegadores y iOS
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },

  // 👉 Configuración especial para iOS
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LIWA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full bg-slate-950">
      <body className="min-h-screen h-full bg-slate-950 text-slate-100 antialiased">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-300">
                LIWA
              </span>
              <span className="hidden sm:inline text-sm text-slate-300">
                Dashboard
              </span>
            </Link>

            <nav className="flex items-center gap-4">
              <Link
                href="/pending"
                className="text-sm text-slate-300 hover:text-white"
              >
                Pendientes
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
              >
                Configuración
              </Link>
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

        {/* Botón flotante AI (Client Component) */}
        <AiDiscoButton />
      </body>
    </html>
  );
}

