import { useLab } from './hooks/useLab';
import { PlanPanel } from './components/PlanPanel';
import { ResultsTable } from './components/ResultsTable';
import { SchemaBuilder } from './components/SchemaBuilder';
import { SeedPanel } from './components/SeedPanel';
import { Sidebar } from './components/Sidebar';
import { SqlEditor } from './components/SqlEditor';
import { Alert, Button } from './components/ui';

export function App() {
  const lab = useLab();
  const { info } = lab;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-zinc-100">QueryPlan</h1>
        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300" data-testid="engine-info">
          {info ? `SQLite ${info.version} · WASM · in-memory (cleared on refresh)` : 'Starting SQLite…'}
        </span>
        <div className="ml-auto flex gap-2">
          <Button disabled={lab.busy !== null} onClick={() => void lab.runGuided()}>▶ Guided example</Button>
          <Button variant="danger" disabled={lab.busy === 'init'}
            onClick={() => { if (window.confirm('Reset the database? All tables and rows will be deleted.')) void lab.resetDatabase(); }}>
            Reset database
          </Button>
        </div>
      </header>

      {lab.notice && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Alert tone="warn">{lab.notice}</Alert></div>
          <Button onClick={() => lab.setNotice(null)} aria-label="Dismiss notice">Dismiss</Button>
        </div>
      )}

      <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(320px,440px)]">
        <aside className="space-y-4">
          <SchemaBuilder lab={lab} />
          <SeedPanel lab={lab} />
          <Sidebar lab={lab} />
        </aside>
        <div className="min-w-0 space-y-4">
          <SqlEditor lab={lab} />
          <ResultsTable query={lab.query} />
        </div>
        <div className="min-w-0 lg:col-span-2 xl:col-span-1"><PlanPanel lab={lab} /></div>
      </main>

      <footer className="text-xs text-zinc-600">
        Everything runs in your browser; SQL, schemas and data never leave this page. PostgreSQL support is planned as a separate isolated backend.
      </footer>
    </div>
  );
}
