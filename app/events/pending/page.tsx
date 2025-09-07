'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
// IMPORTA TU CLIENTE EXISTENTE
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type PendingEvent = {
  id: string;
  started_at: string;
  line_id: string | null;
  machine_id: string | null;
  status: 'pending' | 'classified';
};

export default function PendingEventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      // 👈 OJO: usamos el schema('liwa')
      const { data, error } = await supabase
        .schema('liwa')
        .from('v_pending_events')
        .select('id, started_at, line_id, machine_id, status')
        .order('started_at', { ascending: false });

      if (error) setErr(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Paros sin clasificar</h1>

      {loading && <p className="opacity-70">Cargando…</p>}
      {err && <p className="text-red-400">Error: {err}</p>}
      {!loading && !err && rows.length === 0 && (
        <p className="opacity-70">No hay paros pendientes 🎉</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left">
              <tr>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Línea</th>
                <th className="px-4 py-3">Máquina</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => (
                <tr key={ev.id} className="border-t border-white/10">
                  <td className="px-4 py-3">{new Date(ev.started_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{ev.line_id ?? '—'}</td>
                  <td className="px-4 py-3">{ev.machine_id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full px-2 py-0.5 bg-yellow-500/20 text-yellow-300">
                      {ev.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/events/${ev.id}`}
                      className="rounded-xl px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white transition"
                    >
                      Clasificar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
