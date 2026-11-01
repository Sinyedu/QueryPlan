/** Edge cases, misuse and fuzzing for the pure domain layer. Complements domain.test.ts (happy paths). */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE, MAX_COLUMNS, MAX_IDENTIFIER_LENGTH, MAX_TABLES, buildCreateIndex, buildCreateTable, buildInsert, indexName,
  quoteIdentifier, validateIdentifier, validateSchema, validateTable, type ColumnDef, type TableDef,
} from './schema';
import {
  BATCH_SIZE, MAX_ROWS, MIN_ROWS, cellRng, clampRowCount, createRng, generateBatches, generateRow, generateValue, pickIndex, tableSeed,
} from './seeding';
import { classifyDetail, describeNode, flattenPlan, isExplainable, parsePlan, planInsights, planSummary, type RawPlanRow } from './explain';
import { formatMs, isBenchmarkable, repsFor, summarizeTimes } from './benchmark';
import { decodeShare, encodeShare, parseExperiment, type Experiment } from './experiment';
import { GENERATOR_KINDS } from './schema';

const pk: ColumnDef = { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true };
const table = (name: string, columns: ColumnDef[] = [pk]): TableDef => ({ name, columns });

describe('identifier validation (fuzz + boundaries)', () => {
  const rejected = [
    '', ' ', 'a b', 'a-b', 'a.b', 'a;b', "a'b", 'a"b', 'a`b', '[a]', 'a\nb', 'a\tb', 'a\u0000b', 'a​b', 'ａｂｃ', 'é', 'tábla', '日本', '😀',
    '1abc', '9', '-a', 'a--b', 'a/*b*/', '"; DROP TABLE x; --', 'sqlite_master', 'SQLITE_SEQUENCE', 'Sqlite_x', 'sqlite_', 'x'.repeat(MAX_IDENTIFIER_LENGTH + 1),
  ];
  for (const name of rejected) {
    it(`rejects ${JSON.stringify(name.length > 20 ? `${name.slice(0, 12)}…(${name.length})` : name)}`, () => {
      expect(validateIdentifier(name)).not.toBeNull();
      expect(() => quoteIdentifier(name)).toThrow();
    });
  }
  it('accepts boundary lengths and SQL keywords, always quoted', () => {
    expect(validateIdentifier('x'.repeat(MAX_IDENTIFIER_LENGTH))).toBeNull();
    for (const kw of ['select', 'TABLE', 'order', 'null', 'group', 'index']) {
      expect(validateIdentifier(kw)).toBeNull();
      expect(quoteIdentifier(kw)).toBe(`"${kw}"`);
    }
  });
  it('never lets a quoted identifier contain anything but word characters (2,000 random strings)', () => {
    const rng = createRng(12345);
    const alphabet = 'abcXYZ019_ "\'`;-/*\\\n\u0000é日😀.()[]=,';
    for (let i = 0; i < 2000; i++) {
      const name = Array.from({ length: Math.floor(rng() * 12) }, () => alphabet[Math.floor(rng() * alphabet.length)]).join('');
      if (validateIdentifier(name) === null) expect(quoteIdentifier(name)).toMatch(/^"[A-Za-z_][A-Za-z0-9_]*"$/);
      else expect(() => quoteIdentifier(name)).toThrow();
    }
  });
});

describe('schema validation edge cases', () => {
  const issues = (t: TableDef) => validateTable(t).map((i) => i.message).join(' | ');
  it('catches structural mistakes', () => {
    expect(issues(table('t', []))).toMatch(/at least one column/);
    expect(issues(table('t', Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => ({ ...pk, name: `c${i}`, primaryKey: false }))))).toMatch(/At most/);
    expect(issues(table('t', [pk, { ...pk, name: 'ID', primaryKey: false }]))).toMatch(/Duplicate/);
    expect(issues(table('t', [pk, { ...pk, name: 'id2' }]))).toMatch(/Only one primary key/);
    expect(issues(table('t', [{ name: 'a', type: 'TEXT', generator: 'word', primaryKey: true }]))).toMatch(/INTEGER column can be the primary key/);
    expect(issues(table('t', [{ name: 'a', type: 'TEXT', generator: 'email' }] as never))).toBe('');
  });
  it('rejects generator/type mismatches and bogus enum values instead of throwing', () => {
    expect(issues(table('t', [{ name: 'a', type: 'TEXT', generator: 'sequence', primaryKey: false }]))).toMatch(/cannot fill/);
    expect(issues(table('t', [{ name: 'a', type: 'TEXT', generator: '__proto__' as never, primaryKey: false }]))).toMatch(/cannot fill/);
    expect(issues(table('t', [{ name: 'a', type: 'BLOB' as never, generator: 'word', primaryKey: false }]))).toMatch(/cannot fill/);
    expect(issues(table('t', [{ name: 'a', type: 'TEXT', generator: 'word', primaryKey: false, distribution: 'gaussian' as never }]))).toMatch(/distribution/);
  });
  it('validates foreign keys across tables', () => {
    const fk = (t: string, c = 'id'): ColumnDef => ({ name: 'p', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: t, column: c } });
    const parent = table('parent');
    const msg = (ts: TableDef[]) => validateSchema(ts).map((i) => i.message).join(' | ');
    expect(msg([parent, table('c', [pk, fk('parent')])])).toBe('');
    expect(msg([parent, table('c', [pk, fk('missing')])])).toMatch(/must be another table/);
    expect(msg([parent, table('c', [pk, fk('parent', 'nope')])])).toMatch(/must be another table/);
    expect(msg([table('c', [pk, fk('c')])])).toMatch(/must be another table/); // self reference
    expect(msg([table('parent', [{ ...pk, generator: 'integer' }]), table('c', [pk, fk('parent')])])).toMatch(/must be another table/);
    expect(msg([parent, table('c', [pk, { ...fk('parent'), references: undefined }])])).toMatch(/Choose the parent/);
    expect(msg([parent, table('c', [pk, { name: 'p', type: 'TEXT', generator: 'foreignKey', primaryKey: false, references: { table: 'parent', column: 'id' } }])])).toMatch(/cannot fill/);
    expect(msg([parent, table('c', [pk, { name: 'p', type: 'INTEGER', generator: 'word' as never, primaryKey: false, references: { table: 'parent', column: 'id' } }])])).toMatch(/Only the foreignKey generator/);
  });
  it('enforces table-count limits and handles three-table cycles', () => {
    expect(validateSchema([]).map((i) => i.message).join()).toMatch(/at least one table/);
    expect(validateSchema(Array.from({ length: MAX_TABLES + 1 }, (_, i) => table(`t${i}`))).map((i) => i.message).join()).toMatch(/At most/);
    const fk = (t: string): ColumnDef => ({ name: 'p', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: t, column: 'id' } });
    expect(validateSchema([table('a', [pk, fk('c')]), table('b', [pk, fk('a')]), table('c', [pk, fk('b')])]).map((i) => i.message).join()).toMatch(/cycle/);
  });
});

describe('DDL builders never emit unquoted or unvalidated names', () => {
  it('refuses invalid tables and index targets', () => {
    expect(() => buildCreateTable(table('x"; DROP TABLE y; --'))).toThrow();
    expect(() => buildCreateTable(table('t', [{ ...pk, name: 'a b' }]))).toThrow();
    expect(() => buildCreateIndex('t', 'bad name')).toThrow();
    expect(() => buildCreateIndex('bad table', 'c')).toThrow();
    expect(() => buildCreateIndex('t', ['ok', 'no"pe'])).toThrow();
    const evilRef: ColumnDef = { name: 'p', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: 'x") --', column: 'id' } };
    expect(() => buildCreateTable(table('t', [pk, evilRef]))).toThrow();
  });
  it('keeps generated index names valid even when the inputs are long', () => {
    const name = indexName('t'.repeat(60), ['c'.repeat(60), 'd'.repeat(60)]);
    expect(name.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    expect(validateIdentifier(name)).toBeNull();
  });
  it('emits exactly one placeholder per column', () => {
    expect(buildInsert(DEFAULT_TABLE).match(/\?/g)).toHaveLength(DEFAULT_TABLE.columns.length);
  });
});

describe('seeding edge cases', () => {
  it('clamps absurd row counts', () => {
    for (const n of [NaN, -1, 0, 5, Infinity, -Infinity, 1e12, 99.6]) {
      const c = clampRowCount(n);
      expect(c).toBeGreaterThanOrEqual(MIN_ROWS);
      expect(c).toBeLessThanOrEqual(MAX_ROWS);
      expect(Number.isInteger(c)).toBe(true);
    }
    expect(clampRowCount(MAX_ROWS)).toBe(MAX_ROWS);
    expect(clampRowCount('250' as never)).toBe(MIN_ROWS); // strings are not coerced; anything non-numeric falls back to the minimum
  });
  it('produces batch sizes that sum exactly to the count at every boundary', () => {
    for (const n of [MIN_ROWS, BATCH_SIZE - 1, BATCH_SIZE, BATCH_SIZE + 1, 1001, MAX_ROWS]) {
      const sizes = [...generateBatches(DEFAULT_TABLE, n, 1)].map((b) => b.length);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(BATCH_SIZE);
    }
  });
  it('gives the same rows however they are batched', () => {
    const batched = [...generateBatches(DEFAULT_TABLE, 1200, 5)].flat();
    const direct = Array.from({ length: 1200 }, (_, i) => generateRow(DEFAULT_TABLE.columns, 5, i));
    expect(batched).toEqual(direct);
  });
  it('pickIndex always stays inside [0, n)', () => {
    const rng = createRng(9);
    for (const n of [1, 2, 3, 12, 1000, 10_000]) {
      for (const d of ['uniform', 'skewed'] as const) {
        for (let i = 0; i < 2000; i++) {
          const v = pickIndex(rng, n, d);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(n);
        }
      }
    }
    expect(pickIndex(() => 0.9999999999, 10)).toBe(9);
    expect(pickIndex(() => 1, 10)).toBe(9); // even a misbehaving rng cannot escape the range
  });
  it('rng output stays in [0,1) for extreme seeds', () => {
    for (const seed of [0, 1, 2 ** 31, 2 ** 32 - 1, -1, NaN, Infinity, 1.5]) {
      const r = createRng(seed);
      for (let i = 0; i < 200; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
  it('generates well-typed, well-formed values for every generator', () => {
    const parents = { parent: 50 };
    for (const kind of GENERATOR_KINDS) {
      const col: ColumnDef = { name: 'c', type: 'TEXT', generator: kind, primaryKey: false, references: kind === 'foreignKey' ? { table: 'parent', column: 'id' } : undefined };
      for (let i = 0; i < 300; i++) {
        const v = generateValue(col, i, cellRng(3, i, 0), parents);
        expect(v).not.toBeUndefined();
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
        if (kind === 'email') expect(v).toMatch(/^[a-z]+\.[a-z]+\d+@example\.com$/);
        if (kind === 'uuid') expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
        if (kind === 'boolean') expect([0, 1]).toContain(v);
        if (kind === 'integer') expect(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1000).toBe(true);
        if (kind === 'foreignKey') expect(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50).toBe(true);
        if (kind === 'isoDate') {
          const t = Date.parse(v as string);
          expect(t).toBeGreaterThanOrEqual(Date.UTC(2020, 0, 1));
          expect(t).toBeLessThanOrEqual(Date.UTC(2025, 0, 1));
        }
      }
    }
  });
  it('fails loudly (not silently) when a foreign key has no parent rows', () => {
    const col: ColumnDef = { name: 'p', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: 'x', column: 'id' } };
    expect(() => generateValue(col, 0, () => 0.5, {})).toThrow(/No seeded rows/);
    expect(() => generateValue(col, 0, () => 0.5, { x: 0 })).toThrow(/No seeded rows/);
    expect(() => generateValue({ ...col, references: undefined }, 0, () => 0.5, {})).toThrow();
  });
  it('derives stable, distinct per-table seeds', () => {
    expect(tableSeed(42, 'users')).toBe(tableSeed(42, 'users'));
    expect(tableSeed(42, 'users')).not.toBe(tableSeed(42, 'orders'));
    expect(tableSeed(1, 'users')).not.toBe(tableSeed(2, 'users'));
    expect(tableSeed(NaN, 'x')).toBeGreaterThanOrEqual(0);
  });
});

describe('experiment import/share (adversarial)', () => {
  const base = { version: 1, name: 'x', seed: 1, sql: 'SELECT 1', tables: [{ rowCount: 100, table: DEFAULT_TABLE }] };
  const ok = (o: unknown) => parseExperiment(JSON.stringify(o));
  const err = (o: unknown) => { const r = ok(o); return r.ok ? 'OK' : r.error; };

  it('rejects wrong top-level shapes without throwing', () => {
    for (const text of ['null', '[]', '"str"', '42', 'true', '{}', '[[[[[', '{"a":', '', ' ', '\u0000', 'undefined', 'NaN', '{"version":1}']) {
      expect(parseExperiment(text).ok, JSON.stringify(text)).toBe(false);
    }
  });
  it('survives absurdly deep nesting', () => {
    expect(parseExperiment('['.repeat(90_000)).ok).toBe(false);
    expect(parseExperiment(`{"version":1,"name":"x","seed":1,"sql":"","tables":${'['.repeat(50_000)}`).ok).toBe(false);
  });
  it('rejects bad field types and ranges', () => {
    expect(err({ ...base, seed: '1' })).toMatch(/Seed/);
    expect(err({ ...base, seed: 2 ** 32 })).toMatch(/Seed/);
    expect(err({ ...base, seed: null })).toMatch(/Seed/);
    expect(err({ ...base, name: 5 })).toMatch(/Name/);
    expect(err({ ...base, name: '   ' })).toMatch(/Name/);
    expect(err({ ...base, name: 'n'.repeat(81) })).toMatch(/Name/);
    expect(err({ ...base, sql: null })).toMatch(/SQL/);
    expect(err({ ...base, tables: 'x' })).toMatch(/1–6 tables/);
    expect(err({ ...base, tables: Array.from({ length: 7 }, (_, i) => ({ rowCount: 100, table: table(`t${i}`) })) })).toMatch(/1–6 tables/);
    expect(err({ ...base, tables: [{ rowCount: '100', table: DEFAULT_TABLE }] })).toMatch(/Malformed/);
    expect(err({ ...base, tables: [{ table: DEFAULT_TABLE }] })).toMatch(/Malformed/);
    expect(err({ ...base, tables: [null] })).toMatch(/Malformed/);
    expect(err({ ...base, tables: [{ rowCount: 100, table: { name: 't', columns: 'x' } }] })).toMatch(/Malformed/);
    expect(err({ ...base, tables: [{ rowCount: 100, table: { name: 't', columns: Array.from({ length: 13 }, (_, i) => ({ ...pk, name: `c${i}`, primaryKey: false })) } }] })).toMatch(/Malformed/);
  });
  it('rejects unknown enums and hostile names inside columns', () => {
    const col = (c: object) => ({ ...base, tables: [{ rowCount: 100, table: { name: 't', columns: [c] } }] });
    expect(err(col({ name: 'a', type: 'BLOB', generator: 'word' }))).toMatch(/Unknown column type/);
    expect(err(col({ name: 'a', type: 'TEXT', generator: 'constructor' }))).toMatch(/Unknown generator/);
    expect(err(col({ name: 'a', type: 'TEXT', generator: 'word', distribution: 'x' }))).toMatch(/Unknown distribution/);
    expect(err(col({ name: 'a', type: 'TEXT', generator: 'word', references: 'x' }))).toMatch(/Bad reference/);
    expect(err(col({ name: 'a"; DROP TABLE t; --', type: 'TEXT', generator: 'word' }))).not.toBe('OK');
    expect(err(col({ name: 'a'.repeat(500), type: 'TEXT', generator: 'word' }))).not.toBe('OK');
    expect(err(col({ name: 5, type: 'TEXT', generator: 'word' }))).toMatch(/Column name/);
  });
  it('is not vulnerable to prototype pollution', () => {
    const text = '{"__proto__":{"polluted":true},"version":1,"name":"x","seed":1,"sql":"","tables":[{"rowCount":100,"__proto__":{"polluted":true},"table":{"name":"t","columns":[{"name":"id","type":"INTEGER","generator":"sequence","primaryKey":true,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}]}}]}';
    const r = parseExperiment(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(r.experiment)).toEqual(['version', 'name', 'tables', 'seed', 'sql']);
    expect(Object.keys(r.experiment.tables[0]!.table.columns[0]!).sort()).toEqual(['generator', 'name', 'primaryKey', 'type']);
  });
  it('keeps HTML/script text verbatim (rendering escapes it) and never evaluates it', () => {
    const name = '<img src=x onerror=alert(1)>';
    const r = ok({ ...base, name, sql: '<script>alert(1)</script>' });
    if (!r.ok) throw new Error(r.error);
    expect(r.experiment.name).toBe(name);
    expect(r.experiment.sql).toBe('<script>alert(1)</script>');
  });
  it('coerces sloppy-but-harmless input safely', () => {
    const r = ok({ ...base, tables: [{ rowCount: -50, table: { name: 'users', columns: [{ ...pk, primaryKey: 'yes' }] } }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.experiment.tables[0]!.rowCount).toBe(MIN_ROWS);
    expect(r.experiment.tables[0]!.table.columns[0]!.primaryKey).toBe(false);
  });
  it('enforces the global row cap and size cap', () => {
    const t = (n: string) => ({ rowCount: 10_000, table: table(n) });
    expect(err({ ...base, tables: [t('a'), t('b'), t('c'), t('d')] })).toMatch(/Total rows/);
    expect(parseExperiment(JSON.stringify({ ...base, sql: 'x'.repeat(10_001) })).ok).toBe(false);
    expect(parseExperiment(' '.repeat(100_001)).ok).toBe(false);
  });
  it('round-trips unicode and every example through share links', () => {
    const e: Experiment = { version: 1, name: 'Ünï 日本 😀', tables: [{ table: DEFAULT_TABLE, rowCount: 321 }], seed: 4294967295, sql: "SELECT 'é' -- ✓" };
    expect(decodeShare(encodeShare(e))).toEqual({ ok: true, experiment: e });
  });
  it('rejects damaged or hostile share codes without throwing', () => {
    const e: Experiment = { version: 1, name: 'x', tables: [{ table: DEFAULT_TABLE, rowCount: 100 }], seed: 1, sql: '' };
    const good = encodeShare(e);
    for (const code of ['', '%%%', '====', 'AAAA', good.slice(0, 20), good.slice(0, -5), `${good}!!`, good.replaceAll('e', '*'), 'a'.repeat(300_000), btoa('{"version":2}'), btoa('not json'), '\u0000', '日本語']) {
      expect(() => decodeShare(code), code.slice(0, 20)).not.toThrow();
      const r = decodeShare(code);
      if (code === good) expect(r.ok).toBe(true);
    }
    expect(decodeShare(good.slice(0, -5)).ok).toBe(false);
    expect(decodeShare('a'.repeat(300_000)).ok).toBe(false);
  });
});

describe('plan parsing robustness', () => {
  const row = (id: number, parent: number, detail: string): RawPlanRow => ({ id, parent, notused: 0, detail });
  it('handles empty, orphaned, self-parented and duplicate rows', () => {
    expect(parsePlan([])).toEqual([]);
    expect(planSummary([])).toBe('0 steps: 0 full scans, 0 index/key lookups');
    expect(parsePlan([row(5, 99, 'SCAN t')]).map((n) => n.id)).toEqual([5]);
    expect(parsePlan([row(3, 3, 'SCAN t')]).map((n) => n.id)).toEqual([3]);
    const dup = flattenPlan(parsePlan([row(1, 0, 'SCAN a'), row(1, 0, 'SCAN b')]));
    expect(new Set(dup.map((d) => d.node)).size).toBe(dup.length);
  });
  it('never loops forever on cyclic parent links', () => {
    const flat = flattenPlan(parsePlan([row(1, 2, 'SCAN a'), row(2, 1, 'SCAN b')]));
    expect(flat.map((f) => f.node.id).sort()).toEqual([1, 2]);
    const flat3 = flattenPlan(parsePlan([row(1, 3, 'x'), row(2, 1, 'y'), row(3, 2, 'z')]));
    expect(flat3).toHaveLength(3);
  });
  it('copes with large and deep plans', () => {
    const wide = Array.from({ length: 5000 }, (_, i) => row(i + 1, 0, `SCAN t${i}`));
    expect(flattenPlan(parsePlan(wide))).toHaveLength(5000);
    expect(() => planInsights(wide)).not.toThrow();
    const deep = Array.from({ length: 2000 }, (_, i) => row(i + 1, i, 'SCAN t'));
    expect(flattenPlan(parsePlan(deep))).toHaveLength(2000);
  });
  it('treats detail text as inert data and cannot be made to backtrack catastrophically', () => {
    const nasty = ['(' .repeat(200_000), 'SEARCH t USING INDEX ' + 'x'.repeat(200_000), 'SCAN ' + ' '.repeat(200_000) + ')', '<script>alert(1)</script>', '\u0000', ''];
    const start = performance.now();
    for (const detail of nasty) {
      const c = classifyDetail(detail);
      expect(() => describeNode({ detail, ...c })).not.toThrow();
    }
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(parsePlan([row(1, 0, '<img src=x onerror=1>')])[0]!.detail).toBe('<img src=x onerror=1>');
  });
  it('does not misclassify look-alike text', () => {
    expect(classifyDetail('scan users').kind).toBe('other');
    expect(classifyDetail('SCANNING users').kind).toBe('other');
    expect(classifyDetail('SEARCH users USING INTEGER PRIMARY KEY (rowid=?)').kind).toBe('rowid-search');
  });
});

describe('benchmark helpers (edge cases)', () => {
  it('rejects empty sample sets and handles single/odd/NaN-ish inputs', () => {
    expect(() => summarizeTimes([])).toThrow();
    expect(summarizeTimes([7])).toMatchObject({ runs: 1, minMs: 7, medianMs: 7, maxMs: 7 });
    expect(summarizeTimes([0, 0, 0]).medianMs).toBe(0);
    const input = [3, 1, 2];
    summarizeTimes(input);
    expect(input).toEqual([3, 1, 2]); // does not reorder the caller's array
  });
  it('sizes repeats sanely for any warm-up time', () => {
    for (const w of [0, -1, 0.0001, 0.1, 5, 10, 11, 5000, Infinity, NaN]) {
      const r = repsFor(w);
      expect(Number.isInteger(r), String(w)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(200);
    }
  });
  it('formats times without NaN or negative zero', () => {
    for (const ms of [0, 0.004, 0.5, 9.99, 99.95, 100, 123456, NaN, -1]) expect(formatMs(ms)).toMatch(/^(-?\d+(\.\d+)? ms|NaN ms)$/);
    expect(formatMs(0)).toBe('0.00 ms');
  });
  it('only treats single plain SELECT/WITH statements as benchmarkable (conservatively)', () => {
    for (const ok of ['SELECT 1', '  select 1;', '\nWITH x AS (SELECT 1) SELECT * FROM x', 'SELECT 1;;']) expect(isBenchmarkable(ok), ok).toBe(true);
    for (const no of ['', '  ', 'DELETE FROM t', 'INSERT INTO t VALUES (1)', 'EXPLAIN SELECT 1', 'PRAGMA x', 'VALUES (1)', 'SELECT 1; SELECT 2', "SELECT 'a;b'", '-- c\nSELECT 1', '/* c */ SELECT 1', 'selectx 1', 'SELECT 1; DROP TABLE t', 'CREATE TABLE t(a)']) {
      expect(isBenchmarkable(no), no).toBe(false);
    }
  });
});

describe('which statements get a plan', () => {
  it('explains reads and writes but not DDL, PRAGMA or junk', () => {
    for (const ok of ['SELECT 1', ' select 1', '\nWITH x AS (SELECT 1) SELECT * FROM x', 'INSERT INTO t VALUES (1)', 'update t set a=1', 'DELETE FROM t', 'REPLACE INTO t VALUES (1)', 'VALUES (1)']) {
      expect(isExplainable(ok), ok).toBe(true);
    }
    for (const no of ['CREATE TABLE t (a)', 'DROP TABLE t', 'ALTER TABLE t ADD b', 'PRAGMA table_info(t)', 'CRE', '', '-- c', 'selectx', 'BEGIN', 'VACUUM']) {
      expect(isExplainable(no), no).toBe(false);
    }
  });
});
