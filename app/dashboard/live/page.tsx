"use client";

import LiveKpiCard from "@/components/LiveKpiCard";

const MACHINES = ["M1", "M2", "M5", "M7"];

export default function LiveDashboardPage() {
  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">LIWA · Live</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MACHINES.map((code) => (
          <LiveKpiCard
            key={code}
            title={code}
            orgPlantFilter="tecno/demo"
            machineId={code}
          />
        ))}

        {MACHINES.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No hay máquinas configuradas.
          </div>
        )}
      </div>
    </main>
  );
}

