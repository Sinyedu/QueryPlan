import type { PointerEvent } from 'react';
import { CARD_W, HEAD_H, ROW_H } from '../../domain/designer';
import type { TableDef } from '../../domain/schema';
import { Badge } from '../ui';
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
      className={`absolute select-none rounded-lg border-2 bg-surface ${selected ? 'border-accent' : 'border-line-strong'}`}
      style={{ left: pos.x, top: pos.y, width: CARD_W }}>
      <div onPointerDown={onHeaderDown} style={{ height: HEAD_H, touchAction: 'none' }}
        className="flex cursor-grab items-center justify-between rounded-t-md border-b border-line bg-subtle px-2.5 active:cursor-grabbing">
        <span className="truncate text-sm font-semibold text-ink" title={table.name}>{table.name || '(unnamed)'}</span>
        <button aria-label={`Remove table ${table.name}`} disabled={!canRemove} onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }} className="px-1 text-muted hover:text-danger disabled:opacity-30">✕</button>
      </div>
      <ul className="pb-1.5">
        {table.columns.map((c) => {
          const key = `${table.name}.${c.name}`;
          const droppable = dropKeys?.has(key) ?? false;
          const dim = dropKeys !== null && !droppable;
          return (
            <li key={c.name} data-table={table.name} data-col={c.name} {...(droppable ? { 'data-drop': '' } : {})} style={{ height: ROW_H }}
              className={`flex items-center gap-1.5 px-2.5 text-xs ${dim ? 'opacity-40' : ''} ${droppable ? (hoverKey === key ? 'bg-accent-soft ring-1 ring-inset ring-accent' : 'bg-ok-soft') : ''}`}>
              <span className="min-w-0 flex-1 truncate font-mono text-ink" title={c.name}>{c.name}</span>
              {c.primaryKey && <Badge tone="warn">PK</Badge>}
              {c.references && <span title={`→ ${c.references.table}.${c.references.column}`}><Badge tone="info">FK</Badge></span>}
              <span className="font-mono text-[10px] text-muted">{c.type}</span>
              {!c.primaryKey && (
                <button aria-label={`Connect ${table.name}.${c.name} to a parent table`} title="Drag to a parent table's primary key"
                  onPointerDown={(e) => onHandleDown(e, c.name)} onClick={(e) => e.stopPropagation()} style={{ touchAction: 'none' }}
                  className={`h-3 w-3 shrink-0 cursor-crosshair rounded-full border ${c.references ? 'border-accent bg-accent' : 'border-line-strong bg-surface hover:bg-accent-soft'}`} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
