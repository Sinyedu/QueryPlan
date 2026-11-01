/**
 * Main-thread adapter: implements DatabaseEngine by talking to the SQLite worker.
 *
 * Hang protection has two layers: (1) a cooperative SQLite progress handler inside the worker aborts the
 * running statement at its time budget, keeping the database; (2) if the worker stops responding anyway,
 * a watchdog terminates it. Termination necessarily discards the in-memory database.
 */
import { EngineError, type DatabaseEngine } from './engine';
import type {
  EngineInfo, ExecuteOptions, ExecuteResult, ExplainResult, SchemaInfo, SeedRequest, SeedResult,
  WorkerRequest, WorkerResponse,
} from './protocol';
import type { TableDef } from '../domain/schema';

const WATCHDOG_GRACE_MS = 3_000;

interface Pending {
  resolve: (v: never) => void;
  reject: (e: EngineError) => void;
  onProgress?: (done: number, total: number) => void;
  timer?: ReturnType<typeof setTimeout>;
}

type Distributive<T> = T extends unknown ? Omit<T, 'id'> : never;

export class SqliteClient implements DatabaseEngine {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  /** Called whenever the worker was killed and restarted (database contents lost). */
  onRestart?: (reason: string) => void;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
    w.onerror = (ev) => this.killWorker(`Worker crashed: ${ev.message}`, 'internal');
    this.worker = w;
    return w;
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') return p.onProgress?.(msg.done, msg.total);
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'ok') p.resolve(msg.result as never);
    else p.reject(new EngineError(msg.error.message, msg.error.kind, msg.error.code));
  }

  private killWorker(reason: string, kind: 'timeout' | 'canceled' | 'internal'): void {
    this.worker?.terminate();
    this.worker = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(new EngineError(reason, kind));
    }
    this.onRestart?.(reason);
  }

  private call<T>(
    req: Distributive<WorkerRequest>,
    opts: { watchdogMs?: number; onProgress?: Pending['onProgress'] } = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const entry: Pending = { resolve: resolve as Pending['resolve'], reject, onProgress: opts.onProgress };
      if (opts.watchdogMs) {
        entry.timer = setTimeout(
          () => this.killWorker(`Worker unresponsive for ${opts.watchdogMs} ms and was terminated. The in-memory database was cleared.`, 'timeout'),
          opts.watchdogMs,
        );
      }
      this.pending.set(id, entry);
      this.ensureWorker().postMessage({ ...req, id } as WorkerRequest);
    });
  }

  initialize(): Promise<EngineInfo> {
    return this.call({ type: 'init' });
  }

  execute(sql: string, options: ExecuteOptions): Promise<ExecuteResult> {
    return this.call({ type: 'execute', sql, options }, { watchdogMs: options.timeoutMs + WATCHDOG_GRACE_MS });
  }

  explain(sql: string): Promise<ExplainResult> {
    return this.call({ type: 'explain', sql }, { watchdogMs: 5_000 + WATCHDOG_GRACE_MS });
  }

  async createTable(table: TableDef, replace: boolean): Promise<void> {
    await this.call({ type: 'createTable', table, replace });
  }

  seed(request: SeedRequest, onProgress?: (done: number, total: number) => void): Promise<SeedResult> {
    return this.call({ type: 'seed', request }, { onProgress, watchdogMs: 60_000 + WATCHDOG_GRACE_MS });
  }

  introspect(): Promise<SchemaInfo> {
    return this.call({ type: 'introspect' });
  }

  /** Hard-stops whatever is running by terminating the worker. Clears the in-memory database. */
  cancel(): void {
    this.killWorker('Canceled: worker terminated. The in-memory database was cleared.', 'canceled');
  }

  async reset(): Promise<EngineInfo> {
    this.worker?.terminate();
    this.worker = null;
    return this.initialize();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
