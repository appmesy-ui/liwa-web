'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type PendingEventUI = {
  id: string;
  started_at: string;
  status: 'pending' | 'classified';
  line_name: string | null;
  machine_name: string | null;
};

export default function PendingEventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<PendingEventUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .schema('liwa')
        .from('v_pending_events_ui')
        .select('*')
        .order('started_at', { ascending: false });

      if (error) setErr(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Paros sin clasificar</h1>
        {!loading && (
          <span className="rounded-full text-xs px-2 py-1 bg-red-600/20 text-red-300">
            {rows.length}
          </span>
        )}
      </div>

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
                <tr key={ev.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-4 py-3">{new Date(ev.started_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{ev.line_name ?? '—'}</td>
                  <td className="px-4 py-3">{ev.machine_name ?? '—'}</td>
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
