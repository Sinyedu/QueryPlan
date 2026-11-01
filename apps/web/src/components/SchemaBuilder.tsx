import { useState } from 'react';
import { MAX_COLUMNS, MAX_TABLES, buildCreateTable, orderTables, type ColumnDef, type TableDef } from '../domain/schema';
import type { Lab } from '../hooks/useLab';
import { ColumnRow } from './ColumnRow';
import { Alert, Button, Panel, inputCls } from './ui';

const newTable = (n: number): TableDef => ({
  name: `table${n}`,
  columns: [
    { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true },
    { name: 'label', type: 'TEXT', generator: 'word', primaryKey: false },
  ],
});

export function SchemaBuilder({ lab }: { lab: Lab }) {
  const { tables, setTables, busy, schemaIssues } = lab;
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, tables.length - 1);
  const t = tables[active]!;
  const defs = tables.map((x) => x.table);

  const patchTable = (patch: Partial<TableDef>) => setTables(tables.map((x, i) => (i === active ? { ...x, table: { ...x.table, ...patch } } : x)));
  const patchCol = (ci: number, patch: Partial<ColumnDef>) => patchTable({ columns: t.table.columns.map((c, j) => (j === ci ? { ...c, ...patch } : c)) });
  const sql = schemaIssues.length === 0 ? orderTables(defs)!.map(buildCreateTable).join(';\n\n') : null;

  return (
    <Panel title="1 · Table schema">
      <div role="tablist" aria-label="Tables" className="mb-2 flex flex-wrap gap-1">
        {tables.map((x, i) => (
          <button key={i} role="tab" aria-selected={i === active} onClick={() => setSelected(i)}
            className={`rounded px-2 py-0.5 font-mono text-xs ${i === active ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
            {x.table.name || '(unnamed)'}
          </button>
        ))}
        <button aria-label="Add table" disabled={tables.length >= MAX_TABLES} className="rounded bg-zinc-800 px-2 py-0.5 text-xs hover:bg-zinc-700 disabled:opacity-40"
          onClick={() => { setTables([...tables, { table: newTable(tables.length + 1), rowCount: 1_000 }]); setSelected(tables.length); }}>+ table</button>
      </div>

      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="w-12 text-zinc-400">Table</span>
        <input aria-label="Table name" className={`${inputCls} flex-1 font-mono`} value={t.table.name} onChange={(e) => patchTable({ name: e.target.value })} spellCheck={false} />
        <button aria-label="Remove table" disabled={tables.length <= 1} className="px-1 text-zinc-500 hover:text-red-400 disabled:opacity-30"
          onClick={() => { setTables(tables.filter((_, i) => i !== active)); setSelected(0); }}>✕</button>
      </div>

      <ul className="space-y-1.5">
        {t.table.columns.map((c, i) => (
          <ColumnRow key={i} col={c} index={i} tableName={t.table.name} allTables={defs}
            onChange={(p) => patchCol(i, p)}
            onPrimaryKey={(on) => patchTable({ columns: t.table.columns.map((x, j) => ({ ...x, primaryKey: j === i ? on : false })) })}
            onRemove={() => patchTable({ columns: t.table.columns.filter((_, j) => j !== i) })} />
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={t.table.columns.length >= MAX_COLUMNS}
          onClick={() => patchTable({ columns: [...t.table.columns, { name: `col${t.table.columns.length + 1}`, type: 'TEXT', generator: 'word', primaryKey: false }] })}>
          + Column
        </Button>
        <Button variant="primary" disabled={schemaIssues.length > 0 || busy !== null} onClick={lab.createSchema}>
          {lab.existing ? 'Drop & recreate tables' : 'Create tables'}
        </Button>
      </div>

      {schemaIssues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-300">
          {schemaIssues.map((it, k) => (
            <li key={k}>{it.table >= 0 ? `${tables[it.table]?.table.name || `Table ${it.table + 1}`}${it.column >= 0 ? `, column ${it.column + 1}` : ''}: ` : ''}{it.message}</li>
          ))}
        </ul>
      )}
      {lab.tableError && <div className="mt-2"><Alert tone="error">{lab.tableError}</Alert></div>}
      {sql && <pre className="mt-3 max-h-56 overflow-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-400" aria-label="Generated SQL">{sql}</pre>}
    </Panel>
  );
}
