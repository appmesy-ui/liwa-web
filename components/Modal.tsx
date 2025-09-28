"use client";

import { useEffect } from "react";
import clsx from "clsx";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  sizeClassName?: string; // ej: "sm:max-w-4xl"
  children: React.ReactNode;
};

export default function Modal({ open, onClose, title, sizeClassName, children }: Props) {
  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel centrado */}
      <div
        className={clsx(
          "relative z-10 w-full max-w-[92vw] rounded-2xl border border-white/10 bg-[#0b1220] text-slate-100 shadow-2xl",
          "flex flex-col max-h-[80vh] min-h-[56vh]", // <-- altura mínima + tope
          sizeClassName
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-base font-semibold">{title ?? "Modal"}</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>

        {/* Body: ocupa el resto y siempre tiene altura visible */}
        <div className="flex-1 overflow-auto p-4 min-h-[40vh]">
          {children}
        </div>
      </div>
    </div>
  );
}
