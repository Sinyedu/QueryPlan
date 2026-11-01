/// <reference lib="webworker" />
/** Dedicated module worker: owns the SQLite WASM instance and speaks the typed protocol in protocol.ts. */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteCoreError, SqliteSession } from './sqlite-core';
import type { EngineErrorInfo, WorkerRequest, WorkerResponse } from './protocol';

let session: Promise<SqliteSession> | null = null;
const getSession = () => (session ??= sqlite3InitModule().then((s) => new SqliteSession(s)));

const post = (msg: WorkerResponse) => self.postMessage(msg);

function toErrorInfo(e: unknown): EngineErrorInfo {
  if (e instanceof SqliteCoreError) return { message: e.message, code: e.code, kind: e.kind };
  return { message: e instanceof Error ? e.message : String(e), kind: 'internal' };
}

async function handle(req: WorkerRequest): Promise<unknown> {
  const s = await getSession();
  switch (req.type) {
    case 'init': return s.info();
    case 'execute': return s.execute(req.sql, req.options);
    case 'explain': return s.explain(req.sql);
    case 'createSchema': s.createSchema(req.tables, req.replace); return null;
    case 'seed': return s.seed(req.request, (done, total) => post({ id: req.id, type: 'progress', done, total }));
    case 'introspect': return s.introspect();
  }
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    post({ id: req.id, type: 'ok', result: await handle(req) });
  } catch (e) {
    post({ id: req.id, type: 'error', error: toErrorInfo(e) });
  }
};
