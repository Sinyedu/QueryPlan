import { useState } from 'react';
import type { Lab } from '../hooks/useLab';
import { PlanTree, TimingLine } from './PlanViewer';
import { Button, Panel, inputCls } from './ui';

export function PlanPanel({ lab }: { lab: Lab }) {
  const { current, before } = lab;
  const table = lab.schema.tables.find((t) => t.name === lab.table.name);
  const [column, setColumn] = useState('email');
  const col = table?.columns.some((c) => c.name === column) ? column : table?.columns[0]?.name ?? '';

  return (
    <div className="space-y-4">
      <Panel title="Query plan · SQLite EXPLAIN QUERY PLAN">
        {!current && <p className="text-sm text-zinc-500">Run a query to see the plan SQLite chose. Nothing here is estimated or mocked.</p>}
        {current && !before && <><PlanTree snap={current} /><TimingLine snap={current} /></>}
        {current && before && (
          <div className="grid gap-4 xl:grid-cols-1">
            {[before, current].map((s) => (
              <div key={s.label}>
                <h3 className="mb-1 text-sm font-semibold text-sky-300">{s.label}</h3>
                <PlanTree snap={s} /><TimingLine snap={s} />
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-snug text-zinc-500">
          SQLite reports plan steps only: no costs, no per-step timings. The times shown are separately measured wall-clock durations in this browser.
          The planner may choose differently depending on SQLite version, statistics and data, so an index is never guaranteed to be used.
        </p>
      </Panel>

      <Panel title="3 · Index experiment">
        {!table ? <p className="text-sm text-zinc-500">Create and seed a table first.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-zinc-400" htmlFor="idx-col">Column</label>
              <select id="idx-col" className={inputCls} value={col} onChange={(e) => setColumn(e.target.value)}>
                {table.columns.map((c) => <option key={c.name}>{c.name}</option>)}
              </select>
              <Button variant="primary" disabled={lab.busy !== null || !lab.benchmarkable} onClick={() => lab.compareWithIndex(col)}>
                Create index &amp; compare
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {lab.benchmarkable
                ? 'Benchmarks the SQL in the editor (1 discarded warm-up + 5 timed runs), creates the index, benchmarks again, and shows both plans.'
                : 'Comparison needs a single SELECT / WITH query in the editor (it is run repeatedly).'}
            </p>
            {table.indexes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {table.indexes.map((i) => (
                  <li key={i.name} className="flex items-center justify-between rounded bg-zinc-900 px-2 py-1 font-mono text-xs">
                    <span>{i.name} ({i.columns.join(', ')})</span>
                    <button className="text-zinc-400 hover:text-red-400" disabled={lab.busy !== null} onClick={() => lab.dropIndex(i.name)}>drop</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
