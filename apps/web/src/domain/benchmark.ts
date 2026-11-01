/** Timing summaries. These are measured wall-clock times, never planner estimates. */

export interface TimingSummary {
  runs: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
  /** Executions averaged into each sample (finer resolution than the browser timer allows for one run). */
  repsPerSample: number;
}

export const BENCH_RUNS = 5;

/** Target total time per sample; fast queries are repeated so the timer's ~0.1 ms resolution matters less. */
export const TARGET_SAMPLE_MS = 10;
export const MAX_REPS = 200;

export function repsFor(warmupMs: number): number {
  return Math.min(MAX_REPS, Math.max(1, Math.ceil(TARGET_SAMPLE_MS / Math.max(warmupMs, 0.01))));
}

export function summarizeTimes(samples: readonly number[], repsPerSample = 1): TimingSummary {
  if (samples.length === 0) throw new Error('No timing samples.');
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { runs: sorted.length, minMs: sorted[0]!, medianMs: median, maxMs: sorted[sorted.length - 1]!, repsPerSample };
}

export function formatMs(ms: number): string {
  return ms < 1 ? `${ms.toFixed(2)} ms` : ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

/** Only single read-only statements are safe to repeat for benchmarking. */
export function isBenchmarkable(sql: string): boolean {
  const s = sql.trim().replace(/;+\s*$/, '');
  return /^(select|with)\b/i.test(s) && !s.includes(';');
}
