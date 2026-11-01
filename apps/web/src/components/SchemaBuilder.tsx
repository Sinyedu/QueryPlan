import { useState } from 'react';
import { MAX_COLUMNS, MAX_TABLES, buildCreateTable, orderTables, type ColumnDef } from '../domain/schema';
import type { Lab } from '../hooks/useLab';
import { ColumnDetails, ColumnRow } from './ColumnRow';
import { Alert, Badge, Button, Card, Disclosure, inputCls } from './ui';

/** "Edit table" inspector. The diagram edits the same tables; the selected table is shared between them. */
export function SchemaBuilder({ lab, onNext }: { lab: Lab; onNext: () => void }) {
  const { tables, setTables, busy, schemaIssues, design } = lab;
  const [col, setCol] = useState(0);
  const active = design.active;
  const t = tables[active]!;
  const defs = tables.map((x) => x.table);
  const colIndex = Math.min(col, t.table.columns.length - 1);
  const selectedCol = t.table.columns[colIndex];

  const patchTable = (columns: ColumnDef[]) => setTables(tables.map((x, i) => (i === active ? { ...x, table: { ...x.table, columns } } : x)));
  const patchCol = (ci: number, patch: Partial<ColumnDef>) => {
    // A pure rename also updates foreign keys that point at this column.
    if (patch.name !== undefined && Object.keys(patch).length === 1) return design.renameCol(active, ci, patch.name);
    patchTable(t.table.columns.map((c, j) => (j === ci ? { ...c, ...patch } : c)));
  };
  const sql = schemaIssues.length === 0 ? orderTables(defs)!.map(buildCreateTable).join(';\n\n') : null;

  const create = () => {
    if (lab.existing && !window.confirm('Drop & recreate: tables with these names, and the rows in them, will be deleted. Continue?')) return;
    lab.createSchema();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Edit table</h2>
        {lab.dirty && <Badge tone="warn">Not applied yet</Badge>}
      </div>

      <div role="tablist" aria-label="Tables" className="mt-2 flex flex-wrap gap-1.5">
        {tables.map((x, i) => (
          <button key={i} role="tab" aria-selected={i === active} onClick={() => { design.select(i); setCol(0); }}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs ${i === active ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface text-ink hover:bg-subtle'}`}>
            {x.table.name || '(unnamed)'}
          </button>
        ))}
        <button aria-label="Add table" disabled={tables.length >= MAX_TABLES} onClick={design.add}
          className="rounded-md border border-dashed border-line-strong px-2.5 py-1 text-xs text-ink-soft hover:bg-subtle disabled:opacity-40">+ table</button>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="block flex-1 text-sm font-medium text-ink">Table name
          <input aria-label="Table name" className={`${inputCls} mt-1 w-full font-mono`} value={t.table.name} onChange={(e) => design.rename(active, e.target.value)} spellCheck={false} />
        </label>
        <Button variant="danger" aria-label="Remove table" disabled={tables.length <= 1} onClick={() => design.remove(active)}>Remove</Button>
      </div>

      <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Columns</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_7.5rem_auto] gap-1.5 px-1 text-xs font-medium text-muted"><span>Name</span><span>Type</span><span>Key</span><span className="w-7" /></div>
      <ul>
        {t.table.columns.map((c, i) => (
          <ColumnRow key={i} col={c} index={i} selected={i === colIndex} onSelect={() => setCol(i)}
            onChange={(p) => patchCol(i, p)}
            onPrimaryKey={(on) => patchTable(t.table.columns.map((x, j) => ({ ...x, primaryKey: j === i ? on : false })))}
            onRemove={() => patchTable(t.table.columns.filter((_, j) => j !== i))} />
        ))}
      </ul>
      <Button className="mt-2" disabled={t.table.columns.length >= MAX_COLUMNS}
        onClick={() => { patchTable([...t.table.columns, { name: `col${t.table.columns.length + 1}`, type: 'TEXT', generator: 'word', primaryKey: false }]); setCol(t.table.columns.length); }}>
        + Column
      </Button>

      {selectedCol && (
        <div className="mt-4 rounded-md border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">Column: <span className="font-mono">{selectedCol.name || colIndex + 1}</span></h3>
          <ColumnDetails col={selectedCol} index={colIndex} tableName={t.table.name} allTables={defs} onChange={(p) => patchCol(colIndex, p)} />
        </div>
      )}

      {schemaIssues.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-warn-ink">
          {schemaIssues.map((it, k) => (
            <li key={k}>{it.table >= 0 ? `${tables[it.table]?.table.name || `Table ${it.table + 1}`}${it.column >= 0 ? `, column ${it.column + 1}` : ''}: ` : ''}{it.message}</li>
          ))}
        </ul>
      )}
      {lab.tableError && <div className="mt-3"><Alert tone="error">{lab.tableError}</Alert></div>}

      <Disclosure title="Preview SQL" className="mt-4">
        {sql ? <pre className="max-h-56 overflow-auto font-mono text-xs text-ink-soft" aria-label="Generated SQL">{sql}</pre> : <p className="text-muted">Fix the issues above to see the generated SQL.</p>}
      </Disclosure>

      <Button variant="primary" className="mt-4 w-full" disabled={schemaIssues.length > 0 || busy !== null} onClick={create}>
        {lab.existing ? 'Drop & recreate tables' : 'Create tables'}
      </Button>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">Creates your schema in the local database.</span>
        <button onClick={onNext} className="font-medium text-accent hover:underline">Next: seed data →</button>
      </div>
    </Card>
  );
}
