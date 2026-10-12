import { DowngradeNotAllowedError } from './driver';
export { DowngradeNotAllowedError } from './driver';
import { SCHEMA_VERSION, SCHEMA_TABLES_SQL, SCHEMA_INDEXES_SQL, SCHEMA_TRIGGERS_SQL, SCHEMA_VIEWS_SQL } from './schema';


/** Split SQL on statement terminators without breaking SQLite trigger bodies.
 * A trigger may contain several semicolons between BEGIN and END.
 */
function stripLeadingSqlComments(statement: string): string {
  let result = statement.trim();
  while (result.startsWith('--')) {
    const newline = result.indexOf('\n');
    if (newline < 0) return '';
    result = result.slice(newline + 1).trim();
  }
  while (result.startsWith('/*')) {
    const end = result.indexOf('*/');
    if (end < 0) return '';
    result = result.slice(end + 2).trim();
  }
  return result;
}

export function splitMigrationStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let triggerBody = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    buffer += ch;

    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (ch === '*' && next === '/') { buffer += next; i++; inBlockComment = false; } continue; }
    if (!inSingle && !inDouble && !inBacktick && ch === '-' && next === '-') { buffer += next; i++; inLineComment = true; continue; }
    if (!inSingle && !inDouble && !inBacktick && ch === '/' && next === '*') { buffer += next; i++; inBlockComment = true; continue; }
    if (ch === "'" && !inDouble && !inBacktick) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inBacktick) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inBacktick = !inBacktick; continue; }
    if (inSingle || inDouble || inBacktick) continue;

    if (!triggerBody && /CREATE\s+TRIGGER\b/i.test(buffer)) triggerBody = true;
    if (ch === ';') {
      if (triggerBody) {
        const beforeTerminator = buffer.slice(0, -1).trim();
        if (/\bEND\s*$/i.test(beforeTerminator)) {
          statements.push(stripLeadingSqlComments(buffer));
          buffer = '';
          triggerBody = false;
        }
      } else {
        statements.push(stripLeadingSqlComments(buffer));
        buffer = '';
      }
    }
  }
  if (buffer.trim()) statements.push(stripLeadingSqlComments(buffer));
  return statements.filter(Boolean);
}

export interface MigrationResult {
  previousVersion: number;
  newVersion: number;
  safetyBackup?: Uint8Array;
}


type MigrationConnection = {
  migrationIdentity?: object;
  exec?: (sql: string, params?: any[]) => Promise<void>;
  execute?: (sql: string, params?: any[]) => Promise<void>;
  query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = Record<string, any>>(sql: string, params?: any[]): Promise<T | null>;
  transaction<T>(fn: (tx: MigrationConnection) => Promise<T>): Promise<T>;
  exportDatabase?: () => Promise<Uint8Array>;
  persistSafetyBackup?: (bytes: Uint8Array) => Promise<unknown>;
};

async function execSql(tx: MigrationConnection, sql: string, params?: any[]): Promise<void> {
  if (typeof tx.exec === 'function') return tx.exec(sql, params);
  if (typeof tx.execute === 'function') return tx.execute(sql, params);
  throw new Error('Migration connection does not support SQL execution');
}

async function exportSafetyBackup(driver: MigrationConnection): Promise<Uint8Array | undefined> {
  // Only a raw SQLite database image qualifies as a migration safety backup.
  return driver.exportDatabase ? driver.exportDatabase() : undefined;
}

async function addColumnIfMissing(
  tx: MigrationConnection,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): Promise<void> {
  const columns = await tx.query<{ name: string }>(`PRAGMA table_info(${tableName});`);
  if (!columns.some((column) => column.name === columnName)) {
    await execSql(tx, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  }
}

export async function getCurrentSchemaVersion(driver: MigrationConnection): Promise<number> {
  let pragmaVersion = 0;
  try {
    const res = await driver.queryOne<{ user_version: number }>('PRAGMA user_version;');
    if (res && res.user_version !== undefined) pragmaVersion = Number(res.user_version);
  } catch {
    // Some compatibility adapters do not implement PRAGMA user_version.
  }
  if (pragmaVersion > 0) return pragmaVersion;

  // Older v1 builds only wrote schema_version and left PRAGMA user_version at 0.
  try {
    const row = await driver.queryOne<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;'
    );
    return row ? Number(row.version) : pragmaVersion;
  } catch {
    return pragmaVersion;
  }
}

async function runMigrationsOnce(
  driver: MigrationConnection,
  targetVersion: number = SCHEMA_VERSION
): Promise<MigrationResult> {
  const currentVersion = await getCurrentSchemaVersion(driver);

  if (targetVersion < currentVersion) {
    throw new DowngradeNotAllowedError(currentVersion, targetVersion);
  }

  // A same-version launch is a strict no-op: do not export or persist the database.
  if (currentVersion === targetVersion) {
    return { previousVersion: currentVersion, newVersion: currentVersion };
  }

  // Persist a raw SQLite image outside application tables before changing an existing DB.
  // A failed backup aborts the migration rather than silently risking the user's records.
  let safetyBackup: Uint8Array | undefined;
  if (currentVersion > 0 && targetVersion > currentVersion) {
    safetyBackup = await exportSafetyBackup(driver);
    if (!safetyBackup?.byteLength) {
      throw new Error('Cannot safely migrate an existing database: SQLite safety backup export failed.');
    }
    if (!driver.persistSafetyBackup) {
      throw new Error('Cannot safely migrate an existing database: persistent safety-backup storage is unavailable.');
    }
    await driver.persistSafetyBackup(safetyBackup);
  }

  // Run the schema upgrade inside one transaction. Existing pre-release v1
  // databases need additive columns before the new indexes and triggers can be created.
  await driver.transaction(async (tx: MigrationConnection) => {
    const tableStatements = splitMigrationStatements(SCHEMA_TABLES_SQL);
    for (const statement of tableStatements) await execSql(tx, `${statement};`);

    if (currentVersion === 1 && targetVersion >= 2) {
      await addColumnIfMissing(tx, 'products', 'product_kind', "TEXT NOT NULL DEFAULT 'standard' CHECK (product_kind IN ('standard', 'variant_parent', 'variant', 'unique_piece'))");
      await addColumnIfMissing(tx, 'products', 'parent_product_id', 'TEXT REFERENCES products(id)');
      await addColumnIfMissing(tx, 'products', 'variant_attributes_json', 'TEXT');
      await addColumnIfMissing(tx, 'products', 'artisan_id', 'TEXT REFERENCES artisans(id)');
      await addColumnIfMissing(tx, 'products', 'unique_piece_code', 'TEXT');
      await addColumnIfMissing(tx, 'changes', 'hlc', "TEXT NOT NULL DEFAULT '0:0:legacy'");
      await addColumnIfMissing(tx, 'changes', 'origin_device_id', "TEXT NOT NULL DEFAULT 'legacy'");
      await addColumnIfMissing(tx, 'changes', 'user_id', 'TEXT');
      // Backfill origin metadata deterministically for old change rows.
      const legacyChanges = await tx.query<{ id: string; device_id: string; origin_device_id?: string; hlc?: string }>(
        'SELECT id, device_id, origin_device_id, hlc FROM changes;'
      );
      for (const change of legacyChanges) {
        const origin = !change.origin_device_id || change.origin_device_id === 'legacy' ? change.device_id : change.origin_device_id;
        const hlc = !change.hlc ? `0:0:${change.device_id}` : change.hlc;
        if (origin !== change.origin_device_id || hlc !== change.hlc) {
          await execSql(tx, 'UPDATE changes SET origin_device_id = ?, hlc = ? WHERE id = ?;', [origin, hlc, change.id]);
        }
      }
      // CREATE VIEW IF NOT EXISTS cannot replace a pre-release view definition.
      await execSql(tx, 'DROP VIEW IF EXISTS stock_on_hand;');
      await execSql(tx, 'DROP VIEW IF EXISTS customer_dues;');
      await execSql(tx, 'DROP VIEW IF EXISTS stock_valuation;');
    }

    if (currentVersion < 3 && targetVersion >= 3) {
      await addColumnIfMissing(tx, 'backups_log', 'file_name', 'TEXT');
    }

    const postTableSql = `${SCHEMA_INDEXES_SQL}\n${SCHEMA_TRIGGERS_SQL}\n${SCHEMA_VIEWS_SQL}`;
    for (const statement of splitMigrationStatements(postTableSql)) await execSql(tx, `${statement};`);

    const appliedAt = new Date().toISOString();
    await execSql(
      tx,
      'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?);',
      [targetVersion, appliedAt, `Migrated to schema v${targetVersion}`]
    );
    await execSql(tx, `PRAGMA user_version = ${targetVersion};`);
  });

  return {
    previousVersion: currentVersion,
    newVersion: targetVersion,
    safetyBackup,
  };
}


// Multiple legacy service/repository facades can initialize concurrently. Coordinate
// their migrations by the shared underlying database identity, but only while a
// migration is in flight so later explicit migration checks still read live schema state.
const inFlightMigrations = new WeakMap<object, Map<number, Promise<MigrationResult>>>();

export function runMigrations(
  driver: MigrationConnection,
  targetVersion: number = SCHEMA_VERSION
): Promise<MigrationResult> {
  const identity = driver.migrationIdentity ?? driver;
  let byVersion = inFlightMigrations.get(identity);
  if (!byVersion) {
    byVersion = new Map<number, Promise<MigrationResult>>();
    inFlightMigrations.set(identity, byVersion);
  }
  const existing = byVersion.get(targetVersion);
  if (existing) return existing;

  const migration = runMigrationsOnce(driver, targetVersion);
  byVersion.set(targetVersion, migration);
  const cleanup = () => {
    if (byVersion?.get(targetVersion) === migration) byVersion.delete(targetVersion);
    if (byVersion?.size === 0) inFlightMigrations.delete(identity);
  };
  migration.then(cleanup, cleanup);
  return migration;
}
