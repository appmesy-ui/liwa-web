// components/AvailabilityParetoLauncher.tsx
"use client";

import { useState, ReactNode } from "react";
import Modal from "./Modal";
import ParetoChart from "./ParetoChart";

type ParetoMetric = "minutes" | "count";
type Scope = "line" | "total";
type LineField = "line_id" | "line_code";

type Props = {
  from?: string;
  to?: string;

  /** Nuevo modelo */
  scope?: Scope;          // "line" | "total"
  line?: string;          // valor de línea (id o code)
  line_field?: LineField; // campo de línea

  /** Config */
  defaultMetric?: ParetoMetric; // "minutes" | "count"
  defaultTop?: number;          // N en el top
  only_classified?: boolean;    // solo paros clasificados
  include_planned?: boolean;    // incluir planificados

  /** Contenido sobre el que “flota” el botón */
  children: ReactNode;
};

export default function AvailabilityParetoLauncher({
  from,
  to,
  scope,
  line,
  line_field = "line_id",
  defaultMetric = "minutes",
  defaultTop = 10,
  only_classified = true,
  include_planned = true,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  // Cast por compat con ParetoChart
  const PC: any = ParetoChart;

  return (
    <>
      {/* contenedor que posiciona el botón en la esquina del bloque envuelto */}
      <div className="relative">
        {children}

        {/* Botón PARETO: pill + texto, esquina superior derecha */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ver Pareto 80/20"
          title="Ver Pareto 80/20"
          className="
            absolute top-2 right-2
            inline-flex items-center gap-1.5
            rounded-xl border border-cyan-400/60
            bg-black/40 text-cyan-200 px-3 py-1.5
            backdrop-blur-[2px]
            hover:bg-cyan-400/15 hover:border-cyan-400/80
            focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
            transition
            text-sm
          "
        >
          {/* icono mini */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
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
          Pareto
        </button>
      </div>

      {/* Modal con el gráfico Pareto */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pareto 80/20 · Pérdidas de Disponibilidad"
        sizeClassName="sm:max-w-5xl"
      >
        <PC
          from={from ?? "2025-08-30T00:00:00.000Z"}
          to={to ?? "2025-09-29T00:00:00.000Z"}
          scope={scope ?? (line ? "line" : "total")}
          line={line}
          line_field={line_field}
          only_classified={only_classified}
          include_planned={include_planned}
          defaultMetric={defaultMetric}
          defaultTop={defaultTop}
          initLineField={line_field}
          initLine={line}
        />
      </Modal>
    </>
  );
}
