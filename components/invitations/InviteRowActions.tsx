// components/invitations/InviteRowActions.tsx
"use client";

type Props = {
  id: string;                       // invitation.id (UUID)
  onResend?: (id: string) => void;  // callback para reenviar email
  onCancel?: (id: string) => void;  // callback para cancelar invitación
};

export default function InviteRowActions({ id, onResend, onCancel }: Props) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => onResend?.(id)}
        className="text-sky-300 hover:underline"
        title="Reenviar invitación por email"
      >
        Reenviar
      </button>

      <span className="text-slate-600">/</span>

      <button
        type="button"
        onClick={() => onCancel?.(id)}
        className="text-red-300 hover:underline"
        title="Cancelar invitación"
      >
        Cancelar
      </button>
    </div>
  );
}
