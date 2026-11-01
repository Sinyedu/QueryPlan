import { useRef, useState, type PointerEvent } from 'react';
import { CARD_W, cardHeight } from '../../domain/designer';
import { referenceTargets } from '../../domain/schema';
import type { Lab } from '../../hooks/useLab';
import { Button, Panel } from '../ui';
import { anchor, type Point } from './geometry';
import { RelationshipLines } from './RelationshipLines';
import { TableCard } from './TableCard';

interface Link { table: string; column: string; to: Point; hover: string | null }

/** Run `onMove` for every pointer move until the button is released, then `onUp` once. */
function track(onMove: (e: globalThis.PointerEvent) => void, onUp: (e: globalThis.PointerEvent) => void) {
  const up = (e: globalThis.PointerEvent) => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); onUp(e); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

export function Designer({ lab }: { lab: Lab }) {
  const { design, tables } = lab;
  const defs = tables.map((t) => t.table);
  const canvas = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<Link | null>(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left + canvas.current!.scrollLeft, y: e.clientY - r.top + canvas.current!.scrollTop };
  };

  const startMove = (name: string, index: number, e: PointerEvent) => {
    if (e.button !== 0) return;
    design.select(index);
    const start = design.positions[name]!;
    const origin = { x: e.clientX, y: e.clientY };
    track((m) => design.moveTable(name, start.x + m.clientX - origin.x, start.y + m.clientY - origin.y), () => undefined);
  };

  const startLink = (table: string, column: string, e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const set = (l: Link | null) => setLink(l);
    set({ table, column, to: local(e), hover: null });
    track(
      (m) => {
        const hit = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>('[data-drop]');
        set({ table, column, to: local(m), hover: hit ? `${hit.dataset.table}.${hit.dataset.col}` : null });
      },
      (m) => {
        const hit = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>('[data-drop]');
        set(null);
        if (hit?.dataset.table && hit.dataset.col) design.link({ table, column }, { table: hit.dataset.table, column: hit.dataset.col });
        else design.clearMessage();
      },
    );
  };

  const dropKeys = link ? new Set(referenceTargets(defs, link.table).map((r) => `${r.table}.${r.column}`)) : null;
  const pendingFrom = (() => {
    const t = link && defs.find((d) => d.name === link.table);
    const pos = link && design.positions[link.table];
    if (!link || !t || !pos) return null;
    return anchor(pos, Math.max(0, t.columns.findIndex((c) => c.name === link.column)), 'right');
  })();

  const width = Math.max(0, ...Object.values(design.positions).map((p) => p.x + CARD_W)) + 40;
  const height = Math.max(300, ...defs.map((t) => (design.positions[t.name]?.y ?? 0) + cardHeight(t) + 40));

  return (
    <Panel title="Database designer" aside={
      <div className="flex gap-2">
        <Button className="!px-2 !py-0.5 text-xs" onClick={design.add} disabled={tables.length >= 6}>+ Table</Button>
        <Button className="!px-2 !py-0.5 text-xs" onClick={design.resetLayout}>Auto-arrange</Button>
      </div>
    }>
      <p className="mb-2 text-xs text-zinc-500">
        Drag a table by its header. Drag from the ● on a column to another table's <b>PK</b> row to connect them (the column becomes a foreign key).
        Keyboard users can set the same link with the "references" menu in the schema form.
      </p>
      {design.message && <p role="status" className="mb-2 rounded border border-amber-800 bg-amber-950/60 px-2 py-1 text-xs text-amber-200">{design.message}</p>}
      <div ref={canvas} role="region" aria-label="Schema diagram" className="relative overflow-auto rounded border border-zinc-800 bg-zinc-950"
        style={{ height: 'max(440px, 68vh)', backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        <div className="relative" style={{ width, height }}>
          <RelationshipLines tables={defs} positions={design.positions} relations={design.relations}
            pending={pendingFrom && link ? { from: pendingFrom, to: link.to } : null} onRemove={(r) => design.unlink(r.from)} />
          {tables.map((t, i) => (
            <TableCard key={i} table={t.table} pos={design.positions[t.table.name]!} selected={i === design.active}
              dropKeys={dropKeys} hoverKey={link?.hover ?? null} canRemove={tables.length > 1}
              onSelect={() => design.select(i)} onHeaderDown={(e) => startMove(t.table.name, i, e)}
              onHandleDown={(e, col) => startLink(t.table.name, col, e)} onRemove={() => design.remove(i)} />
          ))}
        </div>
      </div>
      <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Relationships</h3>
      {design.relations.length === 0 ? <p className="mt-1 text-xs text-zinc-500">None yet. Connect a column to a parent table's primary key.</p> : (
        <ul aria-label="Relationships" className="mt-1 space-y-1">
          {design.relations.map((r) => (
            <li key={`${r.from.table}.${r.from.column}`} className="flex items-center justify-between rounded bg-zinc-900 px-2 py-1 font-mono text-xs">
              <span><span className="text-zinc-200">{r.from.table}.{r.from.column}</span> <span className="text-sky-400">→</span> <span className="text-zinc-200">{r.to.table}.{r.to.column}</span> <span className="text-zinc-500">many-to-one</span></span>
              <button aria-label={`Disconnect ${r.from.table}.${r.from.column}`} className="text-zinc-400 hover:text-red-400" onClick={() => design.unlink(r.from)}>remove</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
