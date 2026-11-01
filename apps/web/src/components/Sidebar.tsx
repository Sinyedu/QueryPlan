import type { Lab } from '../hooks/useLab';
import { Panel } from './ui';

/** Live view of what actually exists in the database (read via PRAGMA, not our local form state). */
export function Sidebar({ lab }: { lab: Lab }) {
  const tables = lab.schema.tables;
  return (
    <Panel title="Database">
      {tables.length === 0 ? <p className="text-sm text-zinc-500">Empty. No tables yet.</p> : (
        <ul className="space-y-3">
          {tables.map((t) => (
            <li key={t.name}>
              <p className="font-mono text-sm text-zinc-100">{t.name} <span className="text-xs text-zinc-500">· {t.rowCount.toLocaleString()} rows</span></p>
              <ul className="ml-3 mt-1 border-l border-zinc-800 pl-2 font-mono text-xs text-zinc-400">
                {t.columns.map((c) => <li key={c.name}>{c.name} <span className="text-zinc-600">{c.type}{c.primaryKey ? ' PK' : ''}</span></li>)}
                {t.indexes.map((i) => <li key={i.name} className="text-emerald-400">⚡ {i.name}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
