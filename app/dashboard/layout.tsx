// app/dashboard/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /** NavLink con soporte de “exact” para evitar falsos positivos */
  function NavLink({
    href,
    label,
    exact = false,
  }: {
    href: string;
    label: string;
    exact?: boolean;
  }) {
    const isActive = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

    return (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={[
          // base (píldoras / tabs)
          "relative px-4 py-2 rounded-xl text-sm font-medium transition",
          "border border-white/10",
          "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
          "hover:border-cyan-300/40 hover:from-white/[0.09]",
          // activo
          isActive
            ? "text-cyan-100 ring-1 ring-inset ring-cyan-300/40 shadow-[0_10px_30px_-12px_rgba(34,211,238,.55)]"
            : "text-slate-300",
        ].join(" ")}
      >
        <span className="relative z-10">{label}</span>
        {isActive && (
          <span
            className="absolute -bottom-1 left-2 right-2 h-[2px] rounded-full
                       bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-500"
          />
        )}
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b18] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-cyan-300/10 bg-[#050b18]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-4">
          {/* Tabs (solo Dashboard y Live) */}
          <nav className="flex items-center gap-2">
            <NavLink href="/dashboard" label="Dashboard" exact />
            <NavLink href="/dashboard/live" label="Live" />
          </nav>

          <div className="flex-1" />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}


