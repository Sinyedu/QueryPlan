import { MAX_ROWS, MAX_TOTAL_ROWS, MIN_ROWS, clampRowCount } from '../domain/seeding';
import type { Lab } from '../hooks/useLab';
import { Button, Panel, inputCls } from './ui';

export function SeedPanel({ lab }: { lab: Lab }) {
  const { progress, tables, setTables } = lab;
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const total = tables.reduce((n, t) => n + clampRowCount(t.rowCount), 0);
  const created = tables.every((t) => lab.schema.tables.some((s) => s.name === t.table.name));
  const overCap = total > MAX_TOTAL_ROWS;
  const setCount = (i: number, rowCount: number) => setTables(tables.map((t, j) => (j === i ? { ...t, rowCount } : t)));

  return (
    <Panel title="2 · Seed data">
      <ul className="space-y-1.5">
        {tables.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{t.table.name}</span>
            <input aria-label={`Row count for ${t.table.name}`} type="number" min={MIN_ROWS} max={MAX_ROWS} value={t.rowCount}
              onChange={(e) => setCount(i, Number(e.target.value))} onBlur={() => setCount(i, clampRowCount(t.rowCount))}
              className={`${inputCls} w-24 text-right`} />
          </li>
        ))}
      </ul>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-zinc-400">Seed</span>
        <input aria-label="Random seed" type="number" min={0} max={4294967295} step={1} value={lab.seedValue}
          onChange={(e) => lab.setSeedValue(Math.max(0, Math.floor(Number(e.target.value)) || 0))} className={`${inputCls} w-32 text-right`} />
        <span className="text-xs text-zinc-500">same seed → same data</span>
      </label>
      <p className="mt-1 text-xs text-zinc-500">
        {MIN_ROWS.toLocaleString()}–{MAX_ROWS.toLocaleString()} rows per table, {MAX_TOTAL_ROWS.toLocaleString()} total · replaces existing rows · parents are filled before children · 500-row batches in one transaction
      </p>
      {overCap && <p className="mt-1 text-xs text-amber-300">Total {total.toLocaleString()} rows exceeds the {MAX_TOTAL_ROWS.toLocaleString()} cap.</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" disabled={!created || overCap || lab.busy !== null} onClick={lab.seed}>Seed all tables</Button>
        {lab.busy === 'seed' && (
          <Button variant="danger"
            onClick={() => { if (window.confirm('Stopping terminates the database worker and CLEARS the in-memory database. Continue?')) lab.cancel(); }}>
            Stop (clears DB)
          </Button>
        )}
        {!created && <span className="text-xs text-zinc-500">Create the tables first.</span>}
      </div>
      {progress && (
        <div className="mt-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Seeding progress">
          <div className="h-2 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-zinc-400">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows</p>
        </div>
      )}
      {lab.seedMsg && <p className="mt-2 text-xs text-zinc-300" role="status">{lab.seedMsg}</p>}
    </Panel>
  );
}
