import { useState } from 'react';
import { BENCH_RUN_OPTIONS, TARGET_SAMPLE_MS } from '../domain/benchmark';
import { indexName, validateIdentifier } from '../domain/schema';
import type { Lab } from '../hooks/useLab';
import { PlanTree, TimingLine } from './PlanViewer';
import { Button, Card, Disclosure, inputCls } from './ui';

const browserLabel = () => /(Edg|Chrome|Firefox|Safari)\/[\d.]+/.exec(navigator.userAgent)?.[0] ?? 'unknown browser';

const PLAN_NOTE =
  'SQLite reports plan steps only: no costs, no per-step timings. Times shown are separately measured wall-clock durations in this browser. The planner may choose differently depending on SQLite version, statistics and data, so an index is never guaranteed to be used.';

/** Output tab: the plan of the most recent query, straight from EXPLAIN QUERY PLAN. */
export function PlanTab({ lab }: { lab: Lab }) {
  const { current } = lab;
  return (
    <div>
      {!current && <p className="text-sm text-muted">Run a query to see the plan SQLite chose. Nothing here is estimated or mocked.</p>}
      {current && <><PlanTree snap={current} /><TimingLine snap={current} /></>}
      <p className="mt-4 text-xs leading-snug text-muted">{PLAN_NOTE}</p>
    </div>
  );
}

/** Output tab: benchmark + plan before and after creating an index, plus index management. */
export function CompareTab({ lab }: { lab: Lab }) {
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
  // Index DDL is built from validated identifiers; tables/columns created through raw SQL may use other names.
  const plainNames = !!table && [table.name, ...picked].every((n) => validateIdentifier(n) === null);

  const reason = !plainNames ? 'Index experiments need plain names (letters, digits, underscore). Create the index yourself in the SQL editor instead.'
    : exists ? 'That index already exists. Drop it below to repeat the experiment.'
    : lab.benchmarkable ? 'Benchmarks the SQL in the editor, creates the index, benchmarks again, and shows both real plans.'
    : 'Comparison needs a single SELECT / WITH query in the editor (it is run repeatedly).';

  return (
    <div>
      <h3 className="text-xl font-bold text-ink">Compare an index</h3>
      <p className="mt-1 text-ink-soft">Runs the same query before and after creating the index.</p>

      {!table ? <p className="mt-4 text-sm text-muted">Create and seed tables first.</p> : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-ink">Table
              <select id="idx-table" className={`${inputCls} mt-1 block min-w-36`} value={table.name} onChange={(e) => { setTableName(e.target.value); setC1(''); setC2(''); }}>
                {tables.map((t) => <option key={t.name}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Column
              <select id="idx-col" className={`${inputCls} mt-1 block min-w-36`} value={first} onChange={(e) => setC1(e.target.value)}>
                {cols.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Then
              <select id="idx-col2" className={`${inputCls} mt-1 block min-w-36`} value={second} onChange={(e) => setC2(e.target.value)}>
                <option value="">None</option>
                {cols.filter((c) => c !== first).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Samples
              <select aria-label="Benchmark samples" className={`${inputCls} mt-1 block`} value={lab.benchRuns} onChange={(e) => lab.setBenchRuns(Number(e.target.value))}>
                {BENCH_RUN_OPTIONS.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <Button variant="primary" disabled={lab.busy !== null || !lab.benchmarkable || exists || !plainNames} onClick={() => lab.compareWithIndex(table.name, picked)}>
              Create index &amp; compare
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">{reason}</p>
        </>
      )}

      {before && current && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold text-ink">Plan comparison</h4>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {[before, current].map((s) => (
              <Card key={s.label} className="p-4">
                <h5 className="mb-2 font-semibold text-ink">{s.label}</h5>
                <PlanTree snap={s} /><TimingLine snap={s} />
              </Card>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{PLAN_NOTE}</p>

      {table && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold text-ink">Indexes on {table.name}</h4>
          {table.indexes.length === 0 ? <p className="mt-1 text-sm text-muted">No indexes yet.</p> : (
            <ul className="mt-2 space-y-2">
              {table.indexes.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm">
                  <span className="min-w-0 break-all">{i.name} ({i.columns.join(', ')})</span>
                  <Button size="sm" disabled={lab.busy !== null} onClick={() => lab.dropIndex(i.name)}>Drop index</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Disclosure title="Benchmark details" hint={`Browser wall time · median of ${lab.benchRuns} samples`} className="mt-4">
        <ol className="list-decimal space-y-1 pl-4 text-ink-soft">
          <li>One warm-up execution is run and discarded; it also sizes the repeat count so a sample takes about {TARGET_SAMPLE_MS} ms (1–200 executions).</li>
          <li>Each of the {lab.benchRuns} samples is the mean wall time of that many back-to-back executions, measured inside the worker with <code>performance.now()</code>.</li>
          <li>Reported: median, min and max of the samples. Both sides of a comparison use identical settings.</li>
          <li>Each execution reads every result row (counting them without rendering), so the time includes row iteration but not display.</li>
          <li>Browsers coarsen timers and the page shares the CPU, so treat small differences as noise.</li>
        </ol>
        <p className="mt-2 text-muted">Environment: {browserLabel()} · SQLite {lab.info?.version ?? '?'} (WASM, Web Worker, in-memory)</p>
      </Disclosure>
    </div>
  );
}
