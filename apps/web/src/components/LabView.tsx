import type { Lab } from '../hooks/useLab';
import { ExperimentsPanel } from './ExperimentsPanel';
import { PlanPanel } from './PlanPanel';
import { ResultsTable } from './ResultsTable';
import { SchemaBuilder } from './SchemaBuilder';
import { SeedPanel } from './SeedPanel';
import { Sidebar } from './Sidebar';
import { SqlEditor } from './SqlEditor';

/** The workbench: schema form, seeding, SQL, results and plans. */
export function LabView({ lab }: { lab: Lab }) {
  return (
    <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)_minmax(320px,440px)]">
      <aside className="space-y-4">
        <SchemaBuilder lab={lab} />
        <SeedPanel lab={lab} />
        <Sidebar lab={lab} />
        <ExperimentsPanel lab={lab} />
      </aside>
      <div className="min-w-0 space-y-4">
        <SqlEditor lab={lab} />
        <ResultsTable query={lab.query} />
      </div>
      <div className="min-w-0 lg:col-span-2 xl:col-span-1"><PlanPanel lab={lab} /></div>
    </main>
  );
}
