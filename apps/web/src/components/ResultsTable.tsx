import { useEffect, useRef, useState } from 'react';
import { formatMs } from '../domain/benchmark';
import { MAX_ROW_LIMIT } from '../domain/results';
import type { QueryState } from '../hooks/types';
import { Alert, Panel } from './ui';

const ROW_H = 24;
const VIEW_H = 440;
const OVERSCAN = 10;
const MIN_COL_W = 150;

type Result = Extract<QueryState, { status: 'ok' }>['result'];

export function ResultsTable({ query }: { query: QueryState }) {
  return (
    <Panel title="Results">
      {query.status === 'idle' && <p className="text-sm text-zinc-500">Run a query to see rows here.</p>}
      {query.status === 'running' && <p className="text-sm text-zinc-400" role="status">Running…</p>}
      {query.status === 'error' && <Alert tone={query.canceled ? 'warn' : 'error'}>{query.message}</Alert>}
      {query.status === 'ok' && <Rows result={query.result} />}
    </Panel>
  );
}

/** Summary line + a windowed grid: only the rows in (or near) view are in the DOM, so thousands of rows stay fast. */
function Rows({ result }: { result: Result }) {
  const { columns, rows, totalRows, truncated, byteLimited, rowsAffected, elapsedMs } = result;
  const n = rows.length;
  return (
    <>
      <p className="mb-2 text-xs text-zinc-400" role="status">
        {columns.length === 0
          ? `OK · ${rowsAffected ?? 0} row${rowsAffected === 1 ? '' : 's'} changed`
          : `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}${truncated ? ` (showing first ${n.toLocaleString()})` : ''}`}
        {' · '}elapsed {formatMs(elapsedMs)} <span className="text-zinc-600">(measured wall time, single run)</span>
      </p>
      {columns.length > 0 && <Grid columns={columns} rows={rows} />}
      {truncated && (
        <p className="mt-1 text-xs text-amber-300">
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
      className="overflow-auto rounded border border-zinc-800" style={{ maxHeight: VIEW_H }}>
      <table aria-rowcount={n + 1} className="font-mono text-xs"
        style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: span * MIN_COL_W }}>
        <thead className="sticky top-0 z-10 bg-zinc-900">
          <tr aria-rowindex={1} style={{ height: ROW_H }}>
            {columns.map((c, i) => (
              <th key={i} title={c} className="truncate whitespace-nowrap border-b border-zinc-800 px-2 text-left font-semibold leading-6 text-sky-300">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr aria-hidden style={{ height: start * ROW_H }}><td colSpan={span} /></tr>}
          {rows.slice(start, end).map((r, k) => {
            const i = start + k;
            return (
              <tr key={i} aria-rowindex={i + 2} style={{ height: ROW_H }} className={i % 2 === 0 ? 'bg-zinc-900/40' : ''}>
                {r.map((v, j) => (
                  <td key={j} title={v === null ? 'NULL' : String(v)} className="truncate whitespace-nowrap px-2 leading-6">
                    {v === null ? <span className="italic text-zinc-600">NULL</span> : String(v)}
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
