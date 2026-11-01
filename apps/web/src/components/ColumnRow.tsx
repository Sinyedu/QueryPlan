import {
  COLUMN_TYPES, DISTRIBUTIONS, DISTRIBUTION_GENERATORS, GENERATOR_KINDS, referenceTargets,
  type ColumnDef, type TableDef,
} from '../domain/schema';
import { inputCls } from './ui';

interface Props {
  col: ColumnDef;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ColumnDef>) => void;
  onPrimaryKey: (on: boolean) => void;
  onRemove: () => void;
}

/** Compact grid row: name, type, key. Generator, distribution and references live in ColumnDetails. */
export function ColumnRow({ col, index, selected, onSelect, onChange, onPrimaryKey, onRemove }: Props) {
  const n = index + 1;
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_6rem_7.5rem_auto] items-center gap-1.5 rounded-md p-1 ${selected ? 'bg-accent-soft' : ''}`}>
      <input aria-label={`Column ${n} name`} className={`${inputCls} min-w-0 font-mono`} value={col.name} onFocus={onSelect}
        onChange={(e) => onChange({ name: e.target.value })} spellCheck={false} />
      <select aria-label={`Column ${n} type`} className={inputCls} value={col.type} onFocus={onSelect}
        onChange={(e) => onChange({ type: e.target.value as ColumnDef['type'] })}>
        {COLUMN_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <select aria-label={`Column ${n} key`} className={inputCls} value={col.primaryKey ? 'pk' : col.generator === 'foreignKey' ? 'fk' : 'none'} onFocus={onSelect}
        disabled={col.generator === 'foreignKey'} onChange={(e) => onPrimaryKey(e.target.value === 'pk')}>
        <option value="none">None</option>
        <option value="pk">Primary key</option>
        {col.generator === 'foreignKey' && <option value="fk">Foreign key</option>}
      </select>
      <button aria-label={`Remove column ${col.name || n}`} title="Remove column" className="rounded px-1.5 py-1 text-muted hover:bg-danger-soft hover:text-danger" onClick={onRemove}>✕</button>
    </li>
  );
}

/** Settings for the selected column: how its data is generated, how values are distributed, what it references. */
export function ColumnDetails({ col, index, tableName, allTables, onChange }: { col: ColumnDef; index: number; tableName: string; allTables: readonly TableDef[]; onChange: (patch: Partial<ColumnDef>) => void }) {
  const n = index + 1;
  const targets = referenceTargets(allTables, tableName);
  const refKey = (r: { table: string; column: string }) => `${r.table}.${r.column}`;
  const setGenerator = (generator: ColumnDef['generator']) => {
    if (generator === 'foreignKey') onChange({ generator, type: 'INTEGER', primaryKey: false, references: col.references ?? targets[0] });
    else onChange({ generator, references: undefined });
  };
  const row = 'grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-sm text-ink-soft';

  return (
    <div className="space-y-2">
      <label className={row}>Generator
        <select aria-label={`Column ${n} data generator`} className={inputCls} value={col.generator} onChange={(e) => setGenerator(e.target.value as ColumnDef['generator'])}>
          {GENERATOR_KINDS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      {DISTRIBUTION_GENERATORS.includes(col.generator) && (
        <label className={row}>Distribution
          <select aria-label={`Column ${n} distribution`} className={inputCls} value={col.distribution ?? 'uniform'}
            onChange={(e) => onChange({ distribution: e.target.value as ColumnDef['distribution'] })}>
            {DISTRIBUTIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      )}
      {col.distribution === 'skewed' && DISTRIBUTION_GENERATORS.includes(col.generator) && <p className="text-xs text-muted">A few values dominate.</p>}
      {col.generator === 'foreignKey' && (
        <label className={row}>References
          <select aria-label={`Column ${n} references`} className={inputCls} value={col.references ? refKey(col.references) : ''}
            onChange={(e) => onChange({ references: targets.find((t) => refKey(t) === e.target.value) })}>
            <option value="">(choose parent)</option>
            {targets.map((t) => <option key={refKey(t)}>{refKey(t)}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
