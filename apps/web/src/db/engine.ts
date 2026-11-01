/**
 * Engine contract. SQLite is the only adapter today; a future PostgreSQL adapter would implement
 * the same interface against a remote isolated sandbox (see docs/ARCHITECTURE.md). Plan payloads are
 * engine-specific (`ExplainResult` is SQLite's EXPLAIN QUERY PLAN) and must not be compared across engines.
 */
import type {
  EngineInfo, ExecuteOptions, ExecuteResult, ExplainResult, SchemaInfo, SeedRequest, SeedResult,
} from './protocol';
import type { TableDef } from '../domain/schema';

export interface DatabaseEngine {
  initialize(): Promise<EngineInfo>;
  execute(sql: string, options: ExecuteOptions): Promise<ExecuteResult>;
  explain(sql: string): Promise<ExplainResult>;
  createTable(table: TableDef, replace: boolean): Promise<void>;
  seed(request: SeedRequest, onProgress?: (done: number, total: number) => void): Promise<SeedResult>;
  introspect(): Promise<SchemaInfo>;
  /** Discards all data (terminates and re-creates the worker). */
  reset(): Promise<EngineInfo>;
  dispose(): void;
}

/** Error thrown by engine calls, carrying a structured kind. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly kind: 'sql' | 'validation' | 'timeout' | 'internal' | 'canceled' = 'sql',
    readonly code?: number,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
