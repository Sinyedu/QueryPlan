/** Integration test: real SQLite (WASM, Node build) through the same core the browser worker uses. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteCoreError, SqliteSession } from './sqlite-core';
import { DEFAULT_TABLE, buildCreateIndex, type TableDef } from '../domain/schema';
import { generateRow, tableSeed } from '../domain/seeding';
import { parsePlan } from '../domain/explain';

const opts = { maxRows: 200, timeoutMs: 5_000 };
const users = (rowCount: number) => ({ table: DEFAULT_TABLE, rowCount });
let s: SqliteSession;

beforeAll(async () => {
  s = new SqliteSession(await sqlite3InitModule());
});
afterAll(() => s.close());

describe('SQLite journey', () => {
  it('create -> seed (with progress) -> select', () => {
    s.createSchema([DEFAULT_TABLE], false);
    const progress: number[] = [];
    const res = s.seed({ tables: [users(2_000)], seed: 42 }, (d) => progress.push(d));
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
    s.seed({ tables: [users(500)], seed: 42 }, () => {});
    expect(s.execute('SELECT count(*) FROM users', opts).rows[0]![0]).toBe(500);
    expect(s.execute('SELECT * FROM users WHERE id = 10', opts).rows).toEqual(before);
  });

  it('shows a scan, then an index search after CREATE INDEX', () => {
    s.seed({ tables: [users(5_000)], seed: 42 }, () => {});
    const email = generateRow(DEFAULT_TABLE.columns, tableSeed(42, 'users'), 4_242)[2] as string;
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
    expect(() => s.createSchema([{ name: 'bad name', columns: [] }], false)).toThrow(SqliteCoreError);
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

describe('multiple tables and foreign keys', () => {
  const orders: TableDef = {
    name: 'orders',
    columns: [
      { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true },
      { name: 'user_id', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: 'users', column: 'id' }, distribution: 'skewed' },
      { name: 'status', type: 'TEXT', generator: 'word', primaryKey: false, distribution: 'skewed' },
    ],
  };
  // Deliberately child-first to prove ordering is derived from the foreign keys, not list order.
  const both = [{ table: orders, rowCount: 3_000 }, users(500)];
  let s2: SqliteSession;

  beforeAll(async () => {
    s2 = new SqliteSession(await sqlite3InitModule());
    s2.createSchema([orders, DEFAULT_TABLE], false);
  });
  afterAll(() => s2.close());

  it('creates parents first and seeds all tables consistently', () => {
    const res = s2.seed({ tables: both, seed: 7 }, () => {});
    expect(res.perTable).toEqual({ orders: 3_000, users: 500 });
    expect(s2.execute('SELECT count(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL', opts).rows[0]![0]).toBe(0);
    expect(s2.introspect().tables.find((t) => t.name === 'orders')!.foreignKeys).toEqual([{ from: 'user_id', table: 'users', to: 'id' }]);
  });

  it('actually enforces foreign keys', () => {
    expect(() => s2.execute("INSERT INTO orders (user_id, status) VALUES (99999, 'x')", opts)).toThrow(/FOREIGN KEY/i);
  });

  it('skewed distributions concentrate on low values', () => {
    const top = s2.execute('SELECT count(*) FROM orders WHERE user_id <= 50', opts).rows[0]![0] as number;
    expect(top / 3_000).toBeGreaterThan(0.3); // uniform would be ~10%
  });

  it('is reproducible, and a different seed changes the data', () => {
    const q = 'SELECT group_concat(user_id) FROM (SELECT user_id FROM orders ORDER BY id LIMIT 50)';
    const a = s2.execute(q, opts).rows;
    s2.seed({ tables: both, seed: 7 }, () => {});
    expect(s2.execute(q, opts).rows).toEqual(a);
    s2.seed({ tables: both, seed: 8 }, () => {});
    expect(s2.execute(q, opts).rows).not.toEqual(a);
  });

  it('re-creates tables that already hold related rows, and enforces row caps', () => {
    s2.seed({ tables: both, seed: 7 }, () => {});
    s2.createSchema([orders, DEFAULT_TABLE], true);
    expect(s2.execute('SELECT count(*) FROM orders', opts).rows[0]![0]).toBe(0);
    const extra = (name: string) => ({ table: { ...DEFAULT_TABLE, name }, rowCount: 10_000 });
    const big = [{ table: orders, rowCount: 10_000 }, users(10_000), extra('u2'), extra('u3')];
    expect(() => s2.seed({ tables: big, seed: 1 }, () => {})).toThrow(/rows across all tables/);
  });

  it('plans a join differently once the foreign-key column is indexed', () => {
    s2.seed({ tables: both, seed: 7 }, () => {});
    const sql = 'SELECT u.name, o.status FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = 5';
    const before = parsePlan(s2.explain(sql).rows).map((n) => n.detail).join(' | ');
    s2.execute(buildCreateIndex('orders', 'user_id'), opts);
    const after = parsePlan(s2.explain(sql).rows).map((n) => n.detail).join(' | ');
    expect(before).not.toMatch(/idx_orders_user_id/);
    expect(after).toMatch(/idx_orders_user_id/);
  });
});
