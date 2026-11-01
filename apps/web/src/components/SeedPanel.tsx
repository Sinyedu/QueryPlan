import { MAX_ROWS, MAX_TOTAL_ROWS, MIN_ROWS, clampRowCount } from '../domain/seeding';
import type { Lab } from '../hooks/useLab';
import { Alert, Button, Card, Disclosure, inputCls } from './ui';

/** Seed page: editable row counts per table, deterministic seed, progress and a clearly explained Stop. */
export function SeedPanel({ lab, onBack }: { lab: Lab; onBack: () => void }) {
  const { progress, tables, setTables } = lab;
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const total = tables.reduce((n, t) => n + clampRowCount(t.rowCount), 0);
  const created = tables.every((t) => lab.schema.tables.some((s) => s.name === t.table.name));
  const overCap = total > MAX_TOTAL_ROWS;
  const seeding = lab.busy === 'seed';
  const setCount = (i: number, rowCount: number) => setTables(tables.map((t, j) => (j === i ? { ...t, rowCount } : t)));

  return (
    <Card className="mx-auto max-w-3xl p-6">
      <h2 className="text-2xl font-bold tracking-tight text-ink">Seed data</h2>
      <p className="mt-1 text-ink-soft">Generate repeatable example data for your tables.</p>

      <table className="mt-5 w-full overflow-hidden rounded-md border border-line text-sm">
        <thead className="bg-subtle text-left text-ink-soft"><tr><th className="px-3 py-2 font-semibold">Table</th><th className="px-3 py-2 font-semibold">Rows</th></tr></thead>
        <tbody>
          {tables.map((t, i) => (
            <tr key={i} className="border-t border-line">
              <td className="px-3 py-2 font-mono text-ink">{t.table.name}</td>
              <td className="px-3 py-1.5">
                <input aria-label={`Row count for ${t.table.name}`} type="number" min={MIN_ROWS} max={MAX_ROWS} value={t.rowCount} disabled={seeding}
                  onChange={(e) => setCount(i, Number(e.target.value))} onBlur={() => setCount(i, clampRowCount(t.rowCount))}
                  className={`${inputCls} w-32 text-right`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-ink"><b>{total.toLocaleString()} / {MAX_TOTAL_ROWS.toLocaleString()}</b> total rows</p>
      <p className="text-sm text-muted">{MIN_ROWS.toLocaleString()}–{MAX_ROWS.toLocaleString()} rows per table. Parents are filled before children, in 500-row batches inside one transaction.</p>
      {overCap && <Alert tone="warn" className="mt-2">Total {total.toLocaleString()} rows exceeds the {MAX_TOTAL_ROWS.toLocaleString()} cap.</Alert>}

      <hr className="my-5 border-line" />
      <label className="block text-sm font-semibold text-ink" htmlFor="seed-value">Random seed</label>
      <input id="seed-value" aria-label="Random seed" type="number" min={0} max={4294967295} step={1} value={lab.seedValue} disabled={seeding}
        onChange={(e) => lab.setSeedValue(Math.max(0, Math.floor(Number(e.target.value)) || 0))} className={`${inputCls} mt-1 w-full`} />
      <p className="mt-1 text-sm text-muted">Same seed, same data.</p>

      <Disclosure title="Generators & distributions" hint="Configured per column in Schema" className="mt-4">
        <p className="text-ink-soft">Each column's generator (sequence, name, email, foreignKey …) and its uniform or skewed distribution are set in the Schema view. Foreign keys draw from 1..parent row count.</p>
      </Disclosure>

      <Alert tone="warn" className="mt-4">Seeding replaces existing rows in these tables.</Alert>
      {!created && <p className="mt-2 text-sm text-muted">Create the tables first (Schema → Create tables).</p>}

      {progress ? (
        <div className="mt-5 rounded-lg border border-info-line bg-info-soft p-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Seeding progress">
          <p className="font-semibold text-ink">While seeding</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-sm text-ink-soft">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows</p>
          <Button variant="danger" className="mt-3 w-full"
            onClick={() => { if (window.confirm('Stopping terminates the database worker and CLEARS the in-memory database. Continue?')) lab.cancel(); }}>
            Stop &amp; clear database
          </Button>
          <p className="mt-1 text-xs text-muted">Stopping resets the database and removes all tables and rows.</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!created || overCap || lab.busy !== null} onClick={lab.seed}>Seed all tables</Button>
          <Button onClick={onBack}>Back to query</Button>
        </div>
      )}
      {lab.seedMsg && <p className="mt-3 text-sm text-ink-soft" role="status">{lab.seedMsg}</p>}
    </Card>
  );
}
