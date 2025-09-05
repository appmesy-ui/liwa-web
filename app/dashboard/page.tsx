import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import SignOutButton from "../../components/SignOutButton";

export default async function DashboardPage() {
  const supabase = getSupabaseServerClient();

  // 1) Usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 2) Buscar su rol en app_user
  const { data: appUser, error } = await supabase
    .from("app_user")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">LIWA — Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {user.email} ({appUser?.role ?? "sin rol"})
          </span>
          <SignOutButton />
        </div>
      </header>

      <section className="grid gap-4">
        <div className="rounded-2xl shadow p-6">
          <p className="text-gray-700">
            Bienvenido {appUser?.role === "admin" ? "Administrador" : "Usuario"}.
          </p>
        </div>
      </section>
    </main>
  );
}
