// app/debug/session/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export default async function DebugSessionPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data, error } = await supabase.auth.getSession();
  const user = data?.session?.user ?? null;

  return (
    <pre style={{ padding: 16 }}>
      {JSON.stringify({ user, error: error?.message ?? null, hint: "If user is null, sign in at /signin" }, null, 2)}
    </pre>
  );
}
