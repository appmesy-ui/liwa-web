// app/invite/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type InvitePreview = {
  id: string;
  org_id: string;
  org_name?: string | null;
  email: string;
  role: "superuser" | "admin" | "supervisor" | "operario" | "viewer";
  status: "pending" | "accepted" | "expired" | "cancelled";
  created_at?: string | null;
  accepted_at?: string | null;
  expires_at?: string | null;
};

export default function InvitePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const expired = useMemo(() => {
    if (!inv?.expires_at) return false;
    return new Date(inv.expires_at).getTime() < Date.now();
  }, [inv]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/invitations/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "No se encontró la invitación.");
      setInv(j.data as InvitePreview);
    } catch (e: any) {
      setInv(null);
      setError(e?.message || "No se pudo cargar la invitación.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept() {
    if (!inv) return;
    setAccepting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/invitations/${inv.id}/accept`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // mensajes simples y claros
        if (res.status === 401) throw new Error("Debes iniciar sesión.");
        if (res.status === 403) throw new Error("Esta invitación no corresponde a tu cuenta.");
        throw new Error(j?.error || "No se pudo aceptar la invitación.");
      }
      setOkMsg("¡Invitación aceptada! Redirigiendo…");
      setTimeout(() => router.push("/"), 800);
    } catch (e: any) {
      setError(e?.message || "No se pudo aceptar la invitación.");
    } finally {
      setAccepting(false);
      load();
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">Invitación a una organización</h1>
      <p className="text-sm text-slate-400 mb-4">
        Este enlace te permite unirte con el rol asignado.
      </p>

      {loading && <div className="text-slate-400 text-sm">Cargando…</div>}

      {!loading && error && (
        <div className="rounded-md border border-red-800 bg-red-900/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {!loading && okMsg && (
        <div className="rounded-md border border-emerald-800 bg-emerald-900/30 p-3 text-emerald-200 text-sm">
          {okMsg}
        </div>
      )}

      {!loading && inv && (
        <>
          <div className="mt-4 space-y-3 rounded-xl border border-slate-800 p-4">
            <div className="text-sm">
              <div className="text-slate-400">Organización</div>
              <div className="font-medium">{inv.org_name || inv.org_id}</div>
            </div>
            <div className="text-sm">
              <div className="text-slate-400">Invitado</div>
              <div className="font-mono">{inv.email}</div>
            </div>
            <div className="text-sm">
              <div className="text-slate-400">Rol</div>
              <div className="font-medium capitalize">{inv.role}</div>
            </div>
            <div className="text-sm">
              <div className="text-slate-400">Estado</div>
              <div className="font-medium">{inv.status}</div>
            </div>
            {inv.expires_at && (
              <div className="text-sm">
                <div className="text-slate-400">Expira</div>
                <div>{new Date(inv.expires_at).toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="mt-6">
            {inv.status !== "pending" ? (
              <div className="text-sm text-slate-400">
                Esta invitación ya no está disponible ({inv.status}). Pide al administrador que te envíe una nueva.
              </div>
            ) : expired ? (
              <div className="text-sm text-slate-400">
                Esta invitación ha expirado. Solicita un reenvío al administrador.
              </div>
            ) : (
              <button
                onClick={accept}
                disabled={accepting}
                className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {accepting ? "Aceptando…" : "Aceptar invitación"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
