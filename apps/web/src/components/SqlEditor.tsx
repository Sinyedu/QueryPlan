import { MAX_ROW_LIMIT, MIN_ROW_LIMIT, ROW_LIMIT_PRESETS, clampRowLimit } from '../domain/results';
import { QUERY_TIMEOUT_MS } from '../hooks/types';
import type { Lab } from '../hooks/useLab';
import { Button, Card, inputCls } from './ui';

export function SqlEditor({ lab }: { lab: Lab }) {
  const running = lab.query.status === 'running';
  const run = () => { if (lab.busy === null) void lab.runQuery(); };

  return (
    <Card className="p-4">
      <label htmlFor="sql-editor" className="mb-1.5 block text-sm font-semibold text-ink">SQL</label>
      <textarea
        id="sql-editor"
        aria-label="SQL editor"
        value={lab.sql}
        onChange={(e) => lab.setSql(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }}
        spellCheck={false}
        rows={6}
        className="w-full resize-y rounded-md border border-line bg-canvas p-3 font-mono text-sm leading-relaxed text-ink focus:border-accent"
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="primary" onClick={run} disabled={lab.busy !== null}>{running ? 'Running…' : 'Run & explain'}</Button>
        <span className="text-sm text-muted">Ctrl / ⌘ + Enter</span>
        {lab.busy === 'query' && (
          <Button variant="danger"
            onClick={() => { if (window.confirm('Stopping terminates the database worker and CLEARS the in-memory database. Continue?')) lab.cancel(); }}>
            Stop (clears database)
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          Show up to
          <input
            aria-label="Rows to show" type="number" list="row-limit-presets" inputMode="numeric"
            min={MIN_ROW_LIMIT} max={MAX_ROW_LIMIT} step={1} value={lab.rowLimit}
            onChange={(e) => lab.setRowLimit(Number(e.target.value))}
            onBlur={(e) => lab.setRowLimit(clampRowLimit(Number(e.target.value)))}
            className={`${inputCls} w-24 text-right`}
          />
          rows
          <datalist id="row-limit-presets">{ROW_LIMIT_PRESETS.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        Rows to show: {MIN_ROW_LIMIT}–{MAX_ROW_LIMIT.toLocaleString()} (type any number or pick a preset) · {QUERY_TIMEOUT_MS / 1000}s time budget · runs locally in a Web Worker
      </p>
    </Card>
  );
}
