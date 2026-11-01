import type { AccessKind } from '../domain/explain';

/** Badge label and Tailwind classes per access kind. */
export const BADGE: Record<AccessKind, [string, string]> = {
  scan: ['SCAN', 'bg-amber-900/60 text-amber-200'],
  'index-search': ['INDEX', 'bg-emerald-900/60 text-emerald-200'],
  'rowid-search': ['KEY', 'bg-emerald-900/60 text-emerald-200'],
  'covering-index': ['COVERING', 'bg-emerald-900/60 text-emerald-200'],
  'temp-structure': ['TEMP', 'bg-violet-900/60 text-violet-200'],
  other: ['STEP', 'bg-zinc-800 text-zinc-300'],
};

/** SVG fill/stroke colors per access kind (graph view). */
export const KIND_COLOR: Record<AccessKind, string> = {
  scan: '#f59e0b',
  'index-search': '#10b981',
  'rowid-search': '#10b981',
  'covering-index': '#10b981',
  'temp-structure': '#8b5cf6',
  other: '#71717a',
};
