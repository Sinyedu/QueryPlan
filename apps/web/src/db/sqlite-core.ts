/**
 * SQLite logic independent of Worker plumbing, so it can be exercised in Node tests.
 * Uses an in-memory database; nothing persists across reloads or worker restarts.
 */
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { buildCreateTable, buildInsert, quoteIdentifier, validateTable } from '../domain/schema';
import { generateBatches, clampRowCount } from '../domain/seeding';
import type { RawPlanRow } from '../domain/explain';
import type {
  Cell, EngineInfo, ExecuteOptions, ExecuteResult, ExplainResult, SchemaInfo, SeedRequest, SeedResult, TableInfo,
} from './protocol';

const MAX_CELL_CHARS = 2_000;
/** Memory budget: 16384 pages * 4 KiB = 64 MiB of database. */
const MAX_PAGES = 16_384;
const PROGRESS_OPS = 2_000;

export class SqliteCoreError extends Error {
  constructor(message: string, readonly kind: 'sql' | 'validation' | 'timeout', readonly code?: number) {
    super(message);
  }
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return `<BLOB ${v.byteLength} bytes>`;
  const s = String(v);
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}… (+${s.length - MAX_CELL_CHARS} chars)` : s;
}

export class SqliteSession {
  private readonly db: Database;
  private deadline = Infinity;
  private interrupted = false;

  constructor(private readonly sqlite3: Sqlite3Static) {
    this.db = new sqlite3.oo1.DB(':memory:', 'c');
    this.db.exec(`PRAGMA max_page_count = ${MAX_PAGES}`);
    // Cooperative time budget: returning non-zero makes SQLite abort the running statement.
    sqlite3.capi.sqlite3_progress_handler(
      this.db.pointer!,
      PROGRESS_OPS,
      () => {
        if (performance.now() > this.deadline) {
          this.interrupted = true;
          return 1;
        }
        return 0;
      },
      0,
    );
  }

  info(): EngineInfo {
    return { engine: 'sqlite', version: this.sqlite3.version.libVersion, storage: 'in-memory' };
  }

  /** Runs `fn` under a time budget and converts SQLite errors into SqliteCoreError. */
  private guarded<T>(timeoutMs: number, fn: () => T): T {
    this.interrupted = false;
    this.deadline = performance.now() + timeoutMs;
    try {
      return fn();
    } catch (e) {
      if (this.interrupted) {
        throw new SqliteCoreError(`Stopped: exceeded the ${timeoutMs} ms time budget. The in-memory database is intact.`, 'timeout');
      }
      if (e instanceof SqliteCoreError) throw e;
      const err = e as { message?: string; resultCode?: number };
      throw new SqliteCoreError(err.message ?? String(e), 'sql', err.resultCode);
    } finally {
      this.deadline = Infinity;
    }
  }

  execute(sql: string, { maxRows, timeoutMs }: ExecuteOptions): ExecuteResult {
    if (sql.trim() === '') throw new SqliteCoreError('Enter a SQL statement to run.', 'validation');
    const columns: string[] = [];
    const rows: Cell[][] = [];
    let totalRows = 0;
    const start = performance.now();
    this.guarded(timeoutMs, () =>
      this.db.exec({
        sql,
        rowMode: 'array',
        columnNames: columns,
        callback: (row: unknown) => {
          totalRows++;
          if (rows.length < maxRows) rows.push((row as unknown[]).map(toCell));
        },
      }),
    );
    const elapsedMs = performance.now() - start;
    return {
      columns, rows, totalRows, truncated: totalRows > rows.length,
      rowsAffected: columns.length === 0 ? this.db.changes() : null,
      elapsedMs,
    };
  }

  explain(sql: string, timeoutMs = 5_000): ExplainResult {
    const stmt = sql.trim().replace(/;+\s*$/, '');
    if (stmt === '') throw new SqliteCoreError('Enter a SQL statement to explain.', 'validation');
    if (/^explain\b/i.test(stmt)) throw new SqliteCoreError('Remove EXPLAIN from the query; QueryPlan adds it for you.', 'validation');
    const rows = this.guarded(timeoutMs, () =>
      this.db.exec({ sql: `EXPLAIN QUERY PLAN ${stmt}`, rowMode: 'object', returnValue: 'resultRows' }),
    ) as unknown as RawPlanRow[];
    return { rows: rows.map((r) => ({ id: Number(r.id), parent: Number(r.parent), notused: Number(r.notused), detail: String(r.detail) })) };
  }

  createTable(table: Parameters<typeof buildCreateTable>[0], replace: boolean): void {
    const issues = validateTable(table);
    if (issues.length) throw new SqliteCoreError(issues[0]!.message, 'validation');
    this.guarded(5_000, () => {
      if (replace) this.db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(table.name)}`);
      this.db.exec(buildCreateTable(table));
    });
  }

  /** Replaces the table's rows with deterministic synthetic rows, inserted in batches inside one transaction. */
  seed({ table, rowCount, seed }: SeedRequest, onProgress: (done: number, total: number) => void): SeedResult {
    const issues = validateTable(table);
    if (issues.length) throw new SqliteCoreError(issues[0]!.message, 'validation');
    const total = clampRowCount(rowCount);
    const start = performance.now();
    this.guarded(60_000, () => {
      const stmt = this.db.prepare(buildInsert(table));
      this.db.exec('BEGIN');
      try {
        this.db.exec(`DELETE FROM ${quoteIdentifier(table.name)}`);
        let done = 0;
        for (const batch of generateBatches(table, total, seed)) {
          for (const row of batch) stmt.bind(row).stepReset();
          done += batch.length;
          onProgress(done, total);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      } finally {
        stmt.finalize();
      }
    });
    return { rowsInserted: total, elapsedMs: performance.now() - start };
  }

  introspect(): SchemaInfo {
    const names = this.db.selectValues(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) as string[];
    const tables: TableInfo[] = names.map((name) => {
      const q = quoteIdentifier(name);
      const cols = this.db.exec({ sql: `PRAGMA table_info(${q})`, rowMode: 'object', returnValue: 'resultRows' }) as unknown as Record<string, unknown>[];
      const idx = this.db.exec({ sql: `PRAGMA index_list(${q})`, rowMode: 'object', returnValue: 'resultRows' }) as unknown as Record<string, unknown>[];
      return {
        name,
        columns: cols.map((c) => ({ name: String(c.name), type: String(c.type), primaryKey: Number(c.pk) > 0 })),
        rowCount: Number(this.db.selectValue(`SELECT count(*) FROM ${q}`)),
        indexes: idx
          .filter((i) => i.origin === 'c')
          .map((i) => ({
            name: String(i.name),
            unique: Number(i.unique) === 1,
            columns: (this.db.selectValues(`SELECT name FROM pragma_index_info(?)`, [String(i.name)]) as string[]),
          })),
      };
    });
    return { tables };
  }

  close(): void {
    this.db.close();
  }
}
