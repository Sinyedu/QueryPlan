import type { Lab } from '../hooks/useLab';
import { Badge, Button } from './ui';

/** Live view of what actually exists in the database (read via PRAGMA, not our local form state). */
export function Sidebar({ lab, onAddTable, onSeed, onEditSchema }: { lab: Lab; onAddTable: () => void; onSeed: () => void; onEditSchema: () => void }) {
  const tables = lab.schema.tables;
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Database</h2>
        <Button variant="primary" size="sm" onClick={onAddTable}>+ Table</Button>
      </div>
      {lab.dirty && <Badge tone="warn">Schema edits not applied</Badge>}

      <div className="min-h-0 flex-1 overflow-auto">
        {tables.length === 0 ? (
          <p className="text-sm text-muted">Empty. No tables yet. Use <b>+ Table</b> to design one.</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((t, i) => (
              <li key={t.name}>
                <details open={i === 0} className="group rounded-md border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-sm marker:hidden [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="text-[10px] text-muted transition-transform group-open:rotate-90">▶</span>
                    <span className="min-w-0 flex-1 truncate font-mono font-semibold text-ink">{t.name}</span>
                    <span className="shrink-0 text-xs text-muted">{t.rowCount.toLocaleString()} rows</span>
                  </summary>
                  <ul className="space-y-0.5 border-t border-line px-2.5 py-2 font-mono text-xs">
                    {t.columns.map((c) => {
                      const fk = t.foreignKeys.find((f) => f.from === c.name);
                      return (
                        <li key={c.name} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-ink">{c.name}</span>
                          <span className="ml-auto text-muted">{c.type}{c.primaryKey ? ' PK' : ''}</span>
                          {fk && <span className="basis-full text-accent-ink">→ {fk.table}.{fk.to}</span>}
                        </li>
                      );
                    })}
                    {t.indexes.map((i) => <li key={i.name} className="break-all text-accent-ink">⚡ {i.name} ({i.columns.join(', ')})</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <Button className="w-full" onClick={onSeed}>Seed data</Button>
        <button onClick={onEditSchema} className="block w-full text-center text-sm font-medium text-accent hover:underline">Edit schema</button>
        <Button variant="danger" size="sm" className="w-full" disabled={lab.busy === 'init'}
          onClick={() => { if (window.confirm('Reset the database? All tables and rows will be deleted.')) void lab.resetDatabase(); }}>
          Reset database
        </Button>
      </div>
    </div>
  );
}
