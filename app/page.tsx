// app/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

import { redirect } from "next/navigation";
export default function Home() {
  redirect("/signin");
}
