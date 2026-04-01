// lib/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient<any, any, any> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<any, any, any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 🔒 SSR / prerender: sin persistencia ni auto refresh
  if (typeof window === "undefined") {
    return createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      db: { schema: "liwa" },
    }) as SupabaseClient<any, any, any>;
  }

  // 🧭 Navegador: ✅ persistente y con auto-refresh de forma normal
  if (browserClient) return browserClient;
  browserClient = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    db: { schema: "liwa" },
  }) as SupabaseClient<any, any, any>;

  return browserClient;
}
