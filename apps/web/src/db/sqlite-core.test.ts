/** Integration test: real SQLite (WASM, Node build) through the same core the browser worker uses. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteCoreError, SqliteSession } from './sqlite-core';
import { DEFAULT_TABLE, buildCreateIndex } from '../domain/schema';
import { generateRow } from '../domain/seeding';
import { parsePlan } from '../domain/explain';

const opts = { maxRows: 200, timeoutMs: 5_000 };
let s: SqliteSession;

beforeAll(async () => {
  s = new SqliteSession(await sqlite3InitModule());
});
afterAll(() => s.close());

describe('SQLite journey', () => {
  it('create -> seed (with progress) -> select', () => {
    s.createTable(DEFAULT_TABLE, false);
    const progress: number[] = [];
    const res = s.seed({ table: DEFAULT_TABLE, rowCount: 2_000, seed: 42 }, (d) => progress.push(d));
    expect(res.rowsInserted).toBe(2_000);
    expect(progress).toEqual([500, 1000, 1500, 2000]);

    const out = s.execute('SELECT * FROM users', opts);
    expect(out.totalRows).toBe(2_000);
    expect(out.rows).toHaveLength(200);
    expect(out.truncated).toBe(true);
    expect(out.columns).toEqual(['id', 'name', 'email', 'created_at']);
  });

  it('re-seeding is deterministic and replaces rows', () => {
    const before = s.execute('SELECT * FROM users WHERE id = 10', opts).rows;
    s.seed({ table: DEFAULT_TABLE, rowCount: 500, seed: 42 }, () => {});
    expect(s.execute('SELECT count(*) FROM users', opts).rows[0]![0]).toBe(500);
    expect(s.execute('SELECT * FROM users WHERE id = 10', opts).rows).toEqual(before);
  });

  it('shows a scan, then an index search after CREATE INDEX', () => {
    s.seed({ table: DEFAULT_TABLE, rowCount: 5_000, seed: 42 }, () => {});
    const email = generateRow(DEFAULT_TABLE.columns, 42, 4_242)[2] as string;
    const sql = `SELECT * FROM users WHERE email = '${email}'`;

    const scan = parsePlan(s.explain(sql).rows);
    expect(scan[0]!.detail).toMatch(/^SCAN users/);

    s.execute(buildCreateIndex('users', 'email'), opts);
    const search = parsePlan(s.explain(sql).rows);
    expect(search[0]!.detail).toMatch(/^SEARCH users USING INDEX idx_users_email/);
    expect(s.execute(sql, opts).totalRows).toBe(1);

    const info = s.introspect().tables[0]!;
    expect(info.rowCount).toBe(5_000);
    expect(info.indexes).toEqual([{ name: 'idx_users_email', unique: false, columns: ['email'] }]);
  });

  it('repeats read-only statements for benchmarking but not writes', () => {
    const r = s.execute('SELECT * FROM users', { ...opts, repeat: 3 });
    expect(r.totalRows).toBe(5_000);
    expect(() => s.execute('DELETE FROM users', { ...opts, repeat: 2 })).toThrow(/Only a single SELECT/);
    expect(s.execute('SELECT count(*) FROM users', opts).rows[0]![0]).toBe(5_000);
  });

  it('surfaces SQL errors without breaking the session', () => {
    expect(() => s.execute('SELEC 1', opts)).toThrow(SqliteCoreError);
    expect(s.execute('SELECT 1', opts).rows).toEqual([[1]]);
  });

  it('rejects EXPLAIN inside explain and invalid tables', () => {
    expect(() => s.explain('EXPLAIN SELECT 1')).toThrow(/Remove EXPLAIN/);
    expect(() => s.createTable({ name: 'bad name', columns: [] }, false)).toThrow(SqliteCoreError);
  });

  it('aborts runaway queries at the time budget and keeps the database', () => {
    const runaway = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c';
    try {
      s.execute(runaway, { maxRows: 10, timeoutMs: 200 });
      expect.unreachable();
    } catch (e) {
      expect((e as SqliteCoreError).kind).toBe('timeout');
    }
    expect(s.execute('SELECT count(*) FROM users', opts).rows[0]![0]).toBe(5_000);
  });
});
