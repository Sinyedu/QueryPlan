import type { RawPlanRow } from '../domain/explain';
import type { TimingSummary } from '../domain/benchmark';
import type { ExecuteResult } from '../db/protocol';

export type Busy = null | 'init' | 'table' | 'seed' | 'query' | 'index';

export type QueryState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; result: ExecuteResult }
  | { status: 'error'; message: string; canceled?: boolean };

/** A plan plus the measured timings that were collected alongside it. */
export interface PlanSnapshot {
  label: string;
  sql: string;
  plan: RawPlanRow[] | null;
  planError?: string;
  /** Why no plan is shown (e.g. the statement is DDL), as opposed to an error. */
  planNote?: string;
  timing: TimingSummary;
  totalRows: number;
  indexes: string[];
}

export interface SeedProgress {
  done: number;
  total: number;
}

export const QUERY_TIMEOUT_MS = 10_000;
