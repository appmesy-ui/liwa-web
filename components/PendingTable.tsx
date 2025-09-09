// components/PendingTable.tsx
"use client";

import { useEffect, useState } from "react";

type Pending = {
  id: string;
  line_code: string;
  machine_code: string;
  started_at: string;
  ended_at: string;
  duration_min: number;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean;
};

export default function PendingTable() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [line, setLine] = useState<string>(""); // filtro rápido por línea

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: "20" });
    if (line) params.set("line", line);
    const res = await fetch(`/api/pending?${params.toString()}`);
    const json = await res.json();
    setRows(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [line]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">Paros pendientes</h2>
        <select
          className="border rounded-md px-2 py-1"
          value={line}
          onChange={(e) => setLine(e.target.value)}
        >
          <option value="">Todas las líneas</option>
          <option value="L1">L1</option>
          <option value="L2">L2</option>
        </select>
        <button
          className="border rounded-md px-3 py-1"
          onClick={load}
          title="Recargar"
        >
          Recargar
        </button>
      </div>

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">Línea</th>
                <th className="p-3 text-left">Máquina</th>
                <th className="p-3 text-left">Inicio</th>
                <th className="p-3 text-left">Fin</th>
                <th className="p-3 text-left">Min</th>
                <th className="p-3 text-left">L1</th>
                <th className="p-3 text-left">L2</th>
                <th className="p-3 text-left">Clasif.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.line_code}</td>
                  <td className="p-3">{r.machine_code}</td>
                  <td className="p-3">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {new Date(r.ended_at).toLocaleString()}
                  </td>
                  <td className="p-3">{r.duration_min}</td>
                  <td className="p-3">{r.lvl1 ?? "-"}</td>
                  <td className="p-3">{r.lvl2 ?? "-"}</td>
                  <td className="p-3">{r.classified ? "Sí" : "No"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="p-3" colSpan={8}>
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
