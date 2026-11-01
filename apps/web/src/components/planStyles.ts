import type { AccessKind } from '../domain/explain';

/** Badge label and Tailwind classes per access kind. */
export const BADGE: Record<AccessKind, [string, string]> = {
  scan: ['SCAN', 'bg-warn-soft text-warn-ink'],
  'index-search': ['INDEX', 'bg-ok-soft text-ok-ink'],
  'rowid-search': ['KEY', 'bg-ok-soft text-ok-ink'],
  'covering-index': ['COVERING', 'bg-ok-soft text-ok-ink'],
  'temp-structure': ['TEMP', 'bg-info-soft text-info-ink'],
  other: ['STEP', 'bg-subtle text-ink-soft'],
};

/** SVG stroke colors per access kind (graph view). */
export const KIND_COLOR: Record<AccessKind, string> = {
  scan: '#b7791f',
  'index-search': '#1d6b3a',
  'rowid-search': '#1d6b3a',
  'covering-index': '#1d6b3a',
  'temp-structure': '#1c4f82',
  other: '#5b6676',
};
