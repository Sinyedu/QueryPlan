/** Deterministic synthetic data generation. Pure functions: same seed + index => same value. */
import type { ColumnDef, GeneratorKind, TableDef } from './schema';

export const MIN_ROWS = 100;
export const MAX_ROWS = 10_000;
export const BATCH_SIZE = 500;
export const DEFAULT_SEED = 42;

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

export function generateValue(kind: GeneratorKind, rowIndex: number, rng: () => number): SqlValue {
  switch (kind) {
    case 'sequence': return rowIndex + 1;
    case 'integer': return Math.floor(rng() * 1000) + 1;
    case 'decimal': return Math.round(rng() * 100000) / 100;
    case 'boolean': return rng() < 0.5 ? 0 : 1;
    case 'fullName': return `${pick(FIRST, rng)} ${pick(LAST, rng)}`;
    // The row-number suffix makes emails unique, so an index lookup returns exactly one row.
    case 'email': return `${pick(FIRST, rng).toLowerCase()}.${pick(LAST, rng).toLowerCase()}${rowIndex + 1}@example.com`;
    case 'word': return pick(WORDS, rng);
    case 'city': return pick(CITIES, rng);
    case 'uuid': return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-a${hex(rng, 3)}-${hex(rng, 12)}`;
    case 'isoDate': return new Date(BASE_TIME + Math.floor(rng() * TIME_SPAN)).toISOString();
  }
}

export function generateRow(columns: readonly ColumnDef[], seed: number, rowIndex: number): SqlValue[] {
  return columns.map((c, ci) => generateValue(c.generator, rowIndex, cellRng(seed, rowIndex, ci)));
}

export function clampRowCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_ROWS;
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(n)));
}

/** Yields batches of rows; callers insert each batch inside one transaction. */
export function* generateBatches(def: TableDef, rowCount: number, seed: number): Generator<SqlValue[][]> {
  const total = clampRowCount(rowCount);
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const end = Math.min(total, start + BATCH_SIZE);
    const batch: SqlValue[][] = [];
    for (let i = start; i < end; i++) batch.push(generateRow(def.columns, seed, i));
    yield batch;
  }
}
