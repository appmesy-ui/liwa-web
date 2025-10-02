// app/settings/admin-users/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// 👇 import del componente de acciones (ajusta la ruta si tu árbol cambia)
import InviteRowActions from "../../../components/invitations/InviteRowActions";

type Invitation = {
  id: string;
  org_id: string;
  email: string;
  role: "superuser" | "admin" | "supervisor" | "operario" | "viewer";
  status?: "pending" | "accepted" | "expired" | "cancelled" | null;
  invited_by?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
};

type Member = {
  user_id: string;
  email: string;
  org_id: string;
  role: "superuser" | "admin" | "supervisor" | "operario" | "viewer";
  status: "active" | "disabled";
  joined_at: string | null;
};

const ROLE_LABEL: Record<Member["role"], string> = {
  superuser: "Superuser",
  admin: "Admin",
  supervisor: "Supervisor",
  operario: "Operario",
  viewer: "Viewer",
};

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // invite form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("viewer");
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/invitations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error al cargar datos");
      setInvitations(json.invitations ?? []);
      setMembers(json.members ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    if (!email.trim()) {
      setErr("Ingresa un email.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo invitar");
      setOkMsg(`Invitación enviada a ${email.trim()}`);
      setEmail("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudo invitar");
    } finally {
      setInviting(false);
    }
  }

  async function updateMember(
    userId: string,
    patch: Partial<Pick<Member, "role" | "status">>
  ) {
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/org-members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo actualizar el miembro");
      setOkMsg("Cambios guardados.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudieron guardar los cambios");
    }
  }

  function onRoleChange(userId: string, nextRole: Member["role"]) {
    updateMember(userId, { role: nextRole });
  }

  function onToggleStatus(userId: string, current: Member["status"]) {
    const next = current === "active" ? "disabled" : "active";
    updateMember(userId, { status: next });
  }

  // cancelar invitación (status -> 'cancelled')
  async function cancelInvitation(id: string) {
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/invitations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cancelar la invitación");
      setOkMsg("Invitación cancelada.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudo cancelar la invitación");
    }
  }

  // reenviar invitación
  async function resendInvitation(id: string) {
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/invitations/${id}/resend`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo reenviar la invitación");
      setOkMsg("Invitación re-enviada.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudo reenviar la invitación");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <nav className="text-sm text-slate-400 mb-2">
        <Link href="/settings" className="hover:underline">Configuración</Link>
        <span className="mx-1">/</span>
        <span className="text-slate-300">Administración de usuarios</span>
      </nav>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Administración de usuarios</h1>
        <button
          onClick={load}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
          title="Recargar"
        >
          Recargar
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Invita usuarios a tu organización, asigna roles y gestiona su acceso.
      </p>

      {okMsg && (
        <div className="mb-4 rounded-md border border-emerald-800 bg-emerald-900/30 p-3 text-emerald-200 text-sm">
          {okMsg}
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/30 p-3 text-red-200 text-sm">
          {err}
        </div>
      )}

      {/* Formulario de invitación */}
      <section className="mb-6 rounded-xl border border-slate-800 p-4">
        <h2 className="text-lg font-medium mb-3">Invitar usuario</h2>
        <form onSubmit={onInvite} className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1 md:col-span-2">
            <label className="text-xs text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="px-3 py-2 rounded-md border border-slate-800 bg-slate-900"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-slate-400">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Member["role"])}
              className="px-3 py-2 rounded-md border border-slate-800 bg-slate-900"
            >
              <option value="viewer">Viewer</option>
              <option value="operario">Operario</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
              <option value="superuser">Superuser</option>
            </select>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={inviting}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {inviting ? "Enviando…" : "Enviar invitación"}
            </button>
          </div>
        </form>
      </section>

      {/* Listados */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Miembros */}
        <section className="rounded-xl border border-slate-800 p-4">
          <h3 className="text-base font-semibold mb-3">Miembros</h3>
          {loading ? (
            <div className="text-slate-400 text-sm">Cargando…</div>
          ) : members.length === 0 ? (
            <div className="text-slate-400 text-sm">Aún no hay miembros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full table-fixed text-sm">
                <thead className="text-left text-slate-400">
                  <tr className="[&>th]:py-2 [&>th]:px-2">
                    <th className="w-[38%]">Email</th>
                    <th className="w-[16%]">Rol</th>
                    <th className="w-[14%]">Estado</th>
                    <th className="w-[22%]">Ingreso</th>
                    <th className="w-[10%] text-right pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {members.map((m) => (
                    <tr key={m.user_id} className="[&>td]:py-2 [&>td]:px-2 align-middle">
                      <td className="font-mono truncate">{m.email || "—"}</td>
                      <td>
                        <select
                          value={m.role}
                          onChange={(e) => onRoleChange(m.user_id, e.target.value as Member["role"])}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 w-full"
                          title="Cambiar rol"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="operario">Operario</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="admin">Admin</option>
                          <option value="superuser">Superuser</option>
                        </select>
                      </td>
                      <td>
                        <span className={m.status === "active" ? "text-emerald-300" : "text-slate-400"}>
                          {m.status === "active" ? "Activo" : "Deshabilitado"}
                        </span>
                      </td>
                      <td className="text-slate-400">
                        {m.joined_at ? new Date(m.joined_at).toLocaleString() : "—"}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => onToggleStatus(m.user_id, m.status)}
                          className="text-sky-300 hover:underline"
                          title={m.status === "active" ? "Deshabilitar" : "Habilitar"}
                        >
                          {m.status === "active" ? "Deshabilitar" : "Habilitar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Invitaciones */}
        <section className="rounded-xl border border-slate-800 p-4">
          <h3 className="text-base font-semibold mb-3">Invitaciones</h3>
          {loading ? (
            <div className="text-slate-400 text-sm">Cargando…</div>
          ) : invitations.length === 0 ? (
            <div className="text-slate-400 text-sm">No hay invitaciones.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full table-fixed text-sm">
                <thead className="text-left text-slate-400">
                  <tr className="[&>th]:py-2 [&>th]:px-2">
                    <th className="w-[40%]">Email</th>
                    <th className="w-[16%]">Rol</th>
                    <th className="w-[12%]">Estado</th>
                    <th className="w-[22%]">Creada</th>
                    <th className="w-[10%] text-right pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {invitations.map((i) => (
                    <tr key={i.id} className="[&>td]:py-2 [&>td]:px-2 align-middle">
                      <td className="truncate">{i.email}</td>
                      <td>{ROLE_LABEL[i.role]}</td>
                      <td>{i.status ?? "pending"}</td>
                      <td className="text-slate-400">
                        {i.created_at ? new Date(i.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="text-right">
                        {(!i.status || i.status === "pending") ? (
                          // 👉 usamos el componente con Copiar enlace + callbacks existentes
                          <InviteRowActions
                            id={i.id}
                            onResend={(id) => resendInvitation(id)}
                            onCancel={(id) => cancelInvitation(id)}
                          />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

