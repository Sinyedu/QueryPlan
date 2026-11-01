import { MAX_ROW_LIMIT, MIN_ROW_LIMIT, ROW_LIMIT_PRESETS, clampRowLimit } from '../domain/results';
import { QUERY_TIMEOUT_MS } from '../hooks/types';
import type { Lab } from '../hooks/useLab';
import { Button, Panel, inputCls } from './ui';

export function SqlEditor({ lab }: { lab: Lab }) {
  const running = lab.query.status === 'running';
  const run = () => { if (lab.busy === null) void lab.runQuery(); };

  return (
    <Panel
      title="SQL"
      aside={<span className="text-xs text-zinc-500">Ctrl/⌘+Enter to run</span>}
    >
      <textarea
        aria-label="SQL editor"
        value={lab.sql}
        onChange={(e) => lab.setSql(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }}
        spellCheck={false}
        rows={6}
        className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-sky-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="primary" onClick={run} disabled={lab.busy !== null}>{running ? 'Running…' : 'Run & explain'}</Button>
        {lab.busy === 'query' && (
          <Button variant="danger"
            onClick={() => { if (window.confirm('Stopping terminates the database worker and CLEARS the in-memory database. Continue?')) lab.cancel(); }}>
            Stop (clears DB)
          </Button>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Show up to
          <input
            aria-label="Rows to show" type="number" list="row-limit-presets" inputMode="numeric"
            min={MIN_ROW_LIMIT} max={MAX_ROW_LIMIT} step={1} value={lab.rowLimit}
            onChange={(e) => lab.setRowLimit(Number(e.target.value))}
            onBlur={(e) => lab.setRowLimit(clampRowLimit(Number(e.target.value)))}
            className={`${inputCls} w-20 text-right`}
          />
          rows
          <datalist id="row-limit-presets">{ROW_LIMIT_PRESETS.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <span className="text-xs text-zinc-500">
          max {MAX_ROW_LIMIT.toLocaleString()} · {QUERY_TIMEOUT_MS / 1000}s time budget · runs locally in a Web Worker
        </span>
      </div>
    </Panel>
  );
}
