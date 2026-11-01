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

export interface NodeNote {
  /** Plain-language explanation derived from this node's own detail text. */
  text: string;
}

/**
 * Per-query explanation built only from what SQLite printed for this step (table, index, constraint
 * columns). It describes the access path; it does not claim the plan is fast or slow.
 */
export function describeNode(node: Pick<PlanNode, 'detail' | 'kind' | 'index'>): NodeNote {
  if (/AUTOMATIC (COVERING )?INDEX/.test(node.detail)) {
    return { text: 'SQLite builds a temporary index while running this query because none exists. That cost is paid on every run; a permanent index on the same columns would avoid it.' };
  }
  if (/^CORRELATED (SCALAR )?SUBQUERY/.test(node.detail)) return { text: 'A subquery that depends on the outer row, so it may run once per outer row.' };
  if (/^(SCALAR|LIST) SUBQUERY/.test(node.detail)) return { text: 'A subquery evaluated on its own; SQLite typically runs it once and reuses the result.' };
  if (/^(CO-ROUTINE|MATERIALIZE)/.test(node.detail)) return { text: 'SQLite computes this subquery or view as a separate step and feeds its rows to the outer query.' };
  if (/^MULTI-INDEX OR/.test(node.detail)) return { text: 'An OR condition answered by combining several index lookups.' };
  if (/^(COMPOUND QUERY|UNION|MERGE)/.test(node.detail)) return { text: 'Combines the results of several SELECTs (UNION / INTERSECT / EXCEPT).' };
  const table = /^(?:SCAN|SEARCH)\s+(\S+)/.exec(node.detail)?.[1];
  const constraint = /\(([^()]*)\)\s*$/.exec(node.detail)?.[1];
  const cols = constraint ? [...constraint.matchAll(/(\w+)\s*[=<>]/g)].map((m) => m[1]!) : [];
  const colText = cols.length ? ` on ${[...new Set(cols)].join(', ')}` : '';
  switch (node.kind) {
    case 'scan':
      return { text: `Reads every row of ${table ?? 'the table'}. If a WHERE or JOIN column is selective, an index${table ? ` on ${table}` : ''} could let SQLite skip most rows, though the planner may still choose a scan.` };
    case 'index-search':
      return { text: `Uses index ${node.index ?? ''} to look up matching rows in ${table ?? 'the table'}${colText}, then fetches each row from the table.` };
    case 'rowid-search':
      return { text: `Looks up ${table ?? 'rows'} directly by rowid / INTEGER PRIMARY KEY${colText}.` };
    case 'covering-index':
      return { text: `Reads only index ${node.index ?? ''}; every needed column is stored in it, so ${table ?? 'the table'} itself is not touched.` };
    case 'temp-structure':
      return { text: 'Builds a temporary B-tree to sort or group rows because no existing index provides that order.' };
    default:
      return { text: 'No specific note for this step; read the raw SQLite detail above.' };
  }
}

/**
 * Plan-level reading hints derived only from the plan rows (no statistics, no costs).
 * Top-level steps of a join form nested loops: the first is the outer loop, later ones run once per outer row.
 */
export function planInsights(rows: readonly RawPlanRow[]): string[] {
  const roots = parsePlan(rows);
  const flat = flattenPlan(roots);
  const out: string[] = [];
  const loops = roots.filter((r) => /^(SCAN|SEARCH)\b/.test(r.detail));
  if (loops.length > 1) {
    out.push(`Join: ${loops.length} tables are read as nested loops, in the order listed. Each later step runs once for every row the earlier steps produce.`);
    const innerScan = loops.slice(1).find((n) => n.kind === 'scan');
    if (innerScan) out.push(`"${innerScan.detail}" is a full scan inside a loop, so it repeats for each outer row. This is where an index on the join column usually helps (the planner may still choose otherwise).`);
  }
  if (flat.some((f) => /AUTOMATIC (COVERING )?INDEX/.test(f.node.detail))) {
    out.push('An automatic (temporary) index is built on every run; consider creating a permanent index on those columns.');
  }
  if (flat.some((f) => f.node.kind === 'temp-structure')) {
    out.push('A temporary sort/group structure is used; an index matching the ORDER BY / GROUP BY columns can sometimes remove it.');
  }
  return out;
}
