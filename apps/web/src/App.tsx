import { useEffect, useState } from 'react';
import { useLab } from './hooks/useLab';
import { decodeShare } from './domain/experiment';
import { ExperimentsMenu } from './components/ExperimentsMenu';
import { QueryWorkspace } from './components/QueryWorkspace';
import { SchemaView } from './components/SchemaView';
import { SeedPanel } from './components/SeedPanel';
import { Sidebar } from './components/Sidebar';
import { Alert, Button, Tabs, type TabItem } from './components/ui';

type View = 'workspace' | 'schema';
type Page = 'query' | 'seed';
const VIEWS: readonly TabItem<View>[] = [{ id: 'workspace', label: 'Workspace' }, { id: 'schema', label: 'Schema' }];

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#13786c" strokeWidth="1.8" aria-hidden>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" /><path d="M4.5 5.5v6.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5.5" /><path d="M4.5 12v6.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V12" />
    </svg>
  );
}

export function App() {
  const lab = useLab();
  const { info, loadExperiment, setNotice } = lab;
  const [view, setView] = useState<View>('workspace');
  const [page, setPage] = useState<Page>('query');
  const [drawer, setDrawer] = useState(false);

  const open = (v: View, p: Page = 'query') => { setView(v); setPage(p); setDrawer(false); };

  // A share link carries a definition only. It is validated and loaded into the editors; nothing runs automatically.
  useEffect(() => {
    const code = /^#exp=(.+)$/.exec(location.hash)?.[1];
    if (!code) return;
    history.replaceState(null, '', location.pathname + location.search);
    const p = decodeShare(code);
    if (!p.ok) return setNotice(`Share link rejected: ${p.error}`);
    loadExperiment(p.experiment);
    setView('schema');
    setNotice(`Loaded shared experiment "${p.experiment.name}". Review its schema and SQL, then create, seed and run.`);
  }, [loadExperiment, setNotice]);

  const sidebar = (
    <Sidebar lab={lab} onAddTable={() => { lab.design.add(); open('schema'); }} onSeed={() => open('workspace', 'seed')} onEditSchema={() => open('schema')} />
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-4 pt-2 sm:px-6">
        <div className="flex items-center gap-2 pb-2"><Logo /><span className="text-xl font-bold tracking-tight text-ink">QueryPlan</span></div>
        <Tabs items={VIEWS} value={view} onChange={(v) => open(v)} label="View" />
        <span className="hidden pb-2 font-mono text-xs text-muted md:inline" data-testid="engine-info">
          {info ? `SQLite ${info.version} · WASM · in-memory (cleared on refresh)` : 'Starting SQLite…'}
        </span>
        <div className="ml-auto flex items-center gap-2 pb-2">
          <Button className="lg:hidden" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer}>Database</Button>
          <ExperimentsMenu lab={lab} onLoaded={() => open('schema')} onRan={() => open('workspace')} />
          <Button disabled={lab.busy !== null} onClick={() => { open('workspace'); void lab.runGuided(); }}>Guided example</Button>
        </div>
      </header>

      {lab.notice && (
        <div className="flex items-start gap-2 px-4 pt-3 sm:px-6">
          <div className="flex-1"><Alert tone="warn">{lab.notice}</Alert></div>
          <Button onClick={() => lab.setNotice(null)} aria-label="Dismiss notice">Dismiss</Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view === 'workspace' && <aside aria-label="Database" className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>}
        {view === 'workspace' && drawer && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <aside aria-label="Database drawer" className="w-72 max-w-[85vw] overflow-auto bg-surface shadow-xl">{sidebar}</aside>
            <button aria-label="Close database drawer" className="flex-1 bg-ink/30" onClick={() => setDrawer(false)} />
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {view === 'schema' && <SchemaView lab={lab} onNext={() => open('workspace', 'seed')} />}
          {view === 'workspace' && (page === 'seed' ? <SeedPanel lab={lab} onBack={() => setPage('query')} /> : <QueryWorkspace lab={lab} />)}
        </main>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface px-4 py-2 text-xs text-muted sm:px-6">
        <span>Runs locally in your browser</span><span aria-hidden>|</span><span>In-memory · refresh clears data</span>
        <span className="ml-auto">SQL, schemas and data never leave this page. PostgreSQL support is planned as a separate isolated backend.</span>
      </footer>
    </div>
  );
}
