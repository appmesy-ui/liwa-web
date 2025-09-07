// app/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIWA",
  description: "Operaciones con LIWA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
