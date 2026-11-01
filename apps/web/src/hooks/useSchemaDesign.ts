import { useCallback, useMemo, useState } from 'react';
import {
  addTable, autoLayout, connect, disconnect, relationships, removeTable, renameColumn, renameTable,
  type ColumnAddress, type Layout,
} from '../domain/designer';
import type { SeedTable } from '../domain/seeding';

/**
 * Shared state for the visual designer and the form: which table is selected, where cards sit, and every
 * edit that must keep foreign keys consistent. All schema changes go through domain/designer.ts.
 */
export function useSchemaDesign(tables: SeedTable[], setTables: (t: SeedTable[]) => void) {
  const [layout, setLayout] = useState<Layout>({});
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const active = Math.max(0, Math.min(selected, tables.length - 1));

  /** Manual positions win; everything else uses the deterministic auto layout. */
  const positions = useMemo(() => {
    const auto = autoLayout(tables);
    return Object.fromEntries(tables.map((t) => [t.table.name, layout[t.table.name] ?? auto[t.table.name]!])) as Layout;
  }, [tables, layout]);

  const relations = useMemo(() => relationships(tables), [tables]);

  const moveTable = useCallback((name: string, x: number, y: number) => {
    setLayout((l) => ({ ...l, [name]: { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } }));
  }, []);

  const resetLayout = useCallback(() => { setLayout({}); setSelected(0); setMessage(null); }, []);

  const rename = useCallback((index: number, name: string) => {
    const old = tables[index]?.table.name;
    setTables(renameTable(tables, index, name));
    if (old !== undefined) setLayout((l) => (l[old] ? Object.fromEntries(Object.entries(l).map(([k, v]) => [k === old ? name : k, v])) : l));
  }, [tables, setTables]);

  const renameCol = useCallback((ti: number, ci: number, name: string) => setTables(renameColumn(tables, ti, ci, name)), [tables, setTables]);

  const add = useCallback(() => {
    const r = addTable(tables);
    if (!r.ok) return setMessage(r.error);
    setMessage(null); setTables(r.tables); setSelected(r.tables.length - 1);
  }, [tables, setTables]);

  const remove = useCallback((index: number) => {
    const r = removeTable(tables, index);
    if (!r.ok) return setMessage(r.error);
    const gone = tables[index]!.table.name;
    setMessage(null); setTables(r.tables); setSelected(0);
    setLayout((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== gone)));
  }, [tables, setTables]);

  /** Returns true when the connection was made; otherwise the reason is in `message`. */
  const link = useCallback((from: ColumnAddress, to: ColumnAddress): boolean => {
    const r = connect(tables, from, to);
    if (!r.ok) { setMessage(r.error); return false; }
    setMessage(null); setTables(r.tables);
    return true;
  }, [tables, setTables]);

  const unlink = useCallback((from: ColumnAddress) => { setMessage(null); setTables(disconnect(tables, from)); }, [tables, setTables]);

  return { active, select: setSelected, positions, relations, message, clearMessage: () => setMessage(null), moveTable, resetLayout, rename, renameCol, add, remove, link, unlink };
}

export type SchemaDesign = ReturnType<typeof useSchemaDesign>;
