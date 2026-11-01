import { CARD_W, cardHeight, type Relationship } from '../../domain/designer';
import type { TableDef } from '../../domain/schema';
import { curve, linePoints, midpoint, type Point } from './geometry';

interface Props {
  tables: readonly TableDef[];
  positions: Record<string, Point>;
  relations: readonly Relationship[];
  /** Line being dragged, from the child column's handle to the pointer. */
  pending: { from: Point; to: Point } | null;
  onRemove: (r: Relationship) => void;
}

const label = (r: Relationship) => `${r.from.table}.${r.from.column} → ${r.to.table}.${r.to.column}`;

/** SVG curves (parent "1" end, child "N" end) plus a small remove button at each line's midpoint. */
export function RelationshipLines({ tables, positions, relations, pending, onRemove }: Props) {
  const width = Math.max(0, ...Object.values(positions).map((p) => p.x + CARD_W)) + 40;
  const height = Math.max(0, ...tables.map((t) => (positions[t.name]?.y ?? 0) + cardHeight(t))) + 40;

  const drawn = relations.flatMap((r) => {
    const parent = tables.find((t) => t.name === r.to.table);
    const child = tables.find((t) => t.name === r.from.table);
    const pp = positions[r.to.table], cp = positions[r.from.table];
    if (!parent || !child || !pp || !cp) return [];
    const pi = parent.columns.findIndex((c) => c.name === r.to.column);
    const ci = child.columns.findIndex((c) => c.name === r.from.column);
    if (pi < 0 || ci < 0) return [];
    return [{ r, ...linePoints(pp, pi, cp, ci) }];
  });

  return (
    <>
      <svg width={width} height={height} className="pointer-events-none absolute left-0 top-0" aria-hidden>
        {drawn.map(({ r, p, c, pSide, cSide }) => (
          <g key={label(r)}>
            <path d={curve(p, c, pSide, cSide)} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
            <circle cx={p.x} cy={p.y} r={3.5} fill="#38bdf8" />
            <text x={p.x + (pSide === 'right' ? 8 : -8)} y={p.y - 6} fontSize={10} fill="#7dd3fc" textAnchor={pSide === 'right' ? 'start' : 'end'}>1</text>
            <circle cx={c.x} cy={c.y} r={3.5} fill="#38bdf8" />
            <text x={c.x + (cSide === 'right' ? 8 : -8)} y={c.y - 6} fontSize={10} fill="#7dd3fc" textAnchor={cSide === 'right' ? 'start' : 'end'}>N</text>
          </g>
        ))}
        {pending && <path d={`M${pending.from.x} ${pending.from.y} L${pending.to.x} ${pending.to.y}`} stroke="#34d399" strokeWidth={2} strokeDasharray="5 4" fill="none" />}
      </svg>
      {drawn.map(({ r, p, c }) => {
        const m = midpoint(p, c);
        return (
          <button key={label(r)} aria-label={`Remove relationship ${label(r)}`} title={`Remove ${label(r)}`} onClick={() => onRemove(r)}
            style={{ left: m.x - 9, top: m.y - 9 }}
            className="absolute h-[18px] w-[18px] rounded-full border border-sky-700 bg-zinc-900 text-[10px] leading-none text-sky-300 hover:border-red-500 hover:text-red-400">✕</button>
        );
      })}
    </>
  );
}
