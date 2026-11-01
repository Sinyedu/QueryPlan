import { useState } from 'react';
import { BENCH_RUN_OPTIONS, TARGET_SAMPLE_MS } from '../domain/benchmark';
import { indexName } from '../domain/schema';
import type { Lab } from '../hooks/useLab';
import { PlanTree, TimingLine } from './PlanViewer';
import { Button, Panel, inputCls } from './ui';

const browserLabel = () => /(Edg|Chrome|Firefox|Safari)\/[\d.]+/.exec(navigator.userAgent)?.[0] ?? 'unknown browser';

export function PlanPanel({ lab }: { lab: Lab }) {
  const { current, before } = lab;
  const tables = lab.schema.tables;
  const [tableName, setTableName] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const table = tables.find((t) => t.name === tableName) ?? tables[0];
  const cols = table?.columns.map((c) => c.name) ?? [];
  const first = cols.includes(c1) ? c1 : cols.includes('email') ? 'email' : cols[0] ?? '';
  const second = c2 !== first && cols.includes(c2) ? c2 : '';
  const picked = second ? [first, second] : [first];
  const exists = table?.indexes.some((i) => i.name === indexName(table.name, picked));

  return (
    <div className="space-y-4">
      <Panel title="Query plan · SQLite EXPLAIN QUERY PLAN">
        {!current && <p className="text-sm text-zinc-500">Run a query to see the plan SQLite chose. Nothing here is estimated or mocked.</p>}
        {current && !before && <><PlanTree snap={current} /><TimingLine snap={current} /></>}
        {current && before && (
          <div className="grid gap-4">
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
        {!table ? <p className="text-sm text-zinc-500">Create and seed tables first.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <label htmlFor="idx-table">Table</label>
              <select id="idx-table" className={inputCls} value={table.name} onChange={(e) => { setTableName(e.target.value); setC1(''); setC2(''); }}>
                {tables.map((t) => <option key={t.name}>{t.name}</option>)}
              </select>
              <label htmlFor="idx-col">Column</label>
              <select id="idx-col" className={inputCls} value={first} onChange={(e) => setC1(e.target.value)}>
                {cols.map((c) => <option key={c}>{c}</option>)}
              </select>
              <label htmlFor="idx-col2">then</label>
              <select id="idx-col2" className={inputCls} value={second} onChange={(e) => setC2(e.target.value)}>
                <option value="">(none)</option>
                {cols.filter((c) => c !== first).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={lab.busy !== null || !lab.benchmarkable || exists} onClick={() => lab.compareWithIndex(table.name, picked)}>
                Create index &amp; compare
              </Button>
              <label className="flex items-center gap-1 text-xs text-zinc-400">samples
                <select aria-label="Benchmark samples" className={inputCls} value={lab.benchRuns} onChange={(e) => lab.setBenchRuns(Number(e.target.value))}>
                  {BENCH_RUN_OPTIONS.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {exists ? 'That index already exists; drop it below to repeat the experiment.'
                : lab.benchmarkable ? 'Benchmarks the SQL in the editor, creates the index, benchmarks again, and shows both plans.'
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
        <details className="mt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">Benchmark methodology</summary>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>One warm-up execution is run and discarded; it also sizes the repeat count so a sample takes about {TARGET_SAMPLE_MS} ms (1–200 executions).</li>
            <li>Each of the {lab.benchRuns} samples is the mean wall time of that many back-to-back executions, measured inside the worker with <code>performance.now()</code>.</li>
            <li>Reported: median, min and max of the samples. Both sides of a comparison use identical settings.</li>
            <li>Each execution reads every result row (counting them without rendering), so the time includes row iteration but not display.</li>
            <li>Browsers coarsen timers and the page shares the CPU, so treat small differences as noise.</li>
          </ol>
          <p className="mt-1 text-zinc-500">Environment: {browserLabel()} · SQLite {lab.info?.version ?? '?'} (WASM, Web Worker, in-memory)</p>
        </details>
      </Panel>
    </div>
  );
}
