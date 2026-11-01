import { flattenPlan, type PlanNode } from '../domain/explain';
import { BADGE, KIND_COLOR } from './planStyles';

const W = 230, H = 44, GX = 40, GY = 12;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Left-to-right SVG tree: x by depth, y by visit order. Edges follow SQLite's parent ids. */
export function PlanGraph({ roots, selected, onSelect }: { roots: PlanNode[]; selected: number | null; onSelect: (id: number) => void }) {
  const flat = flattenPlan(roots);
  const pos = new Map(flat.map(({ node, depth }, i) => [node.id, { x: depth * (W + GX), y: i * (H + GY) }]));
  const width = (Math.max(...flat.map((f) => f.depth)) + 1) * (W + GX) - GX;
  const height = flat.length * (H + GY) - GY;

  return (
    <div className="overflow-x-auto">
      <svg role="group" aria-label="Query plan graph" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {flat.map(({ node }) => {
          const parent = pos.get(node.parent);
          const me = pos.get(node.id)!;
          if (!parent || node.parent === node.id) return null;
          return <path key={`e${node.id}`} d={`M${parent.x + W} ${parent.y + H / 2} C${parent.x + W + GX / 2} ${parent.y + H / 2}, ${me.x - GX / 2} ${me.y + H / 2}, ${me.x} ${me.y + H / 2}`} fill="none" stroke="#c9d0da" />;
        })}
        {flat.map(({ node }) => {
          const { x, y } = pos.get(node.id)!;
          const on = selected === node.id;
          return (
            <g key={node.id} transform={`translate(${x} ${y})`} tabIndex={0} role="button" aria-label={node.detail}
              onClick={() => onSelect(node.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(node.id); }}
              className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-accent">
              <title>{node.detail}</title>
              <rect width={W} height={H} rx={6} fill={on ? '#e4f2ef' : '#ffffff'} stroke={on ? '#13786c' : KIND_COLOR[node.kind]} strokeWidth={on ? 2 : 1} />
              <text x={8} y={16} fontSize={10} fontWeight={700} fill={KIND_COLOR[node.kind]}>{BADGE[node.kind][0]}</text>
              <text x={8} y={33} fontSize={11} fontFamily="ui-monospace, monospace" fill="#1b2430">{clip(node.detail, 34)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
