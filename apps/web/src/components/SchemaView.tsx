import { useState } from 'react';
import type { Lab } from '../hooks/useLab';
import { Designer } from './designer/Designer';
import { SchemaBuilder } from './SchemaBuilder';
import { Button, Tabs, type TabItem } from './ui';

type Mode = 'diagram' | 'editor';
const MODES: readonly TabItem<Mode>[] = [{ id: 'diagram', label: 'Diagram' }, { id: 'editor', label: 'Table editor' }];

/** Schema page: diagram plus the "Edit table" inspector (stacked on narrow screens), or the inspector alone. */
export function SchemaView({ lab, onNext }: { lab: Lab; onNext: () => void }) {
  const [mode, setMode] = useState<Mode>('diagram');
  const { design, tables } = lab;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Schema designer</h1>
          <p className="text-ink-soft">Create tables and connect their columns.</p>
        </div>
        <Tabs items={MODES} value={mode} onChange={setMode} label="Schema layout" className="rounded-md border border-line-strong bg-surface p-0.5 [&>button]:!mb-0 [&>button]:rounded [&>button]:!border-0 [&>button[aria-selected=true]]:bg-accent-soft" />
        <Button onClick={design.add} disabled={tables.length >= 6}>+ Table</Button>
        <Button onClick={design.resetLayout}>Auto-arrange</Button>
      </div>
      <div className={mode === 'diagram' ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]' : 'mx-auto max-w-2xl'}>
        {mode === 'diagram' && <Designer lab={lab} />}
        <SchemaBuilder lab={lab} onNext={onNext} />
      </div>
    </div>
  );
}
