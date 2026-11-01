import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE, buildCreateIndex, buildCreateTable, buildInsert, quoteIdentifier, validateIdentifier, validateTable,
  type TableDef,
} from './schema';
import { BATCH_SIZE, MAX_ROWS, MIN_ROWS, clampRowCount, generateBatches, generateRow } from './seeding';
import { classifyDetail, flattenPlan, parsePlan, planSummary } from './explain';

describe('identifiers', () => {
  it('accepts plain names and rejects injection-shaped ones', () => {
    expect(validateIdentifier('users')).toBeNull();
    expect(validateIdentifier('_a1')).toBeNull();
    for (const bad of ['', '1abc', 'a b', 'a"b', 'a;drop table x', 'sqlite_master', 'x'.repeat(65)]) {
      expect(validateIdentifier(bad), bad).not.toBeNull();
    }
  });
  it('quotes and refuses to quote invalid names', () => {
    expect(quoteIdentifier('select')).toBe('"select"');
    expect(() => quoteIdentifier('a"; DROP TABLE x; --')).toThrow();
  });
});

describe('schema validation', () => {
  it('accepts the default table', () => {
    expect(validateTable(DEFAULT_TABLE)).toEqual([]);
    expect(buildCreateTable(DEFAULT_TABLE)).toContain('"id" INTEGER PRIMARY KEY');
  });
  it('reports duplicates, bad generators, and non-integer primary keys', () => {
    const def: TableDef = {
      name: 't',
      columns: [
        { name: 'a', type: 'TEXT', generator: 'sequence', primaryKey: false },
        { name: 'A', type: 'TEXT', generator: 'word', primaryKey: true },
      ],
    };
    const msgs = validateTable(def).map((i) => i.message).join('|');
    expect(msgs).toMatch(/cannot fill/);
    expect(msgs).toMatch(/Duplicate/);
    expect(msgs).toMatch(/INTEGER column can be the primary key/);
  });
  it('builds parameterized inserts and index DDL', () => {
    expect(buildInsert(DEFAULT_TABLE)).toBe('INSERT INTO "users" ("id", "name", "email", "created_at") VALUES (?, ?, ?, ?)');
    expect(buildCreateIndex('users', 'email')).toBe('CREATE INDEX "idx_users_email" ON "users" ("email")');
  });
});

describe('seeding', () => {
  it('is deterministic and seed-sensitive', () => {
    expect(generateRow(DEFAULT_TABLE.columns, 42, 7)).toEqual(generateRow(DEFAULT_TABLE.columns, 42, 7));
    expect(generateRow(DEFAULT_TABLE.columns, 43, 7)).not.toEqual(generateRow(DEFAULT_TABLE.columns, 42, 7));
  });
  it('produces unique emails', () => {
    const emails = new Set<unknown>();
    for (let i = 0; i < 2000; i++) emails.add(generateRow(DEFAULT_TABLE.columns, 1, i)[2]);
    expect(emails.size).toBe(2000);
  });
  it('clamps row counts and batches', () => {
    expect(clampRowCount(5)).toBe(MIN_ROWS);
    expect(clampRowCount(10 ** 9)).toBe(MAX_ROWS);
    expect(clampRowCount(NaN)).toBe(MIN_ROWS);
    const batches = [...generateBatches(DEFAULT_TABLE, 1200, 1)];
    expect(batches.map((b) => b.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 200]);
  });
});

describe('explain parsing', () => {
  const rows = [
    { id: 2, parent: 0, notused: 0, detail: 'SEARCH users USING INDEX idx_users_email (email=?)' },
    { id: 5, parent: 2, notused: 0, detail: 'USE TEMP B-TREE FOR ORDER BY' },
    { id: 9, parent: 0, notused: 0, detail: 'SCAN orders' },
  ];
  it('builds a tree from id/parent and preserves raw details', () => {
    const roots = parsePlan(rows);
    expect(roots.map((r) => r.id)).toEqual([2, 9]);
    expect(roots[0]!.children[0]!.detail).toBe('USE TEMP B-TREE FOR ORDER BY');
    expect(flattenPlan(roots).map((f) => f.depth)).toEqual([0, 1, 0]);
  });
  it('classifies access paths', () => {
    expect(classifyDetail('SCAN users').kind).toBe('scan');
    expect(classifyDetail('SEARCH users USING INTEGER PRIMARY KEY (rowid=?)').kind).toBe('rowid-search');
    expect(classifyDetail('SEARCH users USING INDEX idx (a=?)')).toEqual({ kind: 'index-search', index: 'idx' });
    expect(classifyDetail('SCAN users USING COVERING INDEX idx').kind).toBe('covering-index');
  });
  it('summarizes without inventing costs', () => {
    expect(planSummary(rows)).toBe('3 steps: 1 full scan, 1 index/key lookup');
  });
});

describe('benchmark helpers', () => {
  it('summarizes timings', async () => {
    const { summarizeTimes, isBenchmarkable } = await import('./benchmark');
    expect(summarizeTimes([5, 1, 3])).toEqual({ runs: 3, minMs: 1, medianMs: 3, maxMs: 5, repsPerSample: 1 });
    const { repsFor } = await import('./benchmark');
    expect(repsFor(2)).toBe(5);
    expect(repsFor(0)).toBe(200);
    expect(repsFor(5000)).toBe(1);
    expect(summarizeTimes([1, 2, 3, 4]).medianMs).toBe(2.5);
    expect(isBenchmarkable('SELECT 1;')).toBe(true);
    expect(isBenchmarkable('DELETE FROM t')).toBe(false);
    expect(isBenchmarkable('SELECT 1; DROP TABLE t')).toBe(false);
  });
});

describe('node descriptions', () => {
  it('derives notes from the step detail only', async () => {
    const { describeNode, classifyDetail } = await import('./explain');
    const d = (detail: string) => describeNode({ detail, ...classifyDetail(detail) }).text;
    expect(d('SCAN orders')).toMatch(/Reads every row of orders/);
    expect(d('SEARCH users USING INDEX idx_users_email (email=?)')).toMatch(/idx_users_email.*users on email/);
    expect(d('SCAN users USING COVERING INDEX idx_a')).toMatch(/idx_a.*not touched/);
    expect(d('USE TEMP B-TREE FOR ORDER BY')).toMatch(/temporary B-tree/);
  });
});
