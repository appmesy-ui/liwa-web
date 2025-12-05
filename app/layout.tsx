// app/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppHeader from "../components/AppHeader";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase-env";

const supabase = createServerComponentClient(
  { cookies },
  {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
  }
);

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ Solo mostramos el header si hay sesión
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="es" className="h-full bg-slate-950">
      <body className="min-h-screen h-full bg-slate-950 text-slate-100 antialiased">
        {session ? <AppHeader /> : null}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
