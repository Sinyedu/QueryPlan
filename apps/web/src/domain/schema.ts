/** Table schema model, identifier validation/quoting, and DDL builders. */

export const COLUMN_TYPES = ['INTEGER', 'TEXT', 'REAL', 'NUMERIC'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const GENERATOR_KINDS = [
  'sequence', 'integer', 'decimal', 'boolean', 'fullName', 'email', 'word', 'city', 'uuid', 'isoDate', 'foreignKey',
] as const;
export type GeneratorKind = (typeof GENERATOR_KINDS)[number];

export const DISTRIBUTIONS = ['uniform', 'skewed'] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number];

/** Generators whose value choice honours the distribution setting. */
export const DISTRIBUTION_GENERATORS: readonly GeneratorKind[] = ['integer', 'word', 'city', 'foreignKey'];

/** Which column types each generator may fill. */
export const GENERATOR_TYPES: Record<GeneratorKind, readonly ColumnType[]> = {
  sequence: ['INTEGER', 'NUMERIC'],
  integer: ['INTEGER', 'NUMERIC', 'REAL'],
  decimal: ['REAL', 'NUMERIC'],
  boolean: ['INTEGER', 'NUMERIC'],
  fullName: ['TEXT'],
  email: ['TEXT'],
  word: ['TEXT'],
  city: ['TEXT'],
  uuid: ['TEXT'],
  isoDate: ['TEXT'],
  foreignKey: ['INTEGER'],
};

export interface ColumnRef {
  table: string;
  column: string;
}

export interface ColumnDef {
  name: string;
  type: ColumnType;
  generator: GeneratorKind;
  primaryKey: boolean;
  /** Required for (and only valid with) the foreignKey generator. */
  references?: ColumnRef;
  distribution?: Distribution;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export const MAX_COLUMNS = 12;
export const MAX_TABLES = 6;
export const MAX_IDENTIFIER_LENGTH = 64;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns an error message, or null when valid. */
export function validateIdentifier(name: string): string | null {
  if (name.length === 0) return 'Name is required.';
  if (name.length > MAX_IDENTIFIER_LENGTH) return `Name must be at most ${MAX_IDENTIFIER_LENGTH} characters.`;
  if (!IDENTIFIER.test(name)) return 'Use letters, digits and underscores only, not starting with a digit.';
  if (name.toLowerCase().startsWith('sqlite_')) return 'The "sqlite_" prefix is reserved by SQLite.';
  return null;
}

/** Quote an identifier for SQLite. Validates first; quoting is defence in depth. */
export function quoteIdentifier(name: string): string {
  const err = validateIdentifier(name);
  if (err) throw new Error(`Invalid identifier "${name}": ${err}`);
  return `"${name.replaceAll('"', '""')}"`;
}

export interface SchemaIssue {
  /** Column index, or -1 for the table name / table-level issues. */
  column: number;
  message: string;
}

export interface SchemaSetIssue extends SchemaIssue {
  /** Table index, or -1 for schema-wide issues. */
  table: number;
}

/** Per-table checks that need no other table. */
export function validateTable(def: TableDef): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const tableErr = validateIdentifier(def.name);
  if (tableErr) issues.push({ column: -1, message: `Table: ${tableErr}` });
  if (def.columns.length === 0) issues.push({ column: -1, message: 'Add at least one column.' });
  if (def.columns.length > MAX_COLUMNS) issues.push({ column: -1, message: `At most ${MAX_COLUMNS} columns.` });

  const seen = new Set<string>();
  def.columns.forEach((col, i) => {
    const err = validateIdentifier(col.name);
    if (err) issues.push({ column: i, message: err });
    else if (seen.has(col.name.toLowerCase())) issues.push({ column: i, message: `Duplicate column "${col.name}".` });
    seen.add(col.name.toLowerCase());
    if (!GENERATOR_TYPES[col.generator]?.includes(col.type)) {
      issues.push({ column: i, message: `Generator "${col.generator}" cannot fill a ${col.type} column.` });
    }
    if (col.primaryKey && col.type !== 'INTEGER') {
      issues.push({ column: i, message: 'Only an INTEGER column can be the primary key.' });
    }
    if (col.generator === 'foreignKey' && !col.references) issues.push({ column: i, message: 'Choose the parent column this key references.' });
    if (col.generator !== 'foreignKey' && col.references) issues.push({ column: i, message: 'Only the foreignKey generator can reference another table.' });
    if (col.distribution && !DISTRIBUTIONS.includes(col.distribution)) issues.push({ column: i, message: 'Unknown distribution.' });
  });
  if (def.columns.filter((c) => c.primaryKey).length > 1) {
    issues.push({ column: -1, message: 'Only one primary key column is supported.' });
  }
  return issues;
}

/** Columns another table may reference: the INTEGER PRIMARY KEY filled by `sequence` (values are exactly 1..N). */
export function referenceTargets(tables: readonly TableDef[], exceptTable?: string): ColumnRef[] {
  return tables
    .filter((t) => t.name !== exceptTable)
    .flatMap((t) => t.columns.filter((c) => c.primaryKey && c.type === 'INTEGER' && c.generator === 'sequence').map((c) => ({ table: t.name, column: c.name })));
}

/** Parents-first order, or null if the foreign keys form a cycle. Unknown parents are ignored here (validated elsewhere). */
export function orderTables<T extends TableDef>(tables: readonly T[]): T[] | null {
  const names = new Set(tables.map((t) => t.name));
  const done = new Set<string>();
  const out: T[] = [];
  let remaining = [...tables];
  while (remaining.length) {
    const ready = remaining.filter((t) => t.columns.every((c) => !c.references || c.references.table === t.name || !names.has(c.references.table) || done.has(c.references.table)));
    if (ready.length === 0) return null;
    for (const t of ready) { done.add(t.name); out.push(t); }
    remaining = remaining.filter((t) => !done.has(t.name));
  }
  return out;
}

/** Whole-schema validation: per-table checks plus names, foreign-key targets and cycles. */
export function validateSchema(tables: readonly TableDef[]): SchemaSetIssue[] {
  const issues: SchemaSetIssue[] = [];
  if (tables.length === 0) issues.push({ table: -1, column: -1, message: 'Add at least one table.' });
  if (tables.length > MAX_TABLES) issues.push({ table: -1, column: -1, message: `At most ${MAX_TABLES} tables.` });
  const seen = new Set<string>();
  tables.forEach((t, ti) => {
    for (const i of validateTable(t)) issues.push({ ...i, table: ti });
    if (seen.has(t.name.toLowerCase())) issues.push({ table: ti, column: -1, message: `Duplicate table "${t.name}".` });
    seen.add(t.name.toLowerCase());
    t.columns.forEach((c, ci) => {
      if (!c.references) return;
      const ok = referenceTargets(tables, t.name).some((r) => r.table === c.references!.table && r.column === c.references!.column);
      if (!ok) issues.push({ table: ti, column: ci, message: `References ${c.references.table}.${c.references.column}, which must be another table's sequence-filled INTEGER primary key.` });
    });
  });
  if (!issues.length && orderTables(tables) === null) issues.push({ table: -1, column: -1, message: 'Foreign keys form a cycle; tables cannot be created or seeded in order.' });
  return issues;
}

export function buildCreateTable(def: TableDef): string {
  const issues = validateTable(def);
  if (issues.length) throw new Error(issues[0]!.message);
  const cols = def.columns.map((c) => {
    const ref = c.references ? ` REFERENCES ${quoteIdentifier(c.references.table)} (${quoteIdentifier(c.references.column)})` : '';
    return `${quoteIdentifier(c.name)} ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${ref}`;
  });
  return `CREATE TABLE ${quoteIdentifier(def.name)} (\n  ${cols.join(',\n  ')}\n)`;
}

export function indexName(table: string, columns: string | readonly string[]): string {
  return `idx_${table}_${[columns].flat().join('_')}`.slice(0, MAX_IDENTIFIER_LENGTH);
}

export function buildCreateIndex(table: string, columns: string | readonly string[]): string {
  const cols = [columns].flat().map(quoteIdentifier).join(', ');
  return `CREATE INDEX ${quoteIdentifier(indexName(table, columns))} ON ${quoteIdentifier(table)} (${cols})`;
}

export function buildDropIndex(name: string): string {
  return `DROP INDEX ${quoteIdentifier(name)}`;
}

export function buildInsert(def: TableDef): string {
  const names = def.columns.map((c) => quoteIdentifier(c.name)).join(', ');
  const marks = def.columns.map(() => '?').join(', ');
  return `INSERT INTO ${quoteIdentifier(def.name)} (${names}) VALUES (${marks})`;
}

export const DEFAULT_TABLE: TableDef = {
  name: 'users',
  columns: [
    { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true },
    { name: 'name', type: 'TEXT', generator: 'fullName', primaryKey: false },
    { name: 'email', type: 'TEXT', generator: 'email', primaryKey: false },
    { name: 'created_at', type: 'TEXT', generator: 'isoDate', primaryKey: false },
  ],
};
