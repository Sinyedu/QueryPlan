import { useRef, useState } from 'react';
import { EXAMPLES } from '../domain/examples';
import { encodeShare, parseExperiment, serializeExperiment, type Experiment } from '../domain/experiment';
import { useExperiments } from '../hooks/useExperiments';
import type { Lab } from '../hooks/useLab';
import { Alert, Button, Panel, inputCls } from './ui';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'experiment'}.queryplan.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExperimentsPanel({ lab }: { lab: Lab }) {
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
    <li key={e.name} className="flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate" title={e.name}>{e.name}</span>
      <button className="text-sky-300 hover:underline disabled:opacity-40" disabled={!idle} onClick={() => lab.loadExperiment(e)}>load</button>
      <button className="text-emerald-300 hover:underline disabled:opacity-40" disabled={!idle} onClick={() => void lab.runExperiment(e)}>run</button>
      {deletable && <button aria-label={`Delete ${e.name}`} className="text-zinc-500 hover:text-red-400" onClick={() => store.remove(e.name)}>✕</button>}
    </li>
  );

  return (
    <Panel title="Experiments">
      <div className="flex gap-2">
        <input aria-label="Experiment name" className={`${inputCls} min-w-0 flex-1`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Button disabled={name.trim() === ''} onClick={() => { store.save(lab.toExperiment(name.trim())); setMsg({ tone: 'info', text: 'Saved in this browser (definition only, not row data).' }); }}>Save</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => download(name, serializeExperiment(lab.toExperiment(name.trim() || 'experiment')))}>Export</Button>
        <Button onClick={() => file.current?.click()}>Import…</Button>
        <Button onClick={() => void share()}>Copy share link</Button>
        <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Import experiment file"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importText(f.size > 200_000 ? '' : await f.text()); }} />
      </div>
      {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {store.storageError && <div className="mt-2"><Alert tone="warn">{store.storageError}</Alert></div>}
      <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Examples (synthetic data)</h3>
      <ul className="mt-1 space-y-1">{EXAMPLES.map((e) => row(e, false))}</ul>
      <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Saved in this browser</h3>
      {store.saved.length === 0 ? <p className="mt-1 text-xs text-zinc-500">Nothing saved yet.</p> : <ul className="mt-1 space-y-1">{store.saved.map((e) => row(e, true))}</ul>}
      <p className="mt-2 text-[11px] text-zinc-600">"load" fills the editors only; "run" creates, seeds and runs the experiment. Experiments hold no data: it is regenerated from the seed.</p>
    </Panel>
  );
}
