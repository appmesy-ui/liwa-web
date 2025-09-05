// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "LIWA",
    template: "LIWA – %s",
  },
  description: "Plataforma de análisis y gestión operativa",
  icons: {
    icon: "/liwa.svg", // favicon
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  );
}
