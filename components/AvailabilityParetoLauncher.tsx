"use client";

import { useState, ReactNode } from "react";
import Modal from "./Modal";
import ParetoChart from "./ParetoChart";

type Props = {
  from?: string;
  to?: string;
  line?: string;                 // opcional: valor inicial
  line_field?: "line_id" | "line_code";
  children: ReactNode;           // tu card de Availability
};

export default function AvailabilityParetoLauncher({
  from,
  to,
  line,
  line_field = "line_id",
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative rounded-2xl">
        {children}

        {/* Botón circular (40px) arriba-derecha */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ver Pareto 80/20"
          title="Ver Pareto 80/20"
          className="
            absolute top-2 right-2
            h-10 w-10 inline-flex items-center justify-center
            rounded-full border-2 border-cyan-400/60
            text-cyan-300 bg-black/40 backdrop-blur-[2px]
            hover:bg-cyan-400/10 hover:border-cyan-400/80
            focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
            transition
          "
        >
          {/* Ícono Pareto */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 19V9" />
            <path d="M10 19v-6" />
            <path d="M15 19v-3" />
            <path d="M4 12c3-6 8-8 15-8" />
            <path d="M19 4l-2 1" />
          </svg>
        </button>
      </div>

      {/* Modal con Pareto */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pareto 80/20 · Pérdidas de Disponibilidad"
        sizeClassName="sm:max-w-5xl"
      >
        <ParetoChart
          from={from ?? "2025-08-30T00:00:00.000Z"}
          to={to ?? "2025-09-29T00:00:00.000Z"}
          scope={line ? "line" : "total"}
          line={line}
          line_field={line_field}
          defaultMetric="minutes"
          defaultTop={10}
          only_classified={true}
          include_planned={true}
        />
      </Modal>
    </>
  );
}
