/** Tables created by user SQL can have names our own schema form would reject; the app must still cope. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteSession } from './sqlite-core';

const opts = { maxRows: 200, timeoutMs: 5_000 };
let s: SqliteSession;
beforeAll(async () => { s = new SqliteSession(await sqlite3InitModule()); });
afterAll(() => s.close());

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

describe('awkward table, column and index names created through SQL', () => {
  const weird = ['my table', 'sel"ect', 'select', '日本語', 'a;b', "o'brien", 'x--y', '123', 'DROP TABLE victim'];

  it('introspection survives every awkward name and column', () => {
    s.execute('CREATE TABLE victim (id INTEGER)', opts);
    s.execute('INSERT INTO victim VALUES (1), (2), (3)', opts);
    for (const [i, name] of weird.entries()) {
      s.execute(`CREATE TABLE ${quote(name)} ("a b" INTEGER, "c""d" TEXT, "${i}" TEXT)`, opts);
      s.execute(`INSERT INTO ${quote(name)} ("a b") VALUES (1), (2)`, opts);
    }
    s.execute('CREATE INDEX "i x" ON "my table" ("a b")', opts);

    const info = s.introspect();
    for (const name of weird) {
      const t = info.tables.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(t!.rowCount).toBe(2);
      expect(t!.columns.map((c) => c.name)).toContain('a b');
    }
    expect(info.tables.find((x) => x.name === 'my table')!.indexes).toEqual([{ name: 'i x', unique: false, columns: ['a b'] }]);
    expect(s.execute('SELECT count(*) FROM victim', opts).rows[0]![0]).toBe(3); // a table *named* "DROP TABLE victim" is only a name
  });

  it('keeps foreign-key info for awkward parent names', () => {
    s.execute('CREATE TABLE "par ent" (id INTEGER PRIMARY KEY)', opts);
    s.execute('CREATE TABLE child (p INTEGER REFERENCES "par ent"(id))', opts);
    expect(s.introspect().tables.find((t) => t.name === 'child')!.foreignKeys).toEqual([{ from: 'p', table: 'par ent', to: 'id' }]);
  });
});
