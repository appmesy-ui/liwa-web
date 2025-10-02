// app/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppHeader from "../components/AppHeader";

export const metadata: Metadata = {
  title: "LIWA",
  description: "Operaciones con LIWA",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LIWA",
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5b7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full bg-slate-950">
      <body className="min-h-screen h-full bg-slate-950 text-slate-100 antialiased">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
