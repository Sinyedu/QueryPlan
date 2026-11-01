import { MAX_ROWS, MIN_ROWS, clampRowCount } from '../domain/seeding';
import type { Lab } from '../hooks/useLab';
import { Button, Panel, inputCls } from './ui';

export function SeedPanel({ lab }: { lab: Lab }) {
  const { progress, rowCount, setRowCount } = lab;
  const exists = lab.schema.tables.some((t) => t.name === lab.table.name);
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Panel title="2 · Seed data">
      <div className="flex items-center gap-2">
        <input aria-label="Row count slider" type="range" min={MIN_ROWS} max={MAX_ROWS} step={100} value={rowCount}
          onChange={(e) => setRowCount(Number(e.target.value))} className="min-w-0 flex-1" />
        <input aria-label="Row count" type="number" min={MIN_ROWS} max={MAX_ROWS} value={rowCount}
          onChange={(e) => setRowCount(Number(e.target.value))}
          onBlur={() => setRowCount(clampRowCount(rowCount))} className={`${inputCls} w-24 text-right`} />
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {MIN_ROWS.toLocaleString()}–{MAX_ROWS.toLocaleString()} rows · deterministic (seed 42) · replaces existing rows · inserted in 500-row batches in one transaction
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" disabled={!exists || lab.busy !== null} onClick={lab.seed}>Seed table</Button>
        {!exists && <span className="text-xs text-zinc-500">Create the table first.</span>}
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
