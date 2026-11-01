/**
 * Pure schema-editing operations used by the visual designer (and the form). Every function returns a new
 * value and never mutates its input; invalid requests come back as `{ ok: false, error }` instead of throwing.
 */
import { MAX_TABLES, orderTables, referenceTargets, type ColumnDef, type TableDef } from './schema';
import type { SeedTable } from './seeding';

export interface ColumnAddress {
  table: string;
  column: string;
}

export interface Relationship {
  from: ColumnAddress;
  to: ColumnAddress;
}

export type EditResult = { ok: true; tables: SeedTable[] } | { ok: false; error: string };
export type Layout = Record<string, { x: number; y: number }>;

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** First free `tableN` name (case-insensitive). */
export function uniqueTableName(tables: readonly SeedTable[], base = 'table'): string {
  for (let n = tables.length + 1; ; n++) {
    const name = `${base}${n}`;
    if (!tables.some((t) => sameName(t.table.name, name))) return name;
  }
}

export function newTable(name: string): SeedTable {
  const columns: ColumnDef[] = [
    { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true },
    { name: 'label', type: 'TEXT', generator: 'word', primaryKey: false },
  ];
  return { table: { name, columns }, rowCount: 1_000 };
}

export function addTable(tables: readonly SeedTable[]): EditResult {
  if (tables.length >= MAX_TABLES) return { ok: false, error: `At most ${MAX_TABLES} tables.` };
  return { ok: true, tables: [...tables, newTable(uniqueTableName(tables))] };
}

const mapTable = (tables: readonly SeedTable[], index: number, fn: (t: TableDef) => TableDef): SeedTable[] =>
  tables.map((t, i) => (i === index ? { ...t, table: fn(t.table) } : t));

/** Renames a table and keeps every foreign key that pointed at it pointing at it. */
export function renameTable(tables: readonly SeedTable[], index: number, newName: string): SeedTable[] {
  const old = tables[index]?.table.name;
  if (old === undefined) return [...tables];
  return tables.map((t, i) => ({
    ...t,
    table: {
      ...t.table,
      name: i === index ? newName : t.table.name,
      columns: t.table.columns.map((c) => (c.references?.table === old ? { ...c, references: { ...c.references, table: newName } } : c)),
    },
  }));
}

/** Renames a column and keeps foreign keys that referenced it pointing at it. */
export function renameColumn(tables: readonly SeedTable[], tableIndex: number, columnIndex: number, newName: string): SeedTable[] {
  const table = tables[tableIndex]?.table;
  const old = table?.columns[columnIndex]?.name;
  if (!table || old === undefined) return [...tables];
  return tables.map((t, ti) => ({
    ...t,
    table: {
      ...t.table,
      columns: t.table.columns.map((c, ci) => {
        if (ti === tableIndex && ci === columnIndex) return { ...c, name: newName };
        if (c.references?.table === table.name && c.references.column === old) return { ...c, references: { ...c.references, column: newName } };
        return c;
      }),
    },
  }));
}

/** Removes a table; columns that referenced it become plain integer columns instead of dangling. */
export function removeTable(tables: readonly SeedTable[], index: number): EditResult {
  const gone = tables[index]?.table.name;
  if (gone === undefined) return { ok: false, error: 'No such table.' };
  if (tables.length <= 1) return { ok: false, error: 'Keep at least one table.' };
  return {
    ok: true,
    tables: tables.filter((_, i) => i !== index).map((t) => ({
      ...t,
      table: { ...t.table, columns: t.table.columns.map((c) => (c.references?.table === gone ? detach(c) : c)) },
    })),
  };
}

const detach = (c: ColumnDef): ColumnDef => {
  const { references: _unused, ...rest } = c;
  void _unused;
  return { ...rest, generator: 'integer' };
};

/** Make `from` a foreign key to `to`. Rejects anything the generator could not honour or that would form a cycle. */
export function connect(tables: readonly SeedTable[], from: ColumnAddress, to: ColumnAddress): EditResult {
  const ti = tables.findIndex((t) => t.table.name === from.table);
  const col = tables[ti]?.table.columns.find((c) => c.name === from.column);
  if (ti < 0 || !col) return { ok: false, error: `${from.table}.${from.column} does not exist.` };
  if (from.table === to.table) return { ok: false, error: 'A table cannot reference itself.' };
  if (col.primaryKey) return { ok: false, error: `${from.table}.${from.column} is the primary key; pick another column to hold the reference.` };
  const valid = referenceTargets(tables.map((t) => t.table), from.table).some((r) => r.table === to.table && r.column === to.column);
  if (!valid) {
    return { ok: false, error: `${to.table}.${to.column} cannot be referenced: only another table's INTEGER primary key filled by the sequence generator can.` };
  }
  const next = mapTable(tables, ti, (t) => ({
    ...t,
    columns: t.columns.map((c) => (c.name === from.column ? { ...c, type: 'INTEGER' as const, generator: 'foreignKey' as const, references: { ...to } } : c)),
  }));
  if (orderTables(next.map((t) => t.table)) === null) {
    return { ok: false, error: 'That connection would create a cycle; tables must be creatable parent-first.' };
  }
  return { ok: true, tables: next };
}

/** Turn a foreign key back into a plain integer column. */
export function disconnect(tables: readonly SeedTable[], from: ColumnAddress): SeedTable[] {
  return tables.map((t) =>
    t.table.name !== from.table ? t : { ...t, table: { ...t.table, columns: t.table.columns.map((c) => (c.name === from.column && c.references ? detach(c) : c)) } });
}

export function relationships(tables: readonly SeedTable[]): Relationship[] {
  return tables.flatMap((t) =>
    t.table.columns.flatMap((c) => (c.generator === 'foreignKey' && c.references ? [{ from: { table: t.table.name, column: c.name }, to: { ...c.references } }] : [])));
}

export const CARD_W = 210;
export const HEAD_H = 32;
export const ROW_H = 24;
export const cardHeight = (t: TableDef) => HEAD_H + Math.max(1, t.columns.length) * ROW_H + 8;

/**
 * Deterministic default positions: parents on the left, children to their right (by foreign-key depth),
 * stacked without overlap. Broken references and cycles are tolerated (those tables fall back to level 0).
 */
export function autoLayout(tables: readonly SeedTable[]): Layout {
  const byName = new Map(tables.map((t) => [t.table.name, t.table]));
  const level = new Map<string, number>();
  const depth = (name: string, seen: Set<string>): number => {
    const known = level.get(name);
    if (known !== undefined) return known;
    const t = byName.get(name);
    if (!t || seen.has(name)) return 0;
    seen.add(name);
    const parents = t.columns.flatMap((c) => (c.references && byName.has(c.references.table) ? [c.references.table] : []));
    const d = parents.length ? 1 + Math.max(...parents.map((p) => depth(p, seen))) : 0;
    level.set(name, d);
    return d;
  };
  const used = new Map<number, number>();
  const out: Layout = {};
  for (const { table } of tables) {
    const lv = depth(table.name, new Set());
    const y = used.get(lv) ?? 24;
    out[table.name] = { x: 24 + lv * (CARD_W + 90), y };
    used.set(lv, y + cardHeight(table) + 28);
  }
  return out;
}
