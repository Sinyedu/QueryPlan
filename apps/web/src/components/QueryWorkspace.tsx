import { useState } from 'react';
import type { Lab } from '../hooks/useLab';
import { CompareTab, PlanTab } from './PlanPanel';
import { ResultsTable } from './ResultsTable';
import { SqlEditor } from './SqlEditor';
import { Card, Tabs, type TabItem } from './ui';

type Output = 'results' | 'plan' | 'compare';
const TABS: readonly TabItem<Output>[] = [
  { id: 'results', label: 'Results' },
  { id: 'plan', label: 'Query plan' },
  { id: 'compare', label: 'Compare index' },
];

/** SQL editor on top, one output panel below. Switching tabs never reruns SQL. */
export function QueryWorkspace({ lab }: { lab: Lab }) {
  const [tab, setTab] = useState<Output>('results');
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Query workspace</h1>
        <p className="text-ink-soft">Write SQL. See what SQLite does.</p>
      </div>
      <SqlEditor lab={lab} />
      <Card>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Output" className="border-b border-line px-3" />
        <div className="p-4" role="tabpanel">
          {tab === 'results' && <ResultsTable query={lab.query} />}
          {tab === 'plan' && <PlanTab lab={lab} />}
          {tab === 'compare' && <CompareTab lab={lab} />}
        </div>
      </Card>
    </div>
  );
}
