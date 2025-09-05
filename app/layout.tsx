import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIWA — Acceso",
  description: "Plataforma de análisis y gestión operativa",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Este layout envuelve al login y aplica metadata
  return children;
}
