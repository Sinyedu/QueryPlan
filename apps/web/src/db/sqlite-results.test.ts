/** User-chosen row limits: bounded, honest about truncation, and cheap even when the result is huge. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteSession } from './sqlite-core';
import {
  DEFAULT_ROW_LIMIT, MAX_RESULT_BYTES, MAX_ROW_LIMIT, MIN_ROW_LIMIT, ROW_LIMIT_PRESETS, clampRowLimit, estimateRowBytes,
} from '../domain/results';

let s: SqliteSession;
beforeAll(async () => { s = new SqliteSession(await sqlite3InitModule()); });
afterAll(() => s.close());

const series = (n: number, expr = 'x') => `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < ${n}) SELECT ${expr} FROM c`;
const run = (sql: string, maxRows: number) => s.execute(sql, { maxRows, timeoutMs: 20_000 });

describe('clampRowLimit', () => {
  it('keeps valid values and bounds everything else', () => {
    expect(clampRowLimit(1)).toBe(MIN_ROW_LIMIT);
    expect(clampRowLimit(750)).toBe(750);
    expect(clampRowLimit(MAX_ROW_LIMIT)).toBe(MAX_ROW_LIMIT);
    expect(clampRowLimit(0)).toBe(MIN_ROW_LIMIT);
    expect(clampRowLimit(-40)).toBe(MIN_ROW_LIMIT);
    expect(clampRowLimit(10 ** 9)).toBe(MAX_ROW_LIMIT);
    expect(clampRowLimit(Infinity)).toBe(DEFAULT_ROW_LIMIT);
    expect(clampRowLimit(NaN)).toBe(DEFAULT_ROW_LIMIT);
    expect(clampRowLimit('500')).toBe(DEFAULT_ROW_LIMIT);
    expect(clampRowLimit(null)).toBe(DEFAULT_ROW_LIMIT);
    expect(clampRowLimit(12.6)).toBe(13);
  });
  it('offers presets that are all valid', () => {
    for (const p of ROW_LIMIT_PRESETS) expect(clampRowLimit(p)).toBe(p);
    expect(Math.max(...ROW_LIMIT_PRESETS)).toBe(MAX_ROW_LIMIT);
  });
  it('estimates row size from text length', () => {
    expect(estimateRowBytes([null, 1, 'abc'])).toBe(8 + 8 + 11);
  });
});

describe('row limit in the engine', () => {
  it('returns exactly the requested rows and still counts the rest', () => {
    for (const limit of [1, 50, 200, 1_000]) {
      const r = run(series(1_500), limit);
      expect(r.rows).toHaveLength(limit);
      expect(r.totalRows).toBe(1_500);
      expect(r.truncated).toBe(true);
      expect(r.byteLimited).toBe(false);
    }
  });

  it('can return 5,000 rows and reports them in order', () => {
    const r = run(series(6_000), 5_000);
    expect(r.rows).toHaveLength(5_000);
    expect(r.rows[0]).toEqual([1]);
    expect(r.rows[4_999]).toEqual([5_000]);
    expect(r.totalRows).toBe(6_000);
    expect(r.truncated).toBe(true);
  });

  it('never exceeds the 5,000-row ceiling even if asked for more', () => {
    for (const asked of [5_001, 100_000, 10 ** 9, Infinity]) {
      expect(run(series(6_000), asked).rows.length).toBeLessThanOrEqual(MAX_ROW_LIMIT);
    }
    expect(run(series(10), NaN).rows).toHaveLength(0);
    expect(run(series(10), -5).rows).toHaveLength(0);
    expect(run(series(10), 2.9).rows).toHaveLength(2);
  });

  it('is not truncated when everything fits', () => {
    const r = run(series(300), 5_000);
    expect(r).toMatchObject({ totalRows: 300, truncated: false, byteLimited: false });
    expect(r.rows).toHaveLength(300);
  });

  it('applies a byte budget to wide results regardless of the row limit', () => {
    const wide = series(5_000, "replace(hex(zeroblob(1000)), '0', 'x') AS big"); // 2,000-char cells
    const r = run(wide, 5_000);
    expect(r.byteLimited).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.totalRows).toBe(5_000);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.length).toBeLessThan(5_000);
    const bytes = r.rows.reduce((n, row) => n + estimateRowBytes(row), 0);
    expect(bytes).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  });

  it('keeps a large display limit cheap to compute', () => {
    const start = performance.now();
    run(series(20_000), 5_000);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
