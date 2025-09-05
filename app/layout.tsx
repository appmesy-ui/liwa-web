// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import RecoveryHashRedirect from "../components/RecoveryHashRedirect";

export const metadata: Metadata = {
  title: "LIWA",
  description: "TecnoFab — LIWA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* Detecta hash de recuperación en cualquier ruta pública y reenvía al callback */}
        <RecoveryHashRedirect />
        {children}
      </body>
    </html>
  );
}
