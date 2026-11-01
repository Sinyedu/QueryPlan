/** Timing summaries. These are measured wall-clock times, never planner estimates. */

export interface TimingSummary {
  runs: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
}

export const BENCH_RUNS = 5;

export function summarizeTimes(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) throw new Error('No timing samples.');
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { runs: sorted.length, minMs: sorted[0]!, medianMs: median, maxMs: sorted[sorted.length - 1]! };
}

export function formatMs(ms: number): string {
  return ms < 1 ? `${ms.toFixed(2)} ms` : ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

/** Only single read-only statements are safe to repeat for benchmarking. */
export function isBenchmarkable(sql: string): boolean {
  const s = sql.trim().replace(/;+\s*$/, '');
  return /^(select|with)\b/i.test(s) && !s.includes(';');
}
