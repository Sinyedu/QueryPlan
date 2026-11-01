import { useEffect, useRef, useState } from 'react';
import { formatMs } from '../domain/benchmark';
import { MAX_ROW_LIMIT } from '../domain/results';
import type { QueryState } from '../hooks/types';
import { Alert, Disclosure } from './ui';

const ROW_H = 32;
const VIEW_H = 440;
const OVERSCAN = 10;
const MIN_COL_W = 150;

type Result = Extract<QueryState, { status: 'ok' }>['result'];

export function ResultsTable({ query }: { query: QueryState }) {
  return (
    <div>
      {query.status === 'idle' && <p className="text-sm text-muted">Run a query to see rows here. Nothing is shown until you run SQL.</p>}
      {query.status === 'running' && <p className="text-sm text-ink-soft" role="status">Running…</p>}
      {query.status === 'error' && <Alert tone={query.canceled ? 'warn' : 'error'}>{query.message}</Alert>}
      {query.status === 'ok' && <Rows result={query.result} />}
    </div>
  );
}

/** Summary line + a windowed grid: only the rows in (or near) view are in the DOM, so thousands of rows stay fast. */
function Rows({ result }: { result: Result }) {
  const { columns, rows, totalRows, truncated, byteLimited, rowsAffected, elapsedMs } = result;
  const n = rows.length;
  return (
    <>
      <p className="mb-2 text-sm text-ink-soft" role="status">
        {columns.length === 0
          ? `OK · ${rowsAffected ?? 0} row${rowsAffected === 1 ? '' : 's'} changed`
          : `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}${truncated ? ` (showing first ${n.toLocaleString()})` : ''}`}
        {' · '}elapsed {formatMs(elapsedMs)} <span className="text-muted">(measured wall time, single run)</span>
      </p>
      {columns.length > 0 && <Grid columns={columns} rows={rows} />}
      <Disclosure title="Execution details" className="mt-3">
        <p className="text-muted">Elapsed time is one wall-clock run of this statement in the worker. For a repeated, median-of-samples measurement use the Compare index tab. SQLite plans carry no costs or per-step timings.</p>
      </Disclosure>
      {truncated && (
        <p className="mt-2 text-sm text-warn-ink">
          {byteLimited
            ? `Display stopped at ${n.toLocaleString()} rows because the returned data hit its size limit (wide or long values). Select fewer columns, shorten values, or add filters.`
            : `Display truncated at ${n.toLocaleString()} rows; the database row count is unaffected. Raise "Show up to" (max ${MAX_ROW_LIMIT.toLocaleString()}) or add LIMIT / filters.`}
        </p>
      )}
    </>
  );
}

function Grid({ columns, rows }: { columns: string[]; rows: Result['rows'] }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  useEffect(() => { box.current?.scrollTo(0, 0); setTop(0); }, [rows]);

  const n = rows.length;
  const start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const end = Math.min(n, Math.ceil((top + VIEW_H) / ROW_H) + OVERSCAN);
  const span = columns.length;

  return (
    <div ref={box} tabIndex={0} role="region" aria-label="Query results" onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      className="overflow-auto rounded-md border border-line" style={{ maxHeight: VIEW_H }}>
      <table aria-rowcount={n + 1} className="font-mono text-[13px]"
        style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: span * MIN_COL_W }}>
        <thead className="sticky top-0 z-10 bg-subtle">
          <tr aria-rowindex={1} style={{ height: ROW_H }}>
            {columns.map((c, i) => (
              <th key={i} title={c} className="truncate whitespace-nowrap border-b border-line px-3 text-left font-semibold leading-8 text-ink">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr aria-hidden style={{ height: start * ROW_H }}><td colSpan={span} /></tr>}
          {rows.slice(start, end).map((r, k) => {
            const i = start + k;
            return (
              <tr key={i} aria-rowindex={i + 2} style={{ height: ROW_H }} className={i % 2 === 0 ? '' : 'bg-canvas'}>
                {r.map((v, j) => (
                  <td key={j} title={v === null ? 'NULL' : String(v)} className="truncate whitespace-nowrap border-b border-line px-3 leading-8">
                    {v === null ? <span className="italic text-muted">NULL</span> : String(v)}
                  </td>
                ))}
              </tr>
            );
          })}
          {end < n && <tr aria-hidden style={{ height: (n - end) * ROW_H }}><td colSpan={span} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
