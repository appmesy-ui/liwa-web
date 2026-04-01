"use client";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

export default function SignOutButton() {
  const supabase = getSupabaseBrowserClient();

  const handle = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <button
      onClick={handle}
      className="px-3 py-2 rounded-2xl shadow hover:opacity-90"
    >
      Cerrar sesión
    </button>
  );
}
