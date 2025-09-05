"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function getSupabaseBrowserClient() {
  return createClientComponentClient();
}
