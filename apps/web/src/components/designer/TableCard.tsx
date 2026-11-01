import type { PointerEvent } from 'react';
import { CARD_W, HEAD_H, ROW_H } from '../../domain/designer';
import type { TableDef } from '../../domain/schema';
import type { Point } from './geometry';

interface Props {
  table: TableDef;
  pos: Point;
  selected: boolean;
  /** Keys ("table.column") that accept the connection currently being dragged; null when not linking. */
  dropKeys: ReadonlySet<string> | null;
  hoverKey: string | null;
  canRemove: boolean;
  onSelect: () => void;
  onHeaderDown: (e: PointerEvent) => void;
  onHandleDown: (e: PointerEvent, column: string) => void;
  onRemove: () => void;
}

/** One table as a card: draggable header, one row per column, a handle on each non-key column to start a connection. */
export function TableCard({ table, pos, selected, dropKeys, hoverKey, canRemove, onSelect, onHeaderDown, onHandleDown, onRemove }: Props) {
  return (
    <div role="group" aria-label={`Table ${table.name}`} onClick={onSelect}
      className={`absolute select-none rounded-md border bg-zinc-900 shadow-lg ${selected ? 'border-sky-500 ring-1 ring-sky-500/60' : 'border-zinc-700'}`}
      style={{ left: pos.x, top: pos.y, width: CARD_W }}>
      <div onPointerDown={onHeaderDown} style={{ height: HEAD_H, touchAction: 'none' }}
        className="flex cursor-grab items-center justify-between rounded-t-md bg-zinc-800 px-2 active:cursor-grabbing">
        <span className="truncate font-mono text-sm font-semibold text-zinc-100" title={table.name}>{table.name || '(unnamed)'}</span>
        <button aria-label={`Remove table ${table.name}`} disabled={!canRemove} onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }} className="px-1 text-zinc-500 hover:text-red-400 disabled:opacity-30">✕</button>
      </div>
      <ul className="pb-2">
        {table.columns.map((c) => {
          const key = `${table.name}.${c.name}`;
          const droppable = dropKeys?.has(key) ?? false;
          const dim = dropKeys !== null && !droppable;
          return (
            <li key={c.name} data-table={table.name} data-col={c.name} {...(droppable ? { 'data-drop': '' } : {})} style={{ height: ROW_H }}
              className={`flex items-center gap-1 px-2 font-mono text-xs ${dim ? 'opacity-40' : ''} ${droppable ? (hoverKey === key ? 'bg-emerald-800/60' : 'bg-emerald-900/30') : ''}`}>
              <span className="min-w-0 flex-1 truncate text-zinc-200" title={c.name}>{c.name}</span>
              {c.primaryKey && <span className="rounded bg-amber-900/60 px-1 text-[10px] text-amber-200">PK</span>}
              {c.references && <span className="rounded bg-sky-900/60 px-1 text-[10px] text-sky-200" title={`→ ${c.references.table}.${c.references.column}`}>FK</span>}
              <span className="text-[10px] text-zinc-500">{c.type}</span>
              {!c.primaryKey && (
                <button aria-label={`Connect ${table.name}.${c.name} to a parent table`} title="Drag to a parent table's primary key"
                  onPointerDown={(e) => onHandleDown(e, c.name)} onClick={(e) => e.stopPropagation()} style={{ touchAction: 'none' }}
                  className={`h-3 w-3 shrink-0 cursor-crosshair rounded-full border ${c.references ? 'border-sky-400 bg-sky-500' : 'border-zinc-500 bg-zinc-800 hover:bg-sky-600'}`} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
