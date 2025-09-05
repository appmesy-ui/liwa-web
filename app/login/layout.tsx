// app/login/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIWA — Acceso",
  description: "Plataforma de análisis y gestión operativa",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
