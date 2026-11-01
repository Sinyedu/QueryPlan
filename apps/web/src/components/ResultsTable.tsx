import { formatMs } from '../domain/benchmark';
import type { QueryState } from '../hooks/types';
import { Alert, Panel } from './ui';

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

function Rows({ result }: { result: Extract<QueryState, { status: 'ok' }>['result'] }) {
  const { columns, rows, totalRows, truncated, rowsAffected, elapsedMs } = result;
  return (
    <>
      <p className="mb-2 text-xs text-zinc-400" role="status">
        {columns.length === 0
          ? `OK · ${rowsAffected ?? 0} row${rowsAffected === 1 ? '' : 's'} changed`
          : `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}${truncated ? ` (showing first ${rows.length.toLocaleString()})` : ''}`}
        {' · '}elapsed {formatMs(elapsedMs)} <span className="text-zinc-600">(measured wall time, single run)</span>
      </p>
      {columns.length > 0 && (
        <div className="max-h-96 overflow-auto rounded border border-zinc-800">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr>{columns.map((c, i) => <th key={i} className="whitespace-nowrap border-b border-zinc-800 px-2 py-1 text-left font-semibold text-sky-300">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-zinc-900/40">
                  {r.map((v, j) => (
                    <td key={j} className="max-w-xs truncate whitespace-nowrap px-2 py-0.5" title={v === null ? 'NULL' : String(v)}>
                      {v === null ? <span className="italic text-zinc-600">NULL</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <p className="mt-1 text-xs text-amber-300">Display truncated. The database row count is unaffected; add LIMIT or filters to narrow results.</p>}
    </>
  );
}
