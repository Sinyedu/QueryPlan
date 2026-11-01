/** Parse SQLite `EXPLAIN QUERY PLAN` rows. SQLite gives only id/parent/notused/detail: no costs, no timings. */

export interface RawPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export type AccessKind = 'scan' | 'index-search' | 'rowid-search' | 'covering-index' | 'temp-structure' | 'other';

export interface PlanNode {
  id: number;
  parent: number;
  /** Raw detail string, preserved verbatim. */
  detail: string;
  kind: AccessKind;
  /** Index named in "USING [COVERING] INDEX x", if any. */
  index?: string;
  children: PlanNode[];
}

export function classifyDetail(detail: string): Pick<PlanNode, 'kind' | 'index'> {
  const idx = /USING (?:COVERING )?INDEX (\S+)/.exec(detail)?.[1];
  const base = idx ? { index: idx } : {};
  if (/^SEARCH\b/.test(detail) && /USING (INTEGER )?PRIMARY KEY/.test(detail)) return { kind: 'rowid-search' };
  if (/USING COVERING INDEX/.test(detail)) return { kind: 'covering-index', ...base };
  if (/^SCAN\b/.test(detail)) return { kind: 'scan', ...base };
  if (/^SEARCH\b/.test(detail)) return { kind: 'index-search', ...base };
  if (/TEMP B-TREE|USE TEMP/.test(detail)) return { kind: 'temp-structure' };
  return { kind: 'other' };
}

/** Build a forest using parent ids. Rows whose parent is missing become roots. */
export function parsePlan(rows: readonly RawPlanRow[]): PlanNode[] {
  const nodes = new Map<number, PlanNode>();
  for (const r of rows) nodes.set(r.id, { id: r.id, parent: r.parent, detail: r.detail, children: [], ...classifyDetail(r.detail) });
  const roots: PlanNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parent !== r.id ? nodes.get(r.parent) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export function flattenPlan(roots: readonly PlanNode[], depth = 0): { node: PlanNode; depth: number }[] {
  return roots.flatMap((n) => [{ node: n, depth }, ...flattenPlan(n.children, depth + 1)]);
}

export function planSummary(rows: readonly RawPlanRow[]): string {
  const flat = flattenPlan(parsePlan(rows));
  const scans = flat.filter((f) => f.node.kind === 'scan').length;
  const lookups = flat.filter((f) => ['index-search', 'rowid-search', 'covering-index'].includes(f.node.kind)).length;
  const s = (n: number) => (n === 1 ? '' : 's');
  return `${flat.length} step${s(flat.length)}: ${scans} full scan${s(scans)}, ${lookups} index/key lookup${s(lookups)}`;
}

export const KIND_HELP: Record<AccessKind, string> = {
  scan: 'Reads every row of the table (or index). Work grows with table size.',
  'index-search': 'Descends a B-tree index to matching rows instead of reading everything.',
  'rowid-search': 'Looks up directly by rowid / INTEGER PRIMARY KEY.',
  'covering-index': 'Answers from the index alone, without reading the table.',
  'temp-structure': 'Builds a temporary sort/group structure, typically for ORDER BY, GROUP BY or DISTINCT.',
  other: 'See the raw SQLite detail text.',
};
