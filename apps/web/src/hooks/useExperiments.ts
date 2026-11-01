import { useCallback, useState } from 'react';
import { parseExperiment, serializeExperiment, type Experiment } from '../domain/experiment';

const KEY = 'queryplan.experiments.v1';

/** Reads saved definitions; each one is re-validated because storage is untrusted. Storage may be blocked. */
function load(): Experiment[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const p = parseExperiment(JSON.stringify(item));
      return p.ok ? [p.experiment] : [];
    });
  } catch {
    return [];
  }
}

/** Saved experiment definitions in localStorage (definitions only: no row data, nothing leaves the browser). */
export function useExperiments() {
  const [saved, setSaved] = useState<Experiment[]>(load);
  const [storageError, setStorageError] = useState<string | null>(null);

  const persist = useCallback((next: Experiment[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next.map((e) => JSON.parse(serializeExperiment(e)))));
      setStorageError(null);
    } catch {
      setStorageError('Browser storage is unavailable, so this list will not survive a reload.');
    }
    setSaved(next);
  }, []);

  const save = useCallback((e: Experiment) => persist([...saved.filter((s) => s.name !== e.name), e]), [saved, persist]);
  const remove = useCallback((name: string) => persist(saved.filter((s) => s.name !== name)), [saved, persist]);
  return { saved, save, remove, storageError };
}
