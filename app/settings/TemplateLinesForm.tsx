"use client";

import { useState } from "react";

type Template = { id: string; name: string };
type Line = { id: string; code: string; name: string };

export default function TemplateLinesForm({
  templates,
  lines,
}: {
  templates: Template[];
  lines: Line[];
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>(
    lines.length ? [lines[0].id] : []
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  async function save() {
    try {
      setBusy(true);
      setMsg("");
      const res = await fetch(
        `/api/shifts/templates/${templateId}/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineIds: selected }),
        }
      );
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Error guardando");
      setMsg(`Guardado ✓ (added: ${j.result?.[0]?.added_cnt ?? 0}, removed: ${j.result?.[0]?.removed_cnt ?? 0})`);
    } catch (e: any) {
      setMsg(`Error: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 p-4 space-y-4">
      <div className="text-sm font-semibold">Líneas por plantilla</div>

      <label className="text-xs opacity-70">Plantilla</label>
      <select
        className="w-full rounded-lg border border-neutral-700 bg-transparent p-2"
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div className="text-xs opacity-70">Líneas</div>
      <div className="grid grid-cols-2 gap-2">
        {lines.map((l) => (
          <label
            key={l.id}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 p-2"
          >
            <input
              type="checkbox"
              checked={selected.includes(l.id)}
              onChange={() => toggle(l.id)}
            />
            <span className="text-sm">{l.code} · {l.name}</span>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={busy || !templateId}
        className="rounded-xl border border-emerald-600 px-3 py-2 text-sm hover:bg-emerald-600/10 disabled:opacity-50"
      >
        {busy ? "Guardando…" : "Guardar líneas de la plantilla"}
      </button>

      <div className="text-xs opacity-70">{msg}</div>
    </div>
  );
}
