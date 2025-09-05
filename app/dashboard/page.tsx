import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import SignOutButton from "../../components/SignOutButton";

export default async function DashboardPage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">LIWA — Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <section className="grid gap-4">
        <div className="rounded-2xl shadow p-6">
          <p className="text-gray-700">
            Bienvenido. Próximo paso: conectar las vistas SQL (OEE, Disponibilidad, etc.).
          </p>
        </div>
      </section>
    </main>
  );
}
