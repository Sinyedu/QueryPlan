import { useRef, useState } from 'react';
import { EXAMPLES } from '../domain/examples';
import { encodeShare, parseExperiment, serializeExperiment, type Experiment } from '../domain/experiment';
import { useExperiments } from '../hooks/useExperiments';
import type { Lab } from '../hooks/useLab';
import { Alert, Button, Menu, inputCls } from './ui';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'experiment'}.queryplan.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const heading = 'mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted';

/** Header dropdown: save, load, run, import/export and share experiment definitions (never row data). */
export function ExperimentsMenu({ lab, onLoaded, onRan }: { lab: Lab; onLoaded: () => void; onRan: () => void }) {
  return <Menu label="Experiments" width={380}>{(close) => <Body lab={lab} onLoad={() => { onLoaded(); close(); }} onRun={() => { onRan(); close(); }} />}</Menu>;
}

function Body({ lab, onLoad, onRun }: { lab: Lab; onLoad: () => void; onRun: () => void }) {
  const store = useExperiments();
  const [name, setName] = useState('My experiment');
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const idle = lab.busy === null;

  const importText = (text: string) => {
    const p = parseExperiment(text);
    if (!p.ok) return setMsg({ tone: 'error', text: `Import rejected: ${p.error}` });
    lab.loadExperiment(p.experiment);
    setName(p.experiment.name);
    setMsg({ tone: 'info', text: `Loaded "${p.experiment.name}". Review the schema and SQL, then create, seed and run.` });
  };

  const share = async () => {
    const link = `${location.origin}${location.pathname}#exp=${encodeShare(lab.toExperiment(name || 'Shared experiment'))}`;
    try { await navigator.clipboard.writeText(link); setMsg({ tone: 'info', text: 'Link copied. It holds the schema, counts, seed and SQL only: no row data.' }); }
    catch { setMsg({ tone: 'info', text: link }); }
  };

  const row = (e: Experiment, deletable: boolean) => (
    <li key={e.name} className="flex items-center gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate" title={e.name}>{e.name}</span>
      <button className="font-medium text-accent hover:underline disabled:opacity-40" disabled={!idle} onClick={() => { lab.loadExperiment(e); onLoad(); }}>load</button>
      <button className="font-medium text-accent hover:underline disabled:opacity-40" disabled={!idle} onClick={() => { void lab.runExperiment(e); onRun(); }}>run</button>
      {deletable && <button aria-label={`Delete ${e.name}`} className="text-muted hover:text-danger" onClick={() => store.remove(e.name)}>✕</button>}
    </li>
  );

  return (
    <div>
      <div className="flex gap-2">
        <input aria-label="Experiment name" className={`${inputCls} min-w-0 flex-1`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Button disabled={name.trim() === ''} onClick={() => { store.save(lab.toExperiment(name.trim())); setMsg({ tone: 'info', text: 'Saved in this browser (definition only, not row data).' }); }}>Save</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => download(name, serializeExperiment(lab.toExperiment(name.trim() || 'experiment')))}>Export</Button>
        <Button size="sm" onClick={() => file.current?.click()}>Import…</Button>
        <Button size="sm" onClick={() => void share()}>Copy share link</Button>
        <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Import experiment file"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importText(f.size > 200_000 ? '' : await f.text()); }} />
      </div>
      {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {store.storageError && <div className="mt-2"><Alert tone="warn">{store.storageError}</Alert></div>}
      <h3 className={heading}>Examples (synthetic data)</h3>
      <ul className="mt-1.5 space-y-1.5">{EXAMPLES.map((e) => row(e, false))}</ul>
      <h3 className={heading}>Saved in this browser</h3>
      {store.saved.length === 0 ? <p className="mt-1 text-sm text-muted">Nothing saved yet.</p> : <ul className="mt-1.5 space-y-1.5">{store.saved.map((e) => row(e, true))}</ul>}
      <p className="mt-3 text-xs text-muted">&quot;load&quot; fills the editors only; &quot;run&quot; creates, seeds and runs the experiment. Experiments hold no data: it is regenerated from the seed.</p>
    </div>
  );
}
