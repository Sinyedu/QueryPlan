import { useRef, useState, type PointerEvent } from 'react';
import { CARD_W, cardHeight } from '../../domain/designer';
import { referenceTargets } from '../../domain/schema';
import type { Lab } from '../../hooks/useLab';
import { Alert, Button, Card } from '../ui';
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
    <div className="min-w-0">
      {design.message && <Alert tone="warn" className="mb-2">{design.message}</Alert>}
      <div ref={canvas} role="region" aria-label="Schema diagram" className="relative overflow-auto rounded-lg border border-line bg-canvas"
        style={{ height: 'max(420px, 62vh)', backgroundImage: 'radial-gradient(#d5dae2 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
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
      <p className="mt-2 text-xs text-muted">Drag a column&apos;s dot to a primary key, or use References in the editor.</p>
      <Card className="mt-3 p-3">
        <h3 className="text-sm font-semibold text-ink">Relationships</h3>
        {design.relations.length === 0 ? <p className="mt-1 text-sm text-muted">None yet. Connect a column to a parent table&apos;s primary key.</p> : (
          <ul aria-label="Relationships" className="mt-2 space-y-1.5">
            {design.relations.map((r) => (
              <li key={`${r.from.table}.${r.from.column}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 font-mono text-sm">
                <span className="min-w-0 break-all">{r.from.table}.{r.from.column} <span className="text-accent">→</span> {r.to.table}.{r.to.column} <span className="font-sans text-xs text-muted">many-to-one</span></span>
                <Button size="sm" aria-label={`Disconnect ${r.from.table}.${r.from.column}`} onClick={() => design.unlink(r.from)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
