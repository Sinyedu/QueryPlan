import type { Lab } from '../hooks/useLab';
import { Designer } from './designer/Designer';
import { SchemaBuilder } from './SchemaBuilder';
import { Button, Panel } from './ui';

/** Full-page schema designer: a large diagram on the left, the selected table's editor on the right. */
export function DesignerView({ lab, onOpenLab }: { lab: Lab; onOpenLab: () => void }) {
  return (
    <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="min-w-0"><Designer lab={lab} /></div>
      <aside className="space-y-4">
        <SchemaBuilder lab={lab} />
        <Panel title="Next">
          <p className="text-xs text-zinc-500">Create the tables here, then seed them and run queries in the Lab. Your diagram and settings are kept when you switch.</p>
          <div className="mt-2"><Button variant="primary" onClick={onOpenLab}>Open the Lab →</Button></div>
        </Panel>
      </aside>
    </main>
  );
}
