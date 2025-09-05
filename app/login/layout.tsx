// app/login/layout.tsx
export const metadata = {
  title: "LIWA — Acceso",
  description: "Plataforma de análisis y gestión operativa",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // IMPORTANTE: no pongas "use client" aquí
  return <>{children}</>;
}
