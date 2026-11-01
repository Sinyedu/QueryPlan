/** Typed message protocol between the UI thread and a database worker. Engine-neutral names. */
import type { RawPlanRow } from '../domain/explain';
import type { TableDef } from '../domain/schema';
import type { SqlValue } from '../domain/seeding';

export type Cell = SqlValue;

export interface EngineInfo {
  engine: 'sqlite';
  version: string;
  storage: 'in-memory';
}

export interface ExecuteOptions {
  /** Max rows returned to the UI (the rest are counted, not materialized). */
  maxRows: number;
  /** Cooperative in-worker time budget; the client adds a hard watchdog on top. */
  timeoutMs: number;
}

export interface ExecuteResult {
  columns: string[];
  rows: Cell[][];
  /** Rows the statement produced in total (may exceed rows.length). */
  totalRows: number;
  truncated: boolean;
  rowsAffected: number | null;
  /** Wall-clock time of the whole execution inside the worker (includes counting all rows). */
  elapsedMs: number;
}

export interface ExplainResult {
  /** Verbatim rows from `EXPLAIN QUERY PLAN`. SQLite reports no costs or per-node timings. */
  rows: RawPlanRow[];
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableInfo {
  name: string;
  columns: { name: string; type: string; primaryKey: boolean }[];
  rowCount: number;
  indexes: IndexInfo[];
}

export interface SchemaInfo {
  tables: TableInfo[];
}

export interface SeedRequest {
  table: TableDef;
  rowCount: number;
  seed: number;
}

export interface SeedResult {
  rowsInserted: number;
  elapsedMs: number;
}

export interface EngineErrorInfo {
  message: string;
  code?: number;
  kind: 'sql' | 'validation' | 'timeout' | 'internal';
}

export type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'execute'; sql: string; options: ExecuteOptions }
  | { id: number; type: 'explain'; sql: string }
  | { id: number; type: 'createTable'; table: TableDef; replace: boolean }
  | { id: number; type: 'seed'; request: SeedRequest }
  | { id: number; type: 'introspect' };

export type WorkerResponse =
  | { id: number; type: 'ok'; result: unknown }
  | { id: number; type: 'error'; error: EngineErrorInfo }
  | { id: number; type: 'progress'; done: number; total: number };
