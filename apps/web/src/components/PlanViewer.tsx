import { useState } from 'react';
import { KIND_HELP, flattenPlan, parsePlan, planSummary, type AccessKind } from '../domain/explain';
import { formatMs } from '../domain/benchmark';
import type { PlanSnapshot } from '../hooks/types';
import { Alert } from './ui';

const BADGE: Record<AccessKind, [string, string]> = {
  scan: ['SCAN', 'bg-amber-900/60 text-amber-200'],
  'index-search': ['INDEX', 'bg-emerald-900/60 text-emerald-200'],
  'rowid-search': ['KEY', 'bg-emerald-900/60 text-emerald-200'],
  'covering-index': ['COVERING', 'bg-emerald-900/60 text-emerald-200'],
  'temp-structure': ['TEMP', 'bg-violet-900/60 text-violet-200'],
  other: ['STEP', 'bg-zinc-800 text-zinc-300'],
};

/** Indented parent/child tree of real `EXPLAIN QUERY PLAN` rows. Click a step for a plain-language note. */
export function PlanTree({ snap }: { snap: PlanSnapshot }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (snap.planError) return <Alert tone="error">{snap.planError}</Alert>;
  if (!snap.plan || snap.plan.length === 0) return <p className="text-sm text-zinc-500">SQLite returned no plan rows for this statement.</p>;

  const flat = flattenPlan(parsePlan(snap.plan));
  const sel = flat.find((f) => f.node.id === selected)?.node;
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-400">{planSummary(snap.plan)}</p>
      <ul role="tree" aria-label={snap.label} className="space-y-1">
        {flat.map(({ node, depth }) => {
          const [label, cls] = BADGE[node.kind];
          return (
            <li key={node.id} role="treeitem" aria-selected={selected === node.id} style={{ marginLeft: depth * 18 }}>
              <button onClick={() => setSelected(selected === node.id ? null : node.id)}
                className={`flex w-full items-start gap-2 rounded border px-2 py-1 text-left font-mono text-xs ${selected === node.id ? 'border-sky-500 bg-sky-950/40' : 'border-zinc-800 hover:bg-zinc-800/60'}`}>
                <span className={`mt-px shrink-0 rounded px-1.5 text-[10px] font-bold ${cls}`}>{label}</span>
                <span className="break-all">{node.detail}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sel && (
        <p className="mt-2 rounded bg-zinc-900 p-2 text-xs text-zinc-300" role="note">
          {KIND_HELP[sel.kind]} <span className="text-zinc-500">(row id {sel.id}, parent {sel.parent})</span>
        </p>
      )}
    </div>
  );
}

export function TimingLine({ snap }: { snap: PlanSnapshot }) {
  const t = snap.timing;
  return (
    <p className="mt-2 text-xs text-zinc-400">
      Measured wall time: <b className="text-zinc-200">{formatMs(t.medianMs)}</b>
      {t.runs > 1 ? ` median of ${t.runs} runs (min ${formatMs(t.minMs)}, max ${formatMs(t.maxMs)})` : ' (single run)'}
      {' · '}{snap.totalRows.toLocaleString()} row{snap.totalRows === 1 ? '' : 's'}
    </p>
  );
}
