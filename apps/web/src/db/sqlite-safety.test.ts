/**
 * Hostile / careless input against the real SQLite core. The database is the user's own in-memory sandbox,
 * so the goals are: never crash the tab, never exceed resource budgets, never run something the UI said it
 * would not (EXPLAIN / benchmarks must not mutate), and always leave the session usable afterwards.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteCoreError, SqliteSession } from './sqlite-core';
import { DEFAULT_TABLE } from '../domain/schema';

const opts = { maxRows: 200, timeoutMs: 8_000 };
let s: SqliteSession;
const count = (table = 'users') => s.execute(`SELECT count(*) FROM ${table}`, opts).rows[0]![0];
const kindOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as SqliteCoreError).kind ?? 'not-core-error'; }
  return 'no-error';
};

beforeAll(async () => { s = new SqliteSession(await sqlite3InitModule()); });
afterAll(() => s.close());
beforeEach(() => {
  s.createSchema([DEFAULT_TABLE], true);
  s.seed({ tables: [{ table: DEFAULT_TABLE, rowCount: 500 }], seed: 1 }, () => {});
});

describe('typos, partial and misspelled SQL', () => {
  const typos = [
    'CRE', 'CREAT TABLE x(a)', 'CREATE TABEL x(a)', 'SELEC * FROM users', 'SELECT * FORM users',
    "SELECT * FROM users WHERE name = 'unterminated", 'DROP TABEL users', 'SELECT * FROM nope', 'SELECT nope FROM users',
    'INSERT INTO users VALUES', 'SELECT (', 'SELECT )', ';;;', 'WHERE 1=1', 'SELECT * FROM users GROUP BY',
  ];
  for (const sql of typos) {
    it(`reports a clear error for ${JSON.stringify(sql)} and stays usable`, () => {
      const run = () => s.execute(sql, opts);
      // `;;;` is legal (empty statements); everything else must be a structured SQL error.
      if (sql === ';;;') return expect(run).not.toThrow();
      try { run(); expect.unreachable(`${sql} should fail`); } catch (e) {
        expect(e).toBeInstanceOf(SqliteCoreError);
        expect((e as SqliteCoreError).kind).toBe('sql');
        expect((e as Error).message.length).toBeGreaterThan(3);
      }
      expect(count()).toBe(500);
    });
  }

  it('treats empty and whitespace-only input as a validation error, comment-only as a no-op', () => {
    expect(kindOf(() => s.execute('', opts))).toBe('validation');
    expect(kindOf(() => s.execute('   \n\t ', opts))).toBe('validation');
    expect(kindOf(() => s.explain('   '))).toBe('validation');
    expect(kindOf(() => s.execute('-- just a comment', opts))).toBe('no-error');
  });

  it('handles case, unicode and odd whitespace', () => {
    expect(s.execute('sElEcT\n\t1   AS x', opts).columns).toBeDefined();
    expect(s.execute("SELECT 'héllo ✓ 😀 日本語'", opts).rows).toEqual([['héllo ✓ 😀 日本語']]);
  });
});

describe('statements that must not run when only explaining or benchmarking', () => {
  it('EXPLAIN never executes the statement', () => {
    s.explain('DELETE FROM users');
    s.explain('DROP TABLE users');
    s.explain("INSERT INTO users (name) VALUES ('x')");
    expect(count()).toBe(500);
  });

  it('EXPLAIN does not execute trailing statements smuggled after a semicolon', () => {
    try { s.explain('SELECT 1; DROP TABLE users'); } catch { /* rejecting is fine too */ }
    expect(count()).toBe(500);
    try { s.explain('SELECT 1;\nDELETE FROM users;'); } catch { /* rejecting is fine too */ }
    expect(count()).toBe(500);
  });

  it('refuses to repeat writes, including writes hidden behind WITH', () => {
    const writes = [
      'DELETE FROM users', 'WITH x AS (SELECT 1) DELETE FROM users', 'WITH x AS (SELECT 1) UPDATE users SET name = 1',
      "WITH x AS (SELECT 1) INSERT INTO users (name) VALUES ('a')", 'SELECT 1; DELETE FROM users', 'DROP TABLE users',
      "SELECT 1 /* ; */ ; DELETE FROM users",
    ];
    for (const sql of writes) {
      expect(kindOf(() => s.execute(sql, { ...opts, repeat: 3 })), sql).toBe('validation');
      expect(kindOf(() => s.execute(sql, { ...opts, requireReadOnly: true })), sql).toBe('validation');
      expect(count(), sql).toBe(500);
    }
  });

  it('allows repeating genuine read-only queries', () => {
    expect(s.execute('WITH x AS (SELECT 1 AS a) SELECT a FROM x', { ...opts, repeat: 4 }).totalRows).toBe(1);
    expect(s.execute('SELECT * FROM users', { ...opts, requireReadOnly: true }).totalRows).toBe(500);
  });
});

describe('resource budgets cannot be lifted from SQL', () => {
  it('denies PRAGMAs that change memory or schema safety', () => {
    for (const sql of [
      'PRAGMA max_page_count = 2000000000', 'PRAGMA page_size = 65536', 'PRAGMA writable_schema = 1',
      'PRAGMA schema_version = 12345', 'PRAGMA soft_heap_limit = 0', 'PRAGMA mmap_size = 1000000000',
      'pragma MAX_PAGE_COUNT=2000000000', 'PRAGMA main.max_page_count = 2000000000',
    ]) expect(kindOf(() => s.execute(sql, opts)), sql).toBe('sql');
  });

  it('still allows harmless PRAGMAs', () => {
    expect(s.execute('PRAGMA table_info(users)', opts).totalRows).toBe(4);
    expect(() => s.execute('PRAGMA foreign_keys = ON', opts)).not.toThrow();
  });

  it('stops a table-filling loop at the database size budget and stays usable', () => {
    const fill = 'CREATE TABLE big (b BLOB); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 100000) INSERT INTO big SELECT zeroblob(10000) FROM c';
    const kind = kindOf(() => s.execute(fill, { ...opts, timeoutMs: 20_000 }));
    expect(['sql', 'timeout']).toContain(kind);
    const pages = Number(s.execute('PRAGMA page_count', opts).rows[0]![0]);
    expect(pages * 4096).toBeLessThanOrEqual(64 * 1024 * 1024); // page_size is locked, so 4 KiB pages
    s.execute('DROP TABLE IF EXISTS big', opts);
    expect(count()).toBe(500);
  });

  it('rejects giant single values instead of allocating them', () => {
    for (const sql of [
      'SELECT zeroblob(2000000000)', 'SELECT hex(zeroblob(100000000))', "SELECT replace(hex(zeroblob(4000000)), '0', 'abc')",
      "SELECT printf('%.*c', 1000000000, 'x')",
    ]) expect(kindOf(() => s.execute(sql, opts)), sql).toBe('sql');
  });

  it('rejects oversized and pathological SQL text without crashing', () => {
    expect(kindOf(() => s.execute(`SELECT '${'x'.repeat(1_200_000)}'`, opts))).toBe('sql');
    expect(kindOf(() => s.execute(`SELECT ${'('.repeat(6000)}1${')'.repeat(6000)}`, opts))).toBe('sql');
    expect(kindOf(() => s.execute(`SELECT ${Array.from({ length: 5000 }, (_, i) => i).join(',')}`, opts))).toBe('sql');
    expect(kindOf(() => s.execute(`SELECT 1 ${'UNION SELECT 1 '.repeat(600)}`, opts))).toBe('sql');
    expect(count()).toBe(500);
  });

  it('interrupts runaway work at the time budget (even with tiny budgets) and keeps the data', () => {
    const heavy = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c';
    expect(kindOf(() => s.execute(heavy, { maxRows: 10, timeoutMs: 1 }))).toBe('timeout');
    expect(kindOf(() => s.execute('SELECT count(*) FROM users a, users b, users c, users d, users e', { maxRows: 10, timeoutMs: 150 }))).toBe('timeout');
    expect(count()).toBe(500);
  });

  it('counts but does not materialize huge result sets', () => {
    const r = s.execute('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c LIMIT 300000) SELECT x FROM c', opts);
    expect(r.totalRows).toBe(300_000);
    expect(r.rows).toHaveLength(200);
    expect(r.truncated).toBe(true);
    expect(s.execute('SELECT * FROM users', { ...opts, maxRows: 0 })).toMatchObject({ rows: [], truncated: true, totalRows: 500 });
  });
});

describe('features that reach outside the sandbox', () => {
  it('blocks ATTACH / DETACH and extension loading', () => {
    for (const sql of ["ATTACH DATABASE ':memory:' AS x", "ATTACH DATABASE 'evil.db' AS x", "ATTACH 'file:/etc/passwd' AS x", "SELECT load_extension('x')", 'DETACH DATABASE main']) {
      expect(kindOf(() => s.execute(sql, opts)), sql).toBe('sql');
    }
  });

  it('cannot corrupt the schema table or read other tables through sqlite_master edits', () => {
    expect(kindOf(() => s.execute('DELETE FROM sqlite_master', opts))).toBe('sql');
    expect(kindOf(() => s.execute("UPDATE sqlite_master SET sql = 'x'", opts))).toBe('sql');
    expect(count()).toBe(500);
  });

  it('survives VACUUM INTO and other file-writing syntax without crashing', () => {
    expect(['sql', 'no-error']).toContain(kindOf(() => s.execute("VACUUM INTO 'copy.db'", opts)));
    expect(count()).toBe(500);
  });

  it('does not let a NUL byte truncate a statement into something else', () => {
    try { s.execute('SELECT 1\u0000; DROP TABLE users', opts); } catch { /* either outcome is acceptable */ }
    expect(count()).toBe(500);
  });
});

describe('result value handling', () => {
  it('renders blobs, big integers and long text safely', () => {
    expect(s.execute('SELECT zeroblob(10)', opts).rows).toEqual([['<BLOB 10 bytes>']]);
    expect(s.execute('SELECT 9223372036854775807', opts).rows).toEqual([['9223372036854775807']]);
    expect(s.execute('SELECT NULL', opts).rows).toEqual([[null]]);
    const long = String(s.execute("SELECT replace(hex(zeroblob(5000)), '0', 'x')", opts).rows[0]![0]);
    expect(long.length).toBeLessThan(2_100);
    expect(long).toMatch(/… \(\+\d+ chars\)$/);
  });

  it('keeps HTML-looking data as inert text', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    expect(s.execute(`SELECT '${payload}'`, opts).rows).toEqual([[payload]]);
  });
});

describe('seeding and schema misuse', () => {
  it('rolls back the whole seed when any table fails, leaving existing data untouched', () => {
    const ghost = { ...DEFAULT_TABLE, name: 'ghost' };
    const before = s.execute('SELECT group_concat(email) FROM (SELECT email FROM users ORDER BY id LIMIT 20)', opts).rows;
    expect(kindOf(() => s.seed({ tables: [{ table: DEFAULT_TABLE, rowCount: 1_000 }, { table: ghost, rowCount: 100 }], seed: 9 }, () => {}))).toBe('sql');
    expect(count()).toBe(500);
    expect(s.execute('SELECT group_concat(email) FROM (SELECT email FROM users ORDER BY id LIMIT 20)', opts).rows).toEqual(before);
  });

  it('rejects hostile identifiers before any SQL runs', () => {
    const evil = (name: string) => ({ ...DEFAULT_TABLE, name });
    for (const name of ['users"; DROP TABLE users; --', 'a b', '', '1abc', 'sqlite_master', 'SQLITE_x', 'x\u0000y', 'ünï', 'a;b', "o'brien"]) {
      expect(kindOf(() => s.createSchema([evil(name)], true)), name).toBe('validation');
      expect(kindOf(() => s.seed({ tables: [{ table: evil(name), rowCount: 100 }], seed: 1 }, () => {})), name).toBe('validation');
    }
    expect(count()).toBe(500);
  });

  it('rejects hostile foreign-key targets and column names', () => {
    const badCol = { ...DEFAULT_TABLE, name: 't2', columns: [{ name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true }, { name: 'p', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: 'users"); DROP TABLE users; --', column: 'id' } }] } as const;
    expect(kindOf(() => s.createSchema([DEFAULT_TABLE, badCol as never], true))).toBe('validation');
    const badName = { ...DEFAULT_TABLE, name: 't3', columns: [{ name: 'x"y', type: 'TEXT', generator: 'word', primaryKey: false }] } as const;
    expect(kindOf(() => s.createSchema([badName as never], true))).toBe('validation');
  });

  it('refuses to create a table that already exists unless replacing', () => {
    expect(kindOf(() => s.createSchema([DEFAULT_TABLE], false))).toBe('sql');
    expect(count()).toBe(500);
  });

  it('tolerates nonsense counts and seeds by clamping rather than failing', () => {
    for (const rowCount of [NaN, -5, 0, Infinity, 1.7]) {
      expect(() => s.seed({ tables: [{ table: DEFAULT_TABLE, rowCount }], seed: 1 }, () => {})).not.toThrow();
      const n = Number(count());
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(10_000);
    }
    for (const seed of [0, -1, NaN, 2 ** 32 + 5, 1.5]) {
      expect(() => s.seed({ tables: [{ table: DEFAULT_TABLE, rowCount: 100 }], seed }, () => {})).not.toThrow();
    }
  });

  it('enforces the cross-table row cap and the table limit', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ table: { ...DEFAULT_TABLE, name: `t${i}` }, rowCount: 100 }));
    expect(kindOf(() => s.seed({ tables: many, seed: 1 }, () => {}))).toBe('validation');
    expect(kindOf(() => s.createSchema(many.map((m) => m.table), true))).toBe('validation');
  });

  it('keeps the session healthy after every failure above', () => {
    expect(s.execute('SELECT 1', opts).rows).toEqual([[1]]);
    expect(s.introspect().tables.map((t) => t.name)).toContain('users');
  });
});
