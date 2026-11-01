/** Deterministic synthetic data generation. Pure functions: same seed + index => same value. */
import type { ColumnDef, Distribution, TableDef } from './schema';

export const MIN_ROWS = 100;
export const MAX_ROWS = 10_000;
export const BATCH_SIZE = 500;
export const DEFAULT_SEED = 42;
/** Cap across all tables in one seeding run. */
export const MAX_TOTAL_ROWS = 30_000;

export interface SeedTable {
  table: TableDef;
  rowCount: number;
}

/** Row counts of already-seeded parent tables, by table name; foreign keys draw from 1..count. */
export type ParentCounts = Readonly<Record<string, number>>;

export type SqlValue = string | number | null;

/** mulberry32: tiny, fast, well-distributed 32-bit PRNG. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Edsger', 'Hedy', 'Tim'];
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Dijkstra', 'Lamarr', 'Berners'];
const WORDS = ['alpha', 'bravo', 'cobalt', 'delta', 'ember', 'falcon', 'garnet', 'harbor', 'ivory', 'juniper', 'kepler', 'lumen'];
const CITIES = ['Oslo', 'Lisbon', 'Kyoto', 'Austin', 'Nairobi', 'Lima', 'Tallinn', 'Hanoi', 'Cork', 'Perth'];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;
const hex = (rng: () => number, n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
const BASE_TIME = Date.UTC(2020, 0, 1);
const TIME_SPAN = 5 * 365 * 24 * 3600 * 1000;

/** Each cell gets its own RNG derived from (seed, row, column), so any row can be regenerated independently. */
export function cellRng(seed: number, rowIndex: number, columnIndex: number): () => number {
  return createRng((seed ^ Math.imul(rowIndex + 1, 0x9e3779b1) ^ Math.imul(columnIndex + 1, 0x85ebca6b)) >>> 0);
}

/** Pick an index in [0, n). Skewed cubes the uniform draw so low indices are far more common ("hot" values). */
export function pickIndex(rng: () => number, n: number, distribution: Distribution = 'uniform'): number {
  const u = rng();
  return Math.min(n - 1, Math.floor((distribution === 'skewed' ? u * u * u : u) * n));
}

export function generateValue(col: ColumnDef, rowIndex: number, rng: () => number, parents: ParentCounts = {}): SqlValue {
  const dist = col.distribution ?? 'uniform';
  switch (col.generator) {
    case 'sequence': return rowIndex + 1;
    case 'integer': return pickIndex(rng, 1000, dist) + 1;
    case 'decimal': return Math.round(rng() * 100000) / 100;
    case 'boolean': return rng() < 0.5 ? 0 : 1;
    case 'fullName': return `${pick(FIRST, rng)} ${pick(LAST, rng)}`;
    // The row-number suffix makes emails unique, so an index lookup returns exactly one row.
    case 'email': return `${pick(FIRST, rng).toLowerCase()}.${pick(LAST, rng).toLowerCase()}${rowIndex + 1}@example.com`;
    case 'word': return WORDS[pickIndex(rng, WORDS.length, dist)]!;
    case 'city': return CITIES[pickIndex(rng, CITIES.length, dist)]!;
    case 'uuid': return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-a${hex(rng, 3)}-${hex(rng, 12)}`;
    case 'isoDate': return new Date(BASE_TIME + Math.floor(rng() * TIME_SPAN)).toISOString();
    case 'foreignKey': {
      const n = col.references ? parents[col.references.table] : undefined;
      if (!n) throw new Error(`No seeded rows available for parent table "${col.references?.table}".`);
      return pickIndex(rng, n, dist) + 1; // parent keys are the sequence 1..n
    }
  }
}

export function generateRow(columns: readonly ColumnDef[], seed: number, rowIndex: number, parents: ParentCounts = {}): SqlValue[] {
  return columns.map((c, ci) => generateValue(c, rowIndex, cellRng(seed, rowIndex, ci), parents));
}

export function clampRowCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_ROWS;
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(n)));
}

/** Yields batches of rows; callers insert each batch inside one transaction. */
export function* generateBatches(def: TableDef, rowCount: number, seed: number, parents: ParentCounts = {}): Generator<SqlValue[][]> {
  const total = clampRowCount(rowCount);
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const end = Math.min(total, start + BATCH_SIZE);
    const batch: SqlValue[][] = [];
    for (let i = start; i < end; i++) batch.push(generateRow(def.columns, seed, i, parents));
    yield batch;
  }
}

/** Clamped per-table row counts, used both for seeding and as foreign-key parent ranges. */
export function clampedCounts(tables: readonly SeedTable[]): Record<string, number> {
  return Object.fromEntries(tables.map((t) => [t.table.name, clampRowCount(t.rowCount)]));
}

/** Per-table seed so identically-named columns in different tables don't produce correlated data. */
export function tableSeed(seed: number, tableName: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tableName.length; i++) h = Math.imul(h ^ tableName.charCodeAt(i), 0x01000193);
  return (seed ^ h) >>> 0;
}
