/** Table schema model, identifier validation/quoting, and DDL builders. */

export const COLUMN_TYPES = ['INTEGER', 'TEXT', 'REAL', 'NUMERIC'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const GENERATOR_KINDS = [
  'sequence', 'integer', 'decimal', 'boolean', 'fullName', 'email', 'word', 'city', 'uuid', 'isoDate',
] as const;
export type GeneratorKind = (typeof GENERATOR_KINDS)[number];

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
};

export interface ColumnDef {
  name: string;
  type: ColumnType;
  generator: GeneratorKind;
  primaryKey: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export const MAX_COLUMNS = 12;
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
  });
  if (def.columns.filter((c) => c.primaryKey).length > 1) {
    issues.push({ column: -1, message: 'Only one primary key column is supported.' });
  }
  return issues;
}

export function buildCreateTable(def: TableDef): string {
  const issues = validateTable(def);
  if (issues.length) throw new Error(issues[0]!.message);
  const cols = def.columns.map((c) => `${quoteIdentifier(c.name)} ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE ${quoteIdentifier(def.name)} (\n  ${cols.join(',\n  ')}\n)`;
}

export function indexName(table: string, column: string): string {
  return `idx_${table}_${column}`.slice(0, MAX_IDENTIFIER_LENGTH);
}

export function buildCreateIndex(table: string, column: string): string {
  return `CREATE INDEX ${quoteIdentifier(indexName(table, column))} ON ${quoteIdentifier(table)} (${quoteIdentifier(column)})`;
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
