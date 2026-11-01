import {
  COLUMN_TYPES, DISTRIBUTIONS, DISTRIBUTION_GENERATORS, GENERATOR_KINDS, referenceTargets,
  type ColumnDef, type TableDef,
} from '../domain/schema';
import { inputCls } from './ui';

interface Props {
  col: ColumnDef;
  index: number;
  tableName: string;
  allTables: readonly TableDef[];
  onChange: (patch: Partial<ColumnDef>) => void;
  onPrimaryKey: (on: boolean) => void;
  onRemove: () => void;
}

const refKey = (r: { table: string; column: string }) => `${r.table}.${r.column}`;

export function ColumnRow({ col, index, tableName, allTables, onChange, onPrimaryKey, onRemove }: Props) {
  const n = index + 1;
  const targets = referenceTargets(allTables, tableName);

  const setGenerator = (generator: ColumnDef['generator']) => {
    if (generator === 'foreignKey') onChange({ generator, type: 'INTEGER', primaryKey: false, references: col.references ?? targets[0] });
    else onChange({ generator, references: undefined });
  };

  return (
    <li className="space-y-1">
      <div className="grid grid-cols-[1fr_6.5rem] gap-1 sm:grid-cols-[1fr_6.5rem_6.5rem_auto_auto]">
        <input aria-label={`Column ${n} name`} className={`${inputCls} min-w-0 font-mono`} value={col.name}
          onChange={(e) => onChange({ name: e.target.value })} spellCheck={false} />
        <select aria-label={`Column ${n} type`} className={inputCls} value={col.type}
          onChange={(e) => onChange({ type: e.target.value as ColumnDef['type'] })}>
          {COLUMN_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label={`Column ${n} data generator`} className={inputCls} value={col.generator}
          onChange={(e) => setGenerator(e.target.value as ColumnDef['generator'])}>
          {GENERATOR_KINDS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input type="checkbox" checked={col.primaryKey} disabled={col.generator === 'foreignKey'} onChange={(e) => onPrimaryKey(e.target.checked)} />
          PK
        </label>
        <button aria-label={`Remove column ${col.name || n}`} className="px-1 text-zinc-500 hover:text-red-400" onClick={onRemove}>✕</button>
      </div>

      {(col.generator === 'foreignKey' || DISTRIBUTION_GENERATORS.includes(col.generator)) && (
        <div className="flex flex-wrap items-center gap-2 pl-1 text-xs text-zinc-400">
          {col.generator === 'foreignKey' && (
            <label className="flex items-center gap-1">references
              <select aria-label={`Column ${n} references`} className={inputCls} value={col.references ? refKey(col.references) : ''}
                onChange={(e) => onChange({ references: targets.find((t) => refKey(t) === e.target.value) })}>
                <option value="">(choose parent)</option>
                {targets.map((t) => <option key={refKey(t)}>{refKey(t)}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1">distribution
            <select aria-label={`Column ${n} distribution`} className={inputCls} value={col.distribution ?? 'uniform'}
              onChange={(e) => onChange({ distribution: e.target.value as ColumnDef['distribution'] })}>
              {DISTRIBUTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          {col.distribution === 'skewed' && <span className="text-zinc-500">a few values dominate</span>}
        </div>
      )}
    </li>
  );
}
