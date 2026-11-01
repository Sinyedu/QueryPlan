/** The main-thread client with a fake Worker: protocol, watchdog, cancellation and stale-message handling. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteClient } from './sqlite-client';
import { EngineError } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { DEFAULT_TABLE } from '../domain/schema';

class FakeWorker {
  static instances: FakeWorker[] = [];
  sent: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(msg: WorkerRequest) { this.sent.push(msg); }
  terminate() { this.terminated = true; }
  reply(msg: WorkerResponse) { this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>); }
}

const last = () => FakeWorker.instances[FakeWorker.instances.length - 1]!;
const opts = { maxRows: 10, timeoutMs: 1_000 };
const outcome = (p: Promise<unknown>) => p.then(() => 'resolved', (e: EngineError) => `${e.kind}:${e.message}`);

beforeEach(() => {
  FakeWorker.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SqliteClient', () => {
  it('assigns unique request ids and resolves the right promise out of order', async () => {
    const c = new SqliteClient();
    const a = c.execute('SELECT 1', opts);
    const b = c.execute('SELECT 2', opts);
    const [ra, rb] = last().sent;
    expect(ra!.id).not.toBe(rb!.id);
    last().reply({ id: rb!.id, type: 'ok', result: 'B' });
    last().reply({ id: ra!.id, type: 'ok', result: 'A' });
    await expect(a).resolves.toBe('A');
    await expect(b).resolves.toBe('B');
  });

  it('maps worker errors to structured EngineErrors', async () => {
    const c = new SqliteClient();
    const p = c.execute('SELEC', opts);
    last().reply({ id: last().sent[0]!.id, type: 'error', error: { message: 'syntax error', code: 1, kind: 'sql' } });
    const e = await p.catch((x: EngineError) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect(e).toMatchObject({ kind: 'sql', code: 1, message: 'syntax error' });
  });

  it('forwards seed progress and ignores progress for unknown ids', async () => {
    const c = new SqliteClient();
    const seen: number[] = [];
    const p = c.seed({ tables: [{ table: DEFAULT_TABLE, rowCount: 100 }], seed: 1 }, (d) => seen.push(d));
    const id = last().sent[0]!.id;
    last().reply({ id, type: 'progress', done: 50, total: 100 });
    last().reply({ id: 9999, type: 'progress', done: 1, total: 1 });
    last().reply({ id, type: 'ok', result: { rowsInserted: 100, perTable: {}, elapsedMs: 1 } });
    await p;
    expect(seen).toEqual([50]);
  });

  it('ignores replies for unknown or already-settled ids', async () => {
    const c = new SqliteClient();
    const p = c.introspect();
    const id = last().sent[0]!.id;
    last().reply({ id, type: 'ok', result: { tables: [] } });
    await p;
    expect(() => last().reply({ id, type: 'ok', result: 'late' })).not.toThrow();
    expect(() => last().reply({ id: 12345, type: 'error', error: { message: 'x', kind: 'sql' } })).not.toThrow();
  });

  it('kills an unresponsive worker after budget + grace, rejects with a timeout and reports the restart', async () => {
    const c = new SqliteClient();
    const restarts: string[] = [];
    c.onRestart = (r) => restarts.push(r);
    const p = outcome(c.execute('SELECT 1', opts));
    const w = last();
    vi.advanceTimersByTime(opts.timeoutMs + 2_999);
    expect(w.terminated).toBe(false);
    vi.advanceTimersByTime(2);
    expect(await p).toMatch(/^timeout:.*database was cleared/);
    expect(w.terminated).toBe(true);
    expect(restarts).toHaveLength(1);
  });

  it('does not kill the worker when a reply arrives in time', async () => {
    const c = new SqliteClient();
    const p = c.execute('SELECT 1', opts);
    last().reply({ id: last().sent[0]!.id, type: 'ok', result: 1 });
    await p;
    vi.advanceTimersByTime(60_000);
    expect(last().terminated).toBe(false);
  });

  it('cancel() terminates, rejects every pending call as canceled, and the next call starts a fresh worker', async () => {
    const c = new SqliteClient();
    const restarts: string[] = [];
    c.onRestart = (r) => restarts.push(r);
    const p1 = outcome(c.execute('SELECT 1', opts));
    const p2 = outcome(c.introspect());
    const first = last();
    c.cancel();
    expect(await p1).toMatch(/^canceled:/);
    expect(await p2).toMatch(/^canceled:/);
    expect(first.terminated).toBe(true);
    expect(restarts).toHaveLength(1);
    void c.introspect();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(last()).not.toBe(first);
  });

  it('does not let a stale reply from a killed worker settle a new request', async () => {
    const c = new SqliteClient();
    void outcome(c.execute('SELECT 1', opts));
    const old = last();
    const oldId = old.sent[0]!.id;
    c.cancel();
    const p = c.execute('SELECT 2', opts);
    const fresh = last();
    old.reply({ id: oldId, type: 'ok', result: 'stale' }); // the old worker's message arrives late
    fresh.reply({ id: fresh.sent[0]!.id, type: 'ok', result: 'fresh' });
    await expect(p).resolves.toBe('fresh');
  });

  it('turns a worker crash into an internal error and a restart', async () => {
    const c = new SqliteClient();
    const restarts: string[] = [];
    c.onRestart = (r) => restarts.push(r);
    const p = outcome(c.execute('SELECT 1', opts));
    last().onerror?.({ message: 'boom' } as ErrorEvent);
    expect(await p).toMatch(/^internal:Worker crashed: boom/);
    expect(restarts).toHaveLength(1);
  });

  it('reset() replaces the worker; dispose() is safe to call repeatedly', async () => {
    const c = new SqliteClient();
    void c.introspect();
    const first = last();
    const r = c.reset();
    expect(first.terminated).toBe(true);
    last().reply({ id: last().sent[0]!.id, type: 'ok', result: { engine: 'sqlite', version: 'x', storage: 'in-memory' } });
    await expect(r).resolves.toMatchObject({ storage: 'in-memory' });
    c.dispose();
    expect(() => c.dispose()).not.toThrow();
  });
});
