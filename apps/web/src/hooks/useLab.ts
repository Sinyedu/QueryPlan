import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SqliteClient } from '../db/sqlite-client';
import type { EngineInfo, SchemaInfo } from '../db/protocol';
import { DEFAULT_TABLE, buildCreateIndex, buildDropIndex, validateSchema } from '../domain/schema';
import { isExplainable } from '../domain/explain';
import { DEFAULT_SEED, type SeedTable } from '../domain/seeding';
import { BENCH_RUNS, isBenchmarkable, repsFor, summarizeTimes } from '../domain/benchmark';
import { EXPERIMENT_VERSION, type Experiment } from '../domain/experiment';
import { GUIDED_EXAMPLE } from '../domain/examples';
import { DEFAULT_ROW_LIMIT, clampRowLimit } from '../domain/results';
import { QUERY_TIMEOUT_MS, type Busy, type PlanSnapshot, type QueryState, type SeedProgress } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ROW_LIMIT_KEY = 'queryplan.rowLimit.v1';
/** A per-viewer convenience only: storage may be blocked, so every access is guarded. */
const loadRowLimit = (): number => {
  try { return clampRowLimit(Number(localStorage.getItem(ROW_LIMIT_KEY) ?? DEFAULT_ROW_LIMIT)); } catch { return DEFAULT_ROW_LIMIT; }
};
const indexNames = (s: SchemaInfo) => s.tables.flatMap((t) => t.indexes.map((i) => i.name));

export function useLab() {
  const engine = useMemo(() => new SqliteClient(), []);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [schema, setSchema] = useState<SchemaInfo>({ tables: [] });
  const [busy, setBusy] = useState<Busy>('init');
  const [notice, setNotice] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tables, setTables] = useState<SeedTable[]>([{ table: DEFAULT_TABLE, rowCount: 5_000 }]);
  const [seedValue, setSeedValue] = useState(DEFAULT_SEED);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 20');
  const [query, setQuery] = useState<QueryState>({ status: 'idle' });
  const [current, setCurrent] = useState<PlanSnapshot | null>(null);
  const [before, setBefore] = useState<PlanSnapshot | null>(null);
  const [benchRuns, setBenchRuns] = useState<number>(BENCH_RUNS);
  const [rowLimit, setRowLimitState] = useState(loadRowLimit);
  const rowLimitRef = useRef(rowLimit);
  rowLimitRef.current = rowLimit;
  const setRowLimit = useCallback((n: number) => {
    const v = clampRowLimit(n);
    setRowLimitState(v);
    try { localStorage.setItem(ROW_LIMIT_KEY, String(v)); } catch { /* not persisted; still applies this session */ }
  }, []);
  /** Interactive queries return up to the user's row limit; DDL and benchmarking do not need rows. */
  const limits = useCallback((maxRows = rowLimitRef.current) => ({ maxRows, timeoutMs: QUERY_TIMEOUT_MS }), []);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  const refreshSchema = useCallback(async () => {
    try { setSchema(await engine.introspect()); } catch { /* worker restarting; next call will recover */ }
  }, [engine]);

  useEffect(() => {
    engine.onRestart = (reason) => {
      setNotice(reason); setSchema({ tables: [] }); setBefore(null); setCurrent(null); setProgress(null); setBusy(null);
    };
    engine.initialize().then(setInfo).then(refreshSchema).catch((e) => setNotice(errMsg(e))).finally(() => setBusy(null));
    return () => engine.dispose();
  }, [engine, refreshSchema]);

  /** Wraps an async action with the busy flag and error → notice handling. */
  const run = useCallback(async (kind: Exclude<Busy, null>, fn: () => Promise<void>, onError?: (m: string) => void) => {
    setBusy(kind);
    try { await fn(); } catch (e) { (onError ?? setNotice)(errMsg(e)); } finally { setBusy(null); }
  }, []);

  const defs = useMemo(() => tables.map((t) => t.table), [tables]);
  const schemaIssues = useMemo(() => validateSchema(defs), [defs]);
  const existing = schema.tables.some((t) => defs.some((d) => d.name === t.name));

  const doSeed = useCallback(async (list: SeedTable[], seed: number) => {
    setSeedMsg(null); setProgress({ done: 0, total: list.reduce((n, t) => n + t.rowCount, 0) });
    try {
      const r = await engine.seed({ tables: list, seed }, (done, total) => setProgress({ done, total }));
      setSeedMsg(`Inserted ${r.rowsInserted.toLocaleString()} rows in ${Math.round(r.elapsedMs)} ms (measured), seed ${seed}.`);
    } catch (e) { setSeedMsg(`Seed failed: ${errMsg(e)}`); throw e; } finally { setProgress(null); }
    await refreshSchema();
  }, [engine, refreshSchema]);

  const createSchema = useCallback(() => run('table', async () => {
    setTableError(null); setBefore(null); setCurrent(null);
    await engine.createSchema(defs, existing);
    await refreshSchema();
  }, setTableError), [run, engine, defs, existing, refreshSchema]);

  const seed = useCallback(() => run('seed', () => doSeed(tables, seedValue).catch(() => undefined)), [run, doSeed, tables, seedValue]);

  const snapshot = useCallback(async (label: string, text: string, runs: number): Promise<PlanSnapshot> => {
    const samples: number[] = [];
    const bench = { ...limits(0), requireReadOnly: true }; // timings read every row but do not materialize them
     // never repeat (or even warm up) a statement that writes
    let last = await engine.execute(text, bench); // discarded warm-up; sizes the repeat count
    const repeat = repsFor(last.elapsedMs);
    for (let i = 0; i < runs; i++) { last = await engine.execute(text, { ...bench, repeat }); samples.push(last.elapsedMs); }
    let plan = null; let planError: string | undefined;
    try { plan = (await engine.explain(text)).rows; } catch (e) { planError = errMsg(e); }
    return { label, sql: text, plan, planError, timing: summarizeTimes(samples, repeat), totalRows: last.totalRows, indexes: indexNames(await engine.introspect()) };
  }, [engine, limits]);

  const runQuery = useCallback(async (text = sqlRef.current) => {
    setBusy('query'); setQuery({ status: 'running' });
    try {
      const result = await engine.execute(text, limits());
      setQuery({ status: 'ok', result });
      let plan = null; let planError: string | undefined; let planNote: string | undefined;
      if (!isExplainable(text)) planNote = 'Query plans are shown for SELECT, INSERT, UPDATE and DELETE statements, not for DDL or PRAGMA.';
      else try { plan = (await engine.explain(text)).rows; } catch (e) { planError = errMsg(e); }
      const fresh = await engine.introspect();
      setSchema(fresh);
      setCurrent({ label: 'Latest run', sql: text, plan, planError, planNote, timing: summarizeTimes([result.elapsedMs]), totalRows: result.totalRows, indexes: indexNames(fresh) });
    } catch (e) {
      setQuery({ status: 'error', message: errMsg(e), canceled: (e as { kind?: string }).kind === 'canceled' });
    } finally { setBusy(null); }
  }, [engine, limits]);

  /** Benchmark → create index → benchmark again, with identical methodology for both sides. */
  const compareWithIndex = useCallback((table: string, columns: string[]) => run('index', async () => {
    const b = await snapshot('Before index', sql, benchRuns);
    await engine.execute(buildCreateIndex(table, columns), limits(0));
    const a = await snapshot(`After index on ${table}(${columns.join(', ')})`, sql, benchRuns);
    setBefore(b); setCurrent(a);
    setQuery({ status: 'ok', result: await engine.execute(sql, limits()) });
    await refreshSchema();
  }), [engine, limits, sql, snapshot, benchRuns, refreshSchema, run]);

  const dropIndex = useCallback((name: string) => run('index', async () => {
    await engine.execute(buildDropIndex(name), limits(0));
    setBefore(null);
    await refreshSchema();
  }), [engine, limits, refreshSchema, run]);

  /** Loads a definition into the editors without touching the database. */
  const loadExperiment = useCallback((e: Experiment) => {
    setTables(e.tables); setSeedValue(e.seed); setSql(e.sql);
    setBefore(null); setCurrent(null); setQuery({ status: 'idle' }); setTableError(null); setSeedMsg(null);
  }, []);

  /** Create all tables, seed them, then run the experiment's SQL (its first plan is the "before"). */
  const runExperiment = useCallback((e: Experiment) => run('table', async () => {
    setNotice(null); loadExperiment(e);
    await engine.createSchema(e.tables.map((t) => t.table), true);
    setBusy('seed');
    await doSeed(e.tables, e.seed);
    await runQuery(e.sql);
  }), [engine, doSeed, runQuery, loadExperiment, run]);

  const resetDatabase = useCallback(() => run('init', async () => {
    setInfo(await engine.reset());
    setSchema({ tables: [] }); setQuery({ status: 'idle' }); setCurrent(null); setBefore(null);
    setProgress(null); setSeedMsg(null); setNotice('Database reset. It is empty again.');
  }), [engine, run]);

  const toExperiment = useCallback((name: string): Experiment => ({ version: EXPERIMENT_VERSION, name, tables, seed: seedValue, sql }), [tables, seedValue, sql]);

  return {
    info, schema, busy, notice, setNotice, tables, setTables, tableError, schemaIssues, existing,
    seedValue, setSeedValue, progress, seedMsg, sql, setSql, query, current, before,
    benchRuns, setBenchRuns, rowLimit, setRowLimit, benchmarkable: isBenchmarkable(sql),
    createSchema, seed, runQuery, compareWithIndex, dropIndex, loadExperiment, runExperiment, toExperiment,
    runGuided: () => runExperiment(GUIDED_EXAMPLE), resetDatabase, cancel: () => engine.cancel(),
  };
}

export type Lab = ReturnType<typeof useLab>;
