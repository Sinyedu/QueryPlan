import { useState } from 'react';
import { KIND_HELP, describeNode, flattenPlan, parsePlan, planInsights, planSummary } from '../domain/explain';
import { formatMs } from '../domain/benchmark';
import type { PlanSnapshot } from '../hooks/types';
import { PlanGraph } from './PlanGraph';
import { BADGE } from './planStyles';
import { Alert } from './ui';

type View = 'list' | 'graph';

/** Real `EXPLAIN QUERY PLAN` rows as an indented list or an SVG graph. Click a step for a per-step note. */
export function PlanTree({ snap }: { snap: PlanSnapshot }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<View>('list');
  if (snap.planError) return <Alert tone="error">{snap.planError}</Alert>;
  if (!snap.plan || snap.plan.length === 0) return <p className="text-sm text-zinc-500">SQLite returned no plan rows for this statement.</p>;

  const roots = parsePlan(snap.plan);
  const flat = flattenPlan(roots);
  const sel = flat.find((f) => f.node.id === selected)?.node;
  const toggle = (id: number) => setSelected(selected === id ? null : id);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">{planSummary(snap.plan)}</p>
        <div role="group" aria-label="Plan view" className="flex shrink-0 overflow-hidden rounded border border-zinc-700 text-xs">
          {(['list', 'graph'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
              className={`px-2 py-0.5 capitalize ${view === v ? 'bg-sky-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>{v}</button>
          ))}
        </div>
      </div>

      {planInsights(snap.plan).length > 0 && (
        <ul className="mb-2 space-y-1 rounded border border-sky-900 bg-sky-950/30 p-2 text-xs text-sky-100" aria-label="Reading this plan">
          {planInsights(snap.plan).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}

      {view === 'graph' ? <PlanGraph roots={roots} selected={selected} onSelect={toggle} /> : (
        <ul role="tree" aria-label={snap.label} className="space-y-1">
          {flat.map(({ node, depth }) => {
            const [label, cls] = BADGE[node.kind];
            return (
              <li key={node.id} role="treeitem" aria-selected={selected === node.id} style={{ marginLeft: depth * 18 }}>
                <button onClick={() => toggle(node.id)}
                  className={`flex w-full items-start gap-2 rounded border px-2 py-1 text-left font-mono text-xs ${selected === node.id ? 'border-sky-500 bg-sky-950/40' : 'border-zinc-800 hover:bg-zinc-800/60'}`}>
                  <span className={`mt-px shrink-0 rounded px-1.5 text-[10px] font-bold ${cls}`}>{label}</span>
                  <span className="break-all">{node.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sel && (
        <div className="mt-2 space-y-1 rounded bg-zinc-900 p-2 text-xs text-zinc-300" role="note">
          <p className="break-all font-mono text-zinc-400">{sel.detail}</p>
          <p>{describeNode(sel).text}</p>
          <p className="text-zinc-500">{KIND_HELP[sel.kind]} (row id {sel.id}, parent {sel.parent})</p>
        </div>
      )}
    </div>
  );
}

export function TimingLine({ snap }: { snap: PlanSnapshot }) {
  const t = snap.timing;
  return (
    <p className="mt-2 text-xs text-zinc-400">
      Measured wall time: <b className="text-zinc-200">{formatMs(t.medianMs)}</b>
      {t.runs > 1 ? ` median of ${t.runs} samples (min ${formatMs(t.minMs)}, max ${formatMs(t.maxMs)})` : ' (single run)'}
      {t.repsPerSample > 1 ? `, each the mean of ${t.repsPerSample} executions` : ''}
      {' · '}{snap.totalRows.toLocaleString()} row{snap.totalRows === 1 ? '' : 's'}
    </p>
  );
}
