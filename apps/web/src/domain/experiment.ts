/**
 * Experiment definitions: schema + row counts + seed + SQL. They contain NO row data (data is regenerated
 * deterministically from the seed), so they are safe to save locally, export, and share.
 * Anything read back from storage, a file, or a URL is untrusted and goes through `parseExperiment`.
 */
import {
  COLUMN_TYPES, DISTRIBUTIONS, GENERATOR_KINDS, MAX_COLUMNS, MAX_TABLES, validateSchema,
  type ColumnDef, type TableDef,
} from './schema';
import { MAX_TOTAL_ROWS, clampRowCount, type SeedTable } from './seeding';

export const EXPERIMENT_VERSION = 1;
export const MAX_EXPERIMENT_BYTES = 100_000;
export const MAX_SQL_CHARS = 10_000;
export const MAX_NAME_CHARS = 80;

export interface Experiment {
  version: typeof EXPERIMENT_VERSION;
  name: string;
  tables: SeedTable[];
  seed: number;
  sql: string;
}

export type ParseResult = { ok: true; experiment: Experiment } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

function parseColumn(v: unknown): ColumnDef | string {
  if (!isObj(v)) return 'Column is not an object.';
  const name = str(v.name, 200);
  if (name === null) return 'Column name is missing or too long.';
  if (!COLUMN_TYPES.includes(v.type as never)) return `Unknown column type for "${name}".`;
  if (!GENERATOR_KINDS.includes(v.generator as never)) return `Unknown generator for "${name}".`;
  const col: ColumnDef = { name, type: v.type as ColumnDef['type'], generator: v.generator as ColumnDef['generator'], primaryKey: v.primaryKey === true };
  if (v.distribution !== undefined) {
    if (!DISTRIBUTIONS.includes(v.distribution as never)) return `Unknown distribution for "${name}".`;
    col.distribution = v.distribution as ColumnDef['distribution'];
  }
  if (v.references !== undefined) {
    if (!isObj(v.references)) return `Bad reference for "${name}".`;
    const table = str(v.references.table, 200), column = str(v.references.column, 200);
    if (table === null || column === null) return `Bad reference for "${name}".`;
    col.references = { table, column };
  }
  return col;
}

/** Validates untrusted input and returns a normalized copy containing only known fields. */
export function parseExperiment(text: string): ParseResult {
  if (text.length > MAX_EXPERIMENT_BYTES) return { ok: false, error: 'Experiment is too large.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Not valid JSON.' }; }
  if (!isObj(raw)) return { ok: false, error: 'Experiment must be an object.' };
  if (raw.version !== EXPERIMENT_VERSION) return { ok: false, error: `Unsupported experiment version (expected ${EXPERIMENT_VERSION}).` };
  const name = str(raw.name, MAX_NAME_CHARS);
  if (name === null || name.trim() === '') return { ok: false, error: `Name is required (max ${MAX_NAME_CHARS} characters).` };
  const sql = str(raw.sql, MAX_SQL_CHARS);
  if (sql === null) return { ok: false, error: `SQL must be text of at most ${MAX_SQL_CHARS} characters.` };
  if (typeof raw.seed !== 'number' || !Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return { ok: false, error: 'Seed must be an integer from 0 to 4294967295.' };
  if (!Array.isArray(raw.tables) || raw.tables.length === 0 || raw.tables.length > MAX_TABLES) return { ok: false, error: `Provide 1–${MAX_TABLES} tables.` };

  const tables: SeedTable[] = [];
  for (const t of raw.tables) {
    if (!isObj(t) || !isObj(t.table) || !Array.isArray(t.table.columns) || t.table.columns.length > MAX_COLUMNS) return { ok: false, error: 'Malformed table entry.' };
    const tname = str(t.table.name, 200);
    if (tname === null || typeof t.rowCount !== 'number') return { ok: false, error: 'Malformed table entry.' };
    const columns: ColumnDef[] = [];
    for (const c of t.table.columns) {
      const col = parseColumn(c);
      if (typeof col === 'string') return { ok: false, error: col };
      columns.push(col);
    }
    const def: TableDef = { name: tname, columns };
    tables.push({ table: def, rowCount: clampRowCount(t.rowCount) });
  }
  const issues = validateSchema(tables.map((t) => t.table));
  if (issues.length) return { ok: false, error: issues[0]!.message };
  if (tables.reduce((n, t) => n + t.rowCount, 0) > MAX_TOTAL_ROWS) return { ok: false, error: `Total rows exceed ${MAX_TOTAL_ROWS.toLocaleString()}.` };
  return { ok: true, experiment: { version: EXPERIMENT_VERSION, name: name.trim(), tables, seed: raw.seed, sql } };
}

export function serializeExperiment(e: Experiment): string {
  return JSON.stringify(e, null, 2);
}

/** URL-safe base64 of the compact JSON; used in the `#exp=` link fragment (never sent to a server). */
export function encodeShare(e: Experiment): string {
  const bytes = new TextEncoder().encode(JSON.stringify(e));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeShare(code: string): ParseResult {
  try {
    const bin = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseExperiment(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: 'Share link is corrupted.' };
  }
}
