import { COLUMN_TYPES, GENERATOR_KINDS, MAX_COLUMNS, buildCreateTable, validateTable, type ColumnDef, type TableDef } from '../domain/schema';
import type { Lab } from '../hooks/useLab';
import { Alert, Button, Panel, inputCls } from './ui';

export function SchemaBuilder({ lab }: { lab: Lab }) {
  const { table, setTable, busy } = lab;
  const issues = validateTable(table);
  const exists = lab.schema.tables.some((t) => t.name === table.name);

  const setCol = (i: number, patch: Partial<ColumnDef>) =>
    setTable({ ...table, columns: table.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const patchTable = (t: Partial<TableDef>) => setTable({ ...table, ...t });

  return (
    <Panel title="1 · Table schema">
      <label className="mb-2 flex items-center gap-2 text-sm">
        <span className="w-12 text-zinc-400">Table</span>
        <input aria-label="Table name" className={`${inputCls} flex-1 font-mono`} value={table.name}
          onChange={(e) => patchTable({ name: e.target.value })} spellCheck={false} />
      </label>

      <ul className="space-y-1.5">
        {table.columns.map((c, i) => (
          <li key={i} className="grid grid-cols-[1fr_6.5rem] gap-1 sm:grid-cols-[1fr_6.5rem_6.5rem_auto_auto]">
            <input aria-label={`Column ${i + 1} name`} className={`${inputCls} min-w-0 font-mono`} value={c.name}
              onChange={(e) => setCol(i, { name: e.target.value })} spellCheck={false} />
            <select aria-label={`Column ${i + 1} type`} className={inputCls} value={c.type}
              onChange={(e) => setCol(i, { type: e.target.value as ColumnDef['type'] })}>
              {COLUMN_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select aria-label={`Column ${i + 1} data generator`} className={inputCls} value={c.generator}
              onChange={(e) => setCol(i, { generator: e.target.value as ColumnDef['generator'] })}>
              {GENERATOR_KINDS.map((g) => <option key={g}>{g}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-zinc-400">
              <input type="checkbox" checked={c.primaryKey} onChange={(e) =>
                setTable({ ...table, columns: table.columns.map((x, j) => ({ ...x, primaryKey: j === i ? e.target.checked : false })) })} />
              PK
            </label>
            <button aria-label={`Remove column ${c.name || i + 1}`} className="px-1 text-zinc-500 hover:text-red-400"
              onClick={() => patchTable({ columns: table.columns.filter((_, j) => j !== i) })}>✕</button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={table.columns.length >= MAX_COLUMNS}
          onClick={() => patchTable({ columns: [...table.columns, { name: `col${table.columns.length + 1}`, type: 'TEXT', generator: 'word', primaryKey: false }] })}>
          + Column
        </Button>
        <Button variant="primary" disabled={issues.length > 0 || busy !== null} onClick={() => lab.createTable(exists)}>
          {exists ? 'Drop & recreate table' : 'Create table'}
        </Button>
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-300">
          {issues.map((it, k) => <li key={k}>{it.column >= 0 ? `Column ${it.column + 1}: ` : ''}{it.message}</li>)}
        </ul>
      )}
      {lab.tableError && <div className="mt-2"><Alert tone="error">{lab.tableError}</Alert></div>}
      {issues.length === 0 && (
        <pre className="mt-3 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-400" aria-label="Generated SQL">{buildCreateTable(table)}</pre>
      )}
    </Panel>
  );
}
