// app/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import { redirect } from "next/navigation";

export default function Home() {
  // Por defecto redirige a /login
  // (si hay sesión, /login ya manda a /dashboard)
  redirect("/login");
}
