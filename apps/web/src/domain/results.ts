/** Result display limits. The user chooses how many rows to materialize; these bound that choice. */

export const DEFAULT_ROW_LIMIT = 200;
export const MIN_ROW_LIMIT = 1;
/** Hard ceiling: protects the tab from a mistyped limit. Rows beyond it are still counted, just not returned. */
export const MAX_ROW_LIMIT = 5_000;
/** Approximate cap on the data returned from the worker, regardless of the row limit (wide rows add up fast). */
export const MAX_RESULT_BYTES = 8_000_000;
/** Longest cell text returned before truncation. */
export const MAX_CELL_CHARS = 2_000;

export const ROW_LIMIT_PRESETS = [50, 200, 500, 1_000, 2_000, 5_000] as const;

/** Clamp a user-supplied row limit to [MIN, MAX]; non-numbers fall back to the default. */
export function clampRowLimit(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_ROW_LIMIT;
  return Math.min(MAX_ROW_LIMIT, Math.max(MIN_ROW_LIMIT, Math.round(n)));
}

/** Rough size of one returned row (characters plus a small per-cell overhead); used for the byte budget. */
export function estimateRowBytes(cells: readonly (string | number | null)[]): number {
  let n = 0;
  for (const c of cells) n += typeof c === 'string' ? c.length + 8 : 8;
  return n;
}
