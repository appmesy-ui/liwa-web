// app/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import "./globals.css";
import type { Metadata } from "next";
import AuthSync from "../components/AuthSync";

export const metadata: Metadata = {
  title: "LIWA",
  description: "Operaciones con LIWA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full bg-slate-950">
      <body className="min-h-screen h-full bg-slate-950 text-slate-100 antialiased">
        <AuthSync />
        {children}
      </body>
    </html>
  );
}
