import { describe, expect, it } from 'vitest';
import {
  CARD_W, addTable, autoLayout, cardHeight, connect, disconnect, newTable, relationships, removeTable, renameColumn, renameTable, uniqueTableName,
  type EditResult,
} from './designer';
import { MAX_TABLES, validateSchema, type ColumnDef } from './schema';
import type { SeedTable } from './seeding';

const pk: ColumnDef = { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true };
const t = (name: string, ...cols: ColumnDef[]): SeedTable => ({ table: { name, columns: [pk, ...cols] }, rowCount: 100 });
const col = (name: string, over: Partial<ColumnDef> = {}): ColumnDef => ({ name, type: 'INTEGER', generator: 'integer', primaryKey: false, ...over });
const ok = (r: EditResult) => { if (!r.ok) throw new Error(r.error); return r.tables; };
const err = (r: EditResult) => (r.ok ? 'OK' : r.error);
const issues = (ts: SeedTable[]) => validateSchema(ts.map((x) => x.table)).map((i) => i.message);

describe('connect / disconnect', () => {
  const base = () => [t('users', col('name', { type: 'TEXT', generator: 'word' })), t('orders', col('user_id'), col('status', { type: 'TEXT', generator: 'word' }))];

  it('turns an integer column into a valid foreign key', () => {
    const next = ok(connect(base(), { table: 'orders', column: 'user_id' }, { table: 'users', column: 'id' }));
    const c = next[1]!.table.columns[1]!;
    expect(c).toMatchObject({ generator: 'foreignKey', type: 'INTEGER', references: { table: 'users', column: 'id' } });
    expect(issues(next)).toEqual([]);
    expect(relationships(next)).toEqual([{ from: { table: 'orders', column: 'user_id' }, to: { table: 'users', column: 'id' } }]);
  });

  it('coerces the child column to INTEGER and does not mutate its input', () => {
    const input = [t('users'), t('orders', col('ref', { type: 'TEXT', generator: 'word' }))];
    const snapshot = JSON.stringify(input);
    const next = ok(connect(input, { table: 'orders', column: 'ref' }, { table: 'users', column: 'id' }));
    expect(next[1]!.table.columns[1]!.type).toBe('INTEGER');
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('re-pointing a foreign key replaces the old reference', () => {
    const three = [t('a'), t('b'), t('c', col('p'))];
    const first = ok(connect(three, { table: 'c', column: 'p' }, { table: 'a', column: 'id' }));
    const second = ok(connect(first, { table: 'c', column: 'p' }, { table: 'b', column: 'id' }));
    expect(relationships(second)).toHaveLength(1);
    expect(relationships(second)[0]!.to.table).toBe('b');
  });

  it('rejects self references, primary keys, unknown names and bad targets', () => {
    expect(err(connect(base(), { table: 'users', column: 'name' }, { table: 'users', column: 'id' }))).toMatch(/itself/);
    expect(err(connect(base(), { table: 'orders', column: 'id' }, { table: 'users', column: 'id' }))).toMatch(/primary key/);
    expect(err(connect(base(), { table: 'nope', column: 'x' }, { table: 'users', column: 'id' }))).toMatch(/does not exist/);
    expect(err(connect(base(), { table: 'orders', column: 'nope' }, { table: 'users', column: 'id' }))).toMatch(/does not exist/);
    expect(err(connect(base(), { table: 'orders', column: 'user_id' }, { table: 'users', column: 'name' }))).toMatch(/cannot be referenced/);
    expect(err(connect(base(), { table: 'orders', column: 'user_id' }, { table: 'ghost', column: 'id' }))).toMatch(/cannot be referenced/);
    const randomPk = [{ ...t('p'), table: { name: 'p', columns: [{ ...pk, generator: 'integer' as const }] } }, t('c', col('x'))];
    expect(err(connect(randomPk, { table: 'c', column: 'x' }, { table: 'p', column: 'id' }))).toMatch(/sequence/);
  });

  it('refuses a connection that would form a cycle, leaving the schema unchanged', () => {
    const ab = ok(connect([t('a', col('b_id')), t('b', col('a_id'))], { table: 'a', column: 'b_id' }, { table: 'b', column: 'id' }));
    const result = connect(ab, { table: 'b', column: 'a_id' }, { table: 'a', column: 'id' });
    expect(err(result)).toMatch(/cycle/);
    expect(relationships(ab)).toHaveLength(1);
    const chain = ok(connect([t('x', col('y_id')), t('y', col('z_id')), t('z')], { table: 'x', column: 'y_id' }, { table: 'y', column: 'id' }));
    const chain2 = ok(connect(chain, { table: 'y', column: 'z_id' }, { table: 'z', column: 'id' }));
    expect(err(connect(chain2, { table: 'z', column: 'x_id' }, { table: 'x', column: 'id' }))).toMatch(/does not exist/);
  });

  it('disconnect restores a plain integer column and is a no-op elsewhere', () => {
    const linked = ok(connect(base(), { table: 'orders', column: 'user_id' }, { table: 'users', column: 'id' }));
    const plain = disconnect(linked, { table: 'orders', column: 'user_id' });
    expect(plain[1]!.table.columns[1]).toEqual(col('user_id'));
    expect(relationships(plain)).toEqual([]);
    expect(disconnect(plain, { table: 'orders', column: 'user_id' })).toEqual(plain);
    expect(disconnect(plain, { table: 'ghost', column: 'x' })).toEqual(plain);
    expect(issues(plain)).toEqual([]);
  });
});

describe('renaming and removing keeps foreign keys consistent', () => {
  const linked = () => ok(connect([t('users'), t('orders', col('user_id'))], { table: 'orders', column: 'user_id' }, { table: 'users', column: 'id' }));

  it('renaming a parent table updates every reference, even through intermediate names', () => {
    let next = linked();
    for (const name of ['u', 'us', 'user', 'customers']) next = renameTable(next, 0, name);
    expect(next[0]!.table.name).toBe('customers');
    expect(next[1]!.table.columns[1]!.references).toEqual({ table: 'customers', column: 'id' });
    expect(issues(next)).toEqual([]);
  });

  it('renaming a child table or an unknown index leaves references alone', () => {
    const next = renameTable(linked(), 1, 'sales');
    expect(next[1]!.table.name).toBe('sales');
    expect(next[1]!.table.columns[1]!.references).toEqual({ table: 'users', column: 'id' });
    expect(renameTable(linked(), 9, 'x')).toEqual(linked());
  });

  it('renaming a referenced primary-key column updates references', () => {
    const next = renameColumn(linked(), 0, 0, 'user_pk');
    expect(next[0]!.table.columns[0]!.name).toBe('user_pk');
    expect(next[1]!.table.columns[1]!.references).toEqual({ table: 'users', column: 'user_pk' });
    expect(issues(next)).toEqual([]);
    expect(renameColumn(linked(), 5, 0, 'x')).toEqual(linked());
  });

  it('removing a parent detaches children instead of leaving dangling references', () => {
    const next = ok(removeTable(linked(), 0));
    expect(next).toHaveLength(1);
    expect(next[0]!.table.columns[1]).toEqual(col('user_id'));
    expect(issues(next)).toEqual([]);
  });

  it('refuses to remove the last or a missing table', () => {
    expect(err(removeTable([t('only')], 0))).toMatch(/at least one/);
    expect(err(removeTable([t('a'), t('b')], 7))).toMatch(/No such table/);
  });
});

describe('adding tables', () => {
  it('picks unique names and stops at the table limit', () => {
    expect(uniqueTableName([t('table2')], 'table')).toBe('table3');
    expect(uniqueTableName([t('TABLE2'), t('table3')], 'table')).toBe('table4');
    let tables: SeedTable[] = [t('table1')];
    for (let i = 1; i < MAX_TABLES; i++) tables = ok(addTable(tables));
    expect(tables).toHaveLength(MAX_TABLES);
    expect(new Set(tables.map((x) => x.table.name.toLowerCase())).size).toBe(MAX_TABLES);
    expect(err(addTable(tables))).toMatch(/At most/);
    expect(issues(tables)).toEqual([]);
    expect(newTable('x').table.columns[0]!.primaryKey).toBe(true);
  });
});

describe('autoLayout', () => {
  const rects = (tables: SeedTable[]) => {
    const l = autoLayout(tables);
    return tables.map((x) => ({ name: x.table.name, ...l[x.table.name]!, w: CARD_W, h: cardHeight(x.table) }));
  };
  const overlap = (a: ReturnType<typeof rects>[number], b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('places parents left of children and never overlaps cards', () => {
    const tables = ok(connect(ok(connect([t('c', col('b_id'), col('a_id')), t('b', col('a_id')), t('a')], { table: 'b', column: 'a_id' }, { table: 'a', column: 'id' })), { table: 'c', column: 'b_id' }, { table: 'b', column: 'id' }));
    const l = autoLayout(tables);
    expect(l.a!.x).toBeLessThan(l.b!.x);
    expect(l.b!.x).toBeLessThan(l.c!.x);
    const r = rects(tables);
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i]!, r[j]!)).toBe(false);
  });

  it('stacks siblings vertically without overlap and is deterministic', () => {
    const tables = [t('p'), t('c1', col('p_id')), t('c2', col('p_id')), t('c3', col('p_id'))];
    const linked = ['c1', 'c2', 'c3'].reduce((acc, n) => ok(connect(acc, { table: n, column: 'p_id' }, { table: 'p', column: 'id' })), tables);
    expect(autoLayout(linked)).toEqual(autoLayout(linked));
    const r = rects(linked);
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i]!, r[j]!)).toBe(false);
  });

  it('tolerates cycles, dangling references and an empty schema', () => {
    const cyc = [
      { ...t('a'), table: { name: 'a', columns: [pk, col('b', { generator: 'foreignKey', references: { table: 'b', column: 'id' } })] } },
      { ...t('b'), table: { name: 'b', columns: [pk, col('a', { generator: 'foreignKey', references: { table: 'a', column: 'id' } })] } },
    ];
    expect(Object.keys(autoLayout(cyc)).sort()).toEqual(['a', 'b']);
    const dangling = [{ ...t('a'), table: { name: 'a', columns: [pk, col('x', { generator: 'foreignKey', references: { table: 'zzz', column: 'id' } })] } }];
    expect(autoLayout(dangling).a).toBeDefined();
    expect(autoLayout([])).toEqual({});
  });
});
