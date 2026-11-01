/** Built-in, clearly labelled example experiments. All data they produce is synthetic. */
import { DEFAULT_TABLE, type TableDef } from './schema';
import { DEFAULT_SEED, generateRow, tableSeed } from './seeding';
import { EXPERIMENT_VERSION, type Experiment } from './experiment';

const ORDERS: TableDef = {
  name: 'orders',
  columns: [
    { name: 'id', type: 'INTEGER', generator: 'sequence', primaryKey: true },
    { name: 'user_id', type: 'INTEGER', generator: 'foreignKey', primaryKey: false, references: { table: 'users', column: 'id' }, distribution: 'skewed' },
    { name: 'status', type: 'TEXT', generator: 'word', primaryKey: false, distribution: 'skewed' },
    { name: 'total', type: 'REAL', generator: 'decimal', primaryKey: false },
    { name: 'created_at', type: 'TEXT', generator: 'isoDate', primaryKey: false },
  ],
};

/** The 4,243rd user's email: unique, so the lookup returns exactly one row. */
const probeEmail = generateRow(DEFAULT_TABLE.columns, tableSeed(DEFAULT_SEED, 'users'), 4_242)[2] as string;

export const GUIDED_EXAMPLE: Experiment = {
  version: EXPERIMENT_VERSION,
  name: 'Guided: email lookup on users',
  tables: [{ table: DEFAULT_TABLE, rowCount: 5_000 }],
  seed: DEFAULT_SEED,
  sql: `SELECT * FROM users WHERE email = '${probeEmail}'`,
};

export const JOIN_EXAMPLE: Experiment = {
  version: EXPERIMENT_VERSION,
  name: 'Join: orders by user (skewed foreign key)',
  tables: [{ table: DEFAULT_TABLE, rowCount: 2_000 }, { table: ORDERS, rowCount: 10_000 }],
  seed: DEFAULT_SEED,
  sql: 'SELECT o.id, o.status, o.total, u.name\nFROM orders o\nJOIN users u ON u.id = o.user_id\nWHERE o.user_id = 3',
};

export const EXAMPLES: readonly Experiment[] = [GUIDED_EXAMPLE, JOIN_EXAMPLE];
