import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SqliteClient } from '../db/sqlite-client';
import type { EngineInfo, SchemaInfo } from '../db/protocol';
import { DEFAULT_TABLE, buildCreateIndex, buildDropIndex, indexName, type TableDef } from '../domain/schema';
import { DEFAULT_SEED, generateRow } from '../domain/seeding';
import { BENCH_RUNS, isBenchmarkable, summarizeTimes } from '../domain/benchmark';
import { QUERY_LIMITS, type Busy, type PlanSnapshot, type QueryState, type SeedProgress } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useLab() {
  const engine = useMemo(() => new SqliteClient(), []);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [schema, setSchema] = useState<SchemaInfo>({ tables: [] });
  const [busy, setBusy] = useState<Busy>('init');
  const [notice, setNotice] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [table, setTable] = useState<TableDef>(DEFAULT_TABLE);
  const [rowCount, setRowCount] = useState(5_000);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 20');
  const [query, setQuery] = useState<QueryState>({ status: 'idle' });
  const [current, setCurrent] = useState<PlanSnapshot | null>(null);
  const [before, setBefore] = useState<PlanSnapshot | null>(null);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  const refreshSchema = useCallback(async () => {
    try { setSchema(await engine.introspect()); } catch { /* worker restarting; next call will recover */ }
  }, [engine]);

  useEffect(() => {
    engine.onRestart = (reason) => {
      setNotice(reason);
      setSchema({ tables: [] });
      setBefore(null);
      setCurrent(null);
      setProgress(null);
      setBusy(null);
    };
    engine.initialize().then(setInfo).then(refreshSchema).catch((e) => setNotice(errMsg(e))).finally(() => setBusy(null));
    return () => engine.dispose();
  }, [engine, refreshSchema]);

  /** Wraps an async action with the busy flag and error → notice handling. */
  const run = useCallback(async (kind: Exclude<Busy, null>, fn: () => Promise<void>, onError?: (m: string) => void) => {
    setBusy(kind);
    try { await fn(); } catch (e) { (onError ?? setNotice)(errMsg(e)); } finally { setBusy(null); }
  }, []);

  const createTable = useCallback((replace: boolean) => run('table', async () => {
    setTableError(null);
    setBefore(null); setCurrent(null);
    await engine.createTable(table, replace);
    await refreshSchema();
  }, setTableError), [engine, table, refreshSchema, run]);

  const seed = useCallback(() => run('seed', async () => {
    setSeedMsg(null); setProgress({ done: 0, total: rowCount });
    const r = await engine.seed({ table, rowCount, seed: DEFAULT_SEED }, (done, total) => setProgress({ done, total }));
    setSeedMsg(`Inserted ${r.rowsInserted.toLocaleString()} rows in ${Math.round(r.elapsedMs)} ms (measured).`);
    await refreshSchema();
  }, (m) => setSeedMsg(`Seed failed: ${m}`)).finally(() => setProgress(null)), [engine, table, rowCount, refreshSchema, run]);

  /** One discarded warm-up run, then `runs` timed executions; returns a timing summary plus the last result. */
  const bench = useCallback(async (text: string, runs: number) => {
    const samples: number[] = [];
    let last = await engine.execute(text, QUERY_LIMITS);
    for (let i = 0; i < runs; i++) { last = await engine.execute(text, QUERY_LIMITS); samples.push(last.elapsedMs); }
    return { last, timing: summarizeTimes(samples) };
  }, [engine]);

  const snapshot = useCallback(async (label: string, text: string, runs: number): Promise<PlanSnapshot> => {
    const { last, timing } = await bench(text, runs);
    let plan = null; let planError: string | undefined;
    try { plan = (await engine.explain(text)).rows; } catch (e) { planError = errMsg(e); }
    const tables = (await engine.introspect()).tables;
    const indexes = tables.flatMap((t) => t.indexes.map((i) => i.name));
    return { label, sql: text, plan, planError, timing, totalRows: last.totalRows, indexes };
  }, [bench, engine]);

  const runQuery = useCallback(async (text = sqlRef.current) => {
    setBusy('query'); setQuery({ status: 'running' });
    try {
      const result = await engine.execute(text, QUERY_LIMITS);
      setQuery({ status: 'ok', result });
      let plan = null; let planError: string | undefined;
      try { plan = (await engine.explain(text)).rows; } catch (e) { planError = errMsg(e); }
      const indexes = (await engine.introspect()).tables.flatMap((t) => t.indexes.map((i) => i.name));
      setCurrent({ label: 'Latest run', sql: text, plan, planError, timing: summarizeTimes([result.elapsedMs]), totalRows: result.totalRows, indexes });
      setSchema(await engine.introspect());
    } catch (e) {
      const m = errMsg(e);
      setQuery({ status: 'error', message: m, canceled: (e as { kind?: string }).kind === 'canceled' });
    } finally { setBusy(null); }
  }, [engine]);

  /** Benchmark → create index → benchmark again, with identical methodology for both sides. */
  const compareWithIndex = useCallback((column: string) => run('index', async () => {
    const t = table.name;
    const b = await snapshot('Before index', sql, BENCH_RUNS);
    await engine.execute(buildCreateIndex(t, column), QUERY_LIMITS);
    const a = await snapshot(`After index on ${column}`, sql, BENCH_RUNS);
    setBefore(b); setCurrent(a);
    setQuery({ status: 'ok', result: await engine.execute(sql, QUERY_LIMITS) });
    await refreshSchema();
  }), [engine, table.name, sql, snapshot, refreshSchema, run]);

  const dropIndex = useCallback((name: string) => run('index', async () => {
    await engine.execute(buildDropIndex(name), QUERY_LIMITS);
    setBefore(null);
    await refreshSchema();
  }), [engine, refreshSchema, run]);

  /** Guided example: users table → 5,000 rows → email lookup (scan plan) ready for the index step. */
  const runGuided = useCallback(() => run('table', async () => {
    setNotice(null); setBefore(null); setCurrent(null);
    setTable(DEFAULT_TABLE); setRowCount(5_000);
    await engine.createTable(DEFAULT_TABLE, true);
    setBusy('seed'); setProgress({ done: 0, total: 5_000 });
    const r = await engine.seed({ table: DEFAULT_TABLE, rowCount: 5_000, seed: DEFAULT_SEED }, (done, total) => setProgress({ done, total }));
    setProgress(null);
    setSeedMsg(`Inserted ${r.rowsInserted.toLocaleString()} rows in ${Math.round(r.elapsedMs)} ms (measured).`);
    const email = generateRow(DEFAULT_TABLE.columns, DEFAULT_SEED, 4_242)[2] as string;
    const text = `SELECT * FROM users WHERE email = '${email}'`;
    setSql(text);
    await refreshSchema();
    await runQuery(text);
  }), [engine, refreshSchema, runQuery, run]);

  const resetDatabase = useCallback(() => run('init', async () => {
    setInfo(await engine.reset());
    setSchema({ tables: [] }); setQuery({ status: 'idle' }); setCurrent(null); setBefore(null);
    setProgress(null); setSeedMsg(null); setNotice('Database reset. It is empty again.');
  }), [engine, run]);

  return {
    info, schema, busy, notice, setNotice, table, setTable, tableError, rowCount, setRowCount, progress, seedMsg,
    sql, setSql, query, current, before, benchmarkable: isBenchmarkable(sql),
    createTable, seed, runQuery, compareWithIndex, dropIndex, runGuided, resetDatabase,
    cancel: () => engine.cancel(), indexName,
  };
}

export type Lab = ReturnType<typeof useLab>;
