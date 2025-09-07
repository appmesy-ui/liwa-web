import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export function getSupabaseServerClient() {
  // Para App Router: el helper ya gestiona cookies/sesión
  return createServerComponentClient({
    cookies,
  });
}
