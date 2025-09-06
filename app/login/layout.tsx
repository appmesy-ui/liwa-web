// app/login/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout mínimo: no mete <html>/<body> (eso ya lo hace el root layout)
  // No hace ningún fetch ni lógica que fuerce prerender.
  return <section>{children}</section>;
}
