'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type EventRow = {
  id: string;
  org_id: string;
  plant_id: string | null;
  line_id: string | null;
  machine_id: string | null;
  taxonomy_node_id: string | null;
  started_at: string;
  status: 'pending' | 'classified';
};

type Node = {
  id: string;
  parent_id: string | null;
  name: string;
  plant_id: string | null;
  requires_detail: boolean;
};

export default function ClassifyEventPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Etiquetas tipo "Fallos > Correa rota"
  const labels = useMemo(() => {
    const map = new Map(nodes.map(n => [n.id, n]));
    const pathOf = (id: string) => {
      const out: string[] = [];
      let cur = map.get(id);
      while (cur) {
        out.unshift(cur!.name);
        cur = cur!.parent_id ? map.get(cur!.parent_id!) : undefined;
      }
      return out.join(' > ');
    };
    return new Map(nodes.map(n => [n.id, pathOf(n.id)]));
  }, [nodes]);

  // IDs de nodos que NO se pueden seleccionar (tienen hijos o requieren detalle)
  const nonSelectable = useMemo(() => {
    const parentsWithChildren = new Set<string>();
    for (const n of nodes) if (n.parent_id) parentsWithChildren.add(n.parent_id);
    const s = new Set<string>();
    for (const n of nodes) {
      if (parentsWithChildren.has(n.id) || n.requires_detail) s.add(n.id);
    }
    return s;
  }, [nodes]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      // 1) Evento
      const { data: evData, error: evErr } = await supabase
        .schema('liwa')
        .from('events')
        .select('id, org_id, plant_id, line_id, machine_id, taxonomy_node_id, started_at, status')
        .eq('id', params.id)
        .maybeSingle();

      if (evErr || !evData) {
        setErr(evErr?.message || 'Evento no encontrado');
        setLoading(false);
        return;
      }
      setEv(evData as EventRow);

      // 2) Nodos (globales + de la planta), incluyendo requires_detail
      const { data: nodesData, error: nodesErr } = await supabase
        .schema('liwa')
        .from('taxonomy_nodes')
        .select('id, parent_id, name, plant_id, requires_detail')
        .eq('org_id', evData.org_id)
        .or(`plant_id.is.null,plant_id.eq.${evData.plant_id}`)
        .eq('is_active', true);

      if (nodesErr) setErr(nodesErr.message);
      else setNodes((nodesData || []) as Node[]);

      setSelected(evData.taxonomy_node_id || '');
      setLoading(false);
    })();
  }, [params.id, supabase]);

  const onSave = async () => {
    if (!selected) {
      setErr('Selecciona una causa');
      return;
    }
    if (nonSelectable.has(selected)) {
      setErr('Debes elegir un motivo específico (no un grupo).');
      return;
    }

    setSaving(true);
    setErr(null);

    const { error } = await supabase
      .schema('liwa')
      .rpc('classify_event', {
        p_event_id: params.id,
        p_taxonomy_node_id: selected,
      });

    setSaving(false);
    if (error) setErr(error.message);
    else router.push('/events/pending');
  };

  if (loading) return <div className="p-8 opacity-70">Cargando…</div>;
  if (err) return <div className="p-8 text-red-400">Error: {err}</div>;
  if (!ev) return <div className="p-8">Evento no encontrado</div>;

  return (
    <div className="liwa-page max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Clasificar evento</h1>

      <div className="liwa-panel p-4 space-y-2 text-sm">
        <div><span className="opacity-60">ID:</span> <code>{ev.id}</code></div>
        <div><span className="opacity-60">Inicio:</span> {new Date(ev.started_at).toLocaleString()}</div>
        <div><span className="opacity-60">Línea:</span> {ev.line_id ?? '—'}</div>
        <div><span className="opacity-60">Máquina:</span> {ev.machine_id ?? '—'}</div>
        <div><span className="opacity-60">Estado:</span> {ev.status}</div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm opacity-80">Causa / Taxonomía</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2"
        >
          <option value="">— Selecciona una causa —</option>
          {nodes
            .sort((a, b) => (labels.get(a.id)! > labels.get(b.id)! ? 1 : -1))
            .map((n) => (
              <option
                key={n.id}
                value={n.id}
                disabled={nonSelectable.has(n.id)}
              >
                {labels.get(n.id)}
              </option>
            ))}
        </select>
        <p className="text-xs opacity-60">
          Los grupos (p. ej. “Fallos”) quedan deshabilitados; elige un motivo específico (p. ej. “Correa rota”).
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-xl px-4 py-2 bg-green-600 hover:bg-green-500 text-white transition disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar clasificación'}
        </button>
        <button
          onClick={() => history.back()}
          className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

