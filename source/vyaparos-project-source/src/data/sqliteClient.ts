/**
 * Database client used by the domain services. Browser sessions use real SQLite
 * WASM in a dedicated worker; the small table-shaped adapter below is retained
 * only for Node-based unit tests. It is never a silent browser fallback.
 */
import type { SqlDriver, SqlRow, SqlValue } from './driver';
import { WorkerDriver } from './worker-driver';
import { SCHEMA_TRIGGERS_SQL } from './schema';
import { splitMigrationStatements } from './migrations';

export interface IDatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T>;
  exportAllData(): Promise<Record<string, unknown[]>>;
  restoreAllData(data: Record<string, unknown[]>): Promise<void>;
  exportDatabase?(): Promise<Uint8Array>;
  persistSafetyBackup?(bytes: Uint8Array): Promise<{ fileName: string; checksum: string; sizeBytes: number }>;
  readLatestSafetyBackup?(): Promise<{ fileName: string; checksum: string; sizeBytes: number; bytes: Uint8Array } | null>;
  restoreDatabaseBytes?(bytes: Uint8Array): Promise<void>;
}

// In-Memory table representation with indexing and persistence
type TableData = Map<string, Record<string, unknown>>;

class SqlDatabase implements IDatabaseClient {
  private tables: Map<string, TableData> = new Map();
  private inTransaction: boolean = false;
  private transactionSnapshot: Map<string, TableData> | null = null;
  private persistenceReady: Promise<void>;

  constructor() {
    this.persistenceReady = this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    // This compatibility adapter is used only by Node tests; browser startup uses WorkerDriver.
    if (typeof indexedDB === 'undefined') return;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open('business_os_opfs_store', 1);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        const openedDb = req.result;
        if (!openedDb.objectStoreNames.contains('tables')) {
          openedDb.createObjectStore('tables');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open local database storage'));
      req.onblocked = () => reject(new Error('Local database upgrade is blocked by another open tab'));
    });

    db.onversionchange = () => db.close();
    try {
      const raw = await new Promise<unknown>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction('tables', 'readonly');
        } catch (error) {
          reject(error);
          return;
        }
        const getReq = tx.objectStore('tables').get('dump');
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error ?? new Error('Could not read local database storage'));
        tx.onabort = () => reject(tx.error ?? new Error('Local database read transaction aborted'));
      });

      if (raw !== undefined && raw !== null) {
        const parsed = JSON.parse(String(raw)) as Record<string, Record<string, unknown>[]>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Local database snapshot has an invalid format');
        }
        for (const [tName, rows] of Object.entries(parsed)) {
          if (!Array.isArray(rows)) throw new Error(`Invalid local database table snapshot: ${tName}`);
          const map = new Map<string, Record<string, unknown>>();
          for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
              throw new Error(`Invalid row in local database table: ${tName}`);
            }
            const record = row as Record<string, unknown>;
            const pk = record.id ?? record.version;
            if (pk === undefined || pk === null) {
              throw new Error(`Missing primary key in local database table: ${tName}`);
            }
            map.set(String(pk), record);
          }
          this.tables.set(tName, map);
        }
      }
    } finally {
      db.close();
    }
  }

  private async saveToStorage(): Promise<void> {
    if (typeof indexedDB === 'undefined' || this.inTransaction) return;

    const dump: Record<string, Record<string, unknown>[]> = {};
    for (const [tName, map] of this.tables.entries()) {
      dump[tName] = Array.from(map.values());
    }
    const json = JSON.stringify(dump);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open('business_os_opfs_store', 1);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        const openedDb = req.result;
        if (!openedDb.objectStoreNames.contains('tables')) {
          openedDb.createObjectStore('tables');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open local database storage for writing'));
      req.onblocked = () => reject(new Error('Local database write is blocked by another open tab'));
    });

    db.onversionchange = () => db.close();
    try {
      await new Promise<void>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction('tables', 'readwrite');
        } catch (error) {
          reject(error);
          return;
        }
        tx.objectStore('tables').put(json, 'dump');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Could not persist local database changes'));
        tx.onabort = () => reject(tx.error ?? new Error('Local database write transaction aborted'));
      });
    } finally {
      db.close();
    }
  }

  private getTable(name: string): TableData {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map<string, Record<string, unknown>>();
      this.tables.set(name, t);
    }
    return t;
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.persistenceReady;
    const trimmed = sql.trim();

    // Batch execution of multiple statements separated by ';'
    const statements = trimmed
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (statements.length > 1) {
      for (const stmt of statements) {
        await this.executeSingle(stmt, []);
      }
      await this.saveToStorage();
      return;
    }

    await this.executeSingle(trimmed, params);
    await this.saveToStorage();
  }

  private async executeSingle(sql: string, params: unknown[]): Promise<void> {
    const s = sql.trim();
    if (!s) return;

    // CREATE TABLE IF NOT EXISTS table_name ...
    const createTableMatch = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      this.getTable(tableName);
      return;
    }

    // CREATE INDEX ...
    if (/^CREATE\s+INDEX/i.test(s)) {
      // Indices tracked automatically in memory
      return;
    }

    // INSERT INTO table (cols) VALUES (...)
    const insertMatch = s.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim().toLowerCase());
      const table = this.getTable(tableName);

      const row: Record<string, unknown> = {};
      let pIdx = 0;
      for (let i = 0; i < cols.length; i++) {
        row[cols[i]] = params[pIdx++];
      }

      const pkCol = cols.includes('id') ? 'id' : cols.includes('version') ? 'version' : cols[0];
      const pk = String(row[pkCol]);
      table.set(pk, row);
      return;
    }

    // UPDATE table SET col1 = ?, ... WHERE ...
    const updateMatch = s.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = this.getTable(tableName);

      const setAssignments = setClause.split(',').map((a) => a.trim());
      let pIdx = 0;
      const updates: Record<string, unknown> = {};
      for (const assign of setAssignments) {
        const [col] = assign.split('=').map((c) => c.trim().toLowerCase());
        updates[col] = params[pIdx++];
      }

      // Remaining params are for WHERE clause
      const whereParams = params.slice(pIdx);
      const rows = this.filterRows(Array.from(table.values()), whereClause, whereParams);

      for (const row of rows) {
        Object.assign(row, updates);
      }
      return;
    }

    // DELETE FROM table WHERE ...
    const deleteMatch = s.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      const whereClause = deleteMatch[2];
      const table = this.getTable(tableName);

      if (!whereClause) {
        table.clear();
      } else {
        const toDelete = this.filterRows(Array.from(table.values()), whereClause, params);
        for (const row of toDelete) {
          const pk = (row.id ?? row.version) as string;
          table.delete(String(pk));
        }
      }
      return;
    }
  }

  public async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.persistenceReady;
    const s = sql.trim();

    // SELECT ... FROM table [WHERE ...] [ORDER BY ...] [LIMIT ...]
    const selectMatch = s.match(
      /SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i
    );

    if (!selectMatch) {
      // Fallback for simple count/aggregates
      return [];
    }

    const selectFields = selectMatch[1].trim();
    const tableName = selectMatch[2].trim();
    const whereClause = selectMatch[3]?.trim();
    const groupByClause = selectMatch[4]?.trim();
    const orderByClause = selectMatch[5]?.trim();
    const limit = selectMatch[6] ? parseInt(selectMatch[6], 10) : undefined;

    const table = this.getTable(tableName);
    let rows = Array.from(table.values()).map((r) => ({ ...r }));

    // Apply WHERE
    if (whereClause) {
      rows = this.filterRows(rows, whereClause, params);
    }

    // Apply Aggregations if any (e.g. SUM(qty_delta), COUNT(*), MAX(sequence_number))
    if (/SUM\(|COUNT\(|MAX\(|MIN\(/i.test(selectFields)) {
      return this.aggregateRows<T>(rows, selectFields, groupByClause);
    }

    // Apply ORDER BY
    if (orderByClause) {
      rows = this.orderRows(rows, orderByClause);
    }

    // Apply LIMIT
    if (limit !== undefined) {
      rows = rows.slice(0, limit);
    }

    // Project fields
    if (selectFields !== '*') {
      const fieldList = selectFields.split(',').map((f) => f.trim().toLowerCase());
      rows = rows.map((r) => {
        const proj: Record<string, unknown> = {};
        for (const f of fieldList) {
          proj[f] = r[f];
        }
        return proj;
      });
    }

    return rows as unknown as T[];
  }

  public async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  private filterRows(
    rows: Record<string, unknown>[],
    whereClause: string,
    params: unknown[]
  ): Record<string, unknown>[] {
    if (!whereClause) return rows;

    // Split on AND (case-insensitive)
    const conditions = whereClause.split(/\s+AND\s+/i);
    let paramIdx = 0;

    return rows.filter((row) => {
      let localParamIdx = 0;
      for (const cond of conditions) {
        const c = cond.trim();

        // IS NULL
        const isNullMatch = c.match(/^([a-zA-Z0-9_]+)\s+IS\s+NULL$/i);
        if (isNullMatch) {
          const col = isNullMatch[1].toLowerCase();
          if (row[col] !== null && row[col] !== undefined) return false;
          continue;
        }

        // IS NOT NULL
        const isNotNullMatch = c.match(/^([a-zA-Z0-9_]+)\s+IS\s+NOT\s+NULL$/i);
        if (isNotNullMatch) {
          const col = isNotNullMatch[1].toLowerCase();
          if (row[col] === null || row[col] === undefined) return false;
          continue;
        }

        // col = ?
        const eqMatch = c.match(/^([a-zA-Z0-9_]+)\s*=\s*\?$/i);
        if (eqMatch) {
          const col = eqMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if (String(row[col]) !== String(target)) return false;
          continue;
        }

        // col != ?
        const neMatch = c.match(/^([a-zA-Z0-9_]+)\s*(?:!=|<>)\s*\?$/i);
        if (neMatch) {
          const col = neMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if (String(row[col]) === String(target)) return false;
          continue;
        }

        // col >= ?
        const gteMatch = c.match(/^([a-zA-Z0-9_]+)\s*>=\s*\?$/i);
        if (gteMatch) {
          const col = gteMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if ((row[col] as number | string) < (target as number | string)) return false;
          continue;
        }

        // col <= ?
        const lteMatch = c.match(/^([a-zA-Z0-9_]+)\s*<=\s*\?$/i);
        if (lteMatch) {
          const col = lteMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if ((row[col] as number | string) > (target as number | string)) return false;
          continue;
        }

        // col > ?
        const gtMatch = c.match(/^([a-zA-Z0-9_]+)\s*>\s*\?$/i);
        if (gtMatch) {
          const col = gtMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if ((row[col] as number | string) <= (target as number | string)) return false;
          continue;
        }

        // col < ?
        const ltMatch = c.match(/^([a-zA-Z0-9_]+)\s*<\s*\?$/i);
        if (ltMatch) {
          const col = ltMatch[1].toLowerCase();
          const target = params[localParamIdx++];
          if ((row[col] as number | string) >= (target as number | string)) return false;
          continue;
        }

        // col LIKE ?
        const likeMatch = c.match(/^([a-zA-Z0-9_]+)\s+LIKE\s+\?$/i);
        if (likeMatch) {
          const col = likeMatch[1].toLowerCase();
          const target = String(params[localParamIdx++] || '');
          const pattern = new RegExp(target.replace(/%/g, '.*'), 'i');
          if (!pattern.test(String(row[col] || ''))) return false;
          continue;
        }
      }
      return true;
    });
  }

  private aggregateRows<T>(
    rows: Record<string, unknown>[],
    selectClause: string,
    groupBy?: string
  ): T[] {
    const countMatch = selectClause.match(/COUNT\(\*\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
    const sumMatch = selectClause.match(/SUM\(([a-zA-Z0-9_]+)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
    const maxMatch = selectClause.match(/MAX\(([a-zA-Z0-9_]+)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);

    if (groupBy) {
      const groupCol = groupBy.trim().toLowerCase();
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) {
        const key = String(r[groupCol]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      const results: Record<string, unknown>[] = [];
      for (const [key, groupRows] of groups.entries()) {
        const item: Record<string, unknown> = { [groupCol]: key };
        if (sumMatch) {
          const col = sumMatch[1].toLowerCase();
          const alias = sumMatch[2]?.toLowerCase() || 'sum';
          item[alias] = groupRows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
        }
        if (countMatch) {
          const alias = countMatch[1]?.toLowerCase() || 'count';
          item[alias] = groupRows.length;
        }
        results.push(item);
      }
      return results as unknown as T[];
    }

    const singleResult: Record<string, unknown> = {};
    if (countMatch) {
      const alias = countMatch[1]?.toLowerCase() || 'count';
      singleResult[alias] = rows.length;
    }
    if (sumMatch) {
      const col = sumMatch[1].toLowerCase();
      const alias = sumMatch[2]?.toLowerCase() || 'sum';
      singleResult[alias] = rows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
    }
    if (maxMatch) {
      const col = maxMatch[1].toLowerCase();
      const alias = maxMatch[2]?.toLowerCase() || 'max';
      singleResult[alias] = rows.reduce((m, r) => Math.max(m, Number(r[col]) || 0), 0);
    }

    return [singleResult] as unknown as T[];
  }

  private orderRows(rows: Record<string, unknown>[], orderByClause: string): Record<string, unknown>[] {
    const parts = orderByClause.split(',').map((p) => p.trim());
    return [...rows].sort((a, b) => {
      for (const part of parts) {
        const [col, dir] = part.split(/\s+/);
        const colName = col.toLowerCase();
        const isDesc = dir && dir.toUpperCase() === 'DESC';

        const valA = a[colName] as number | string;
        const valB = b[colName] as number | string;

        if (valA === valB) continue;
        if (valA === undefined || valA === null) return isDesc ? 1 : -1;
        if (valB === undefined || valB === null) return isDesc ? -1 : 1;

        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
      }
      return 0;
    });
  }

  public async transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    await this.persistenceReady;
    if (this.inTransaction) {
      // Nested transaction: reuse current
      return await fn(this);
    }

    // Create deep snapshot for rollback
    const snapshot = new Map<string, TableData>();
    for (const [tName, map] of this.tables.entries()) {
      const copy = new Map<string, Record<string, unknown>>();
      for (const [k, v] of map.entries()) {
        copy.set(k, { ...v });
      }
      snapshot.set(tName, copy);
    }

    this.inTransaction = true;
    this.transactionSnapshot = snapshot;

    try {
      const result = await fn(this);
      this.inTransaction = false;
      this.transactionSnapshot = null;
      await this.saveToStorage();
      return result;
    } catch (err) {
      // Rollback
      this.tables = snapshot;
      this.inTransaction = false;
      this.transactionSnapshot = null;
      throw err;
    }
  }

  public async exportAllData(): Promise<Record<string, unknown[]>> {
    await this.persistenceReady;
    const exportObj: Record<string, unknown[]> = {};
    for (const [tName, map] of this.tables.entries()) {
      exportObj[tName] = Array.from(map.values()).map((row) => ({ ...row }));
    }
    return exportObj;
  }

  public async restoreAllData(data: Record<string, unknown[]>): Promise<void> {
    await this.persistenceReady;
    this.tables.clear();
    for (const [tName, rows] of Object.entries(data)) {
      const map = new Map<string, Record<string, unknown>>();
      for (const row of rows as Record<string, unknown>[]) {
        const pk = (row.id ?? row.version) as string;
        map.set(String(pk), { ...row });
      }
      this.tables.set(tName, map);
    }
    await this.saveToStorage();
  }
}

/**
 * Bridges the service layer's compatibility interface to the real SQLite driver.
 * Every SQL statement is executed by SQLite; transaction callbacks use the same
 * worker connection so BEGIN/COMMIT/ROLLBACK are genuinely atomic.
 */
export class SqliteWorkerDatabaseClient implements IDatabaseClient {
  constructor(
    private readonly driver: SqlDriver = new WorkerDriver(),
    private readonly rootIdentity: object = driver
  ) {}

  /** Stable identity used to serialize schema migrations across compatibility adapters. */
  get migrationIdentity(): object { return this.rootIdentity; }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.driver.query<T>(sql, params as SqlValue[]);
  }

  queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    return this.driver.queryOne<T>(sql, params as SqlValue[]);
  }

  execute(sql: string, params: unknown[] = []): Promise<void> {
    return this.driver.exec(sql, params as SqlValue[]);
  }

  transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    return this.driver.transaction(async (tx) => fn(new SqliteWorkerDatabaseClient(tx, this.rootIdentity)));
  }

  exportDatabase(): Promise<Uint8Array> {
    return this.driver.exportDatabase();
  }

  async exportAllData(): Promise<Record<string, unknown[]>> {
    const tables = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const result: Record<string, unknown[]> = {};
    for (const { name } of tables) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) continue;
      result[name] = await this.query(`SELECT * FROM \"${name}\"`);
    }
    return result;
  }

  async persistSafetyBackup(bytes: Uint8Array): Promise<{ fileName: string; checksum: string; sizeBytes: number }> {
    if (!this.driver.persistSafetyBackup) throw new Error('Persistent SQLite safety-backup storage is unavailable');
    return this.driver.persistSafetyBackup(bytes);
  }

  async readLatestSafetyBackup(): Promise<{ fileName: string; checksum: string; sizeBytes: number; bytes: Uint8Array } | null> {
    if (!this.driver.readLatestSafetyBackup) throw new Error('Persistent SQLite safety-backup storage is unavailable');
    return this.driver.readLatestSafetyBackup();
  }

  async restoreDatabaseBytes(bytes: Uint8Array): Promise<void> {
    if (!this.driver.restoreDatabaseBytes) throw new Error('Raw SQLite database restore is unavailable');
    await this.driver.restoreDatabaseBytes(bytes);
  }

  async restoreAllData(data: Record<string, unknown[]>): Promise<void> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Backup payload must be a table-to-rows object');
    }
    const knownTables = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    const allowed = new Set(knownTables.map((row) => row.name));
    for (const [table, rows] of Object.entries(data)) {
      if (!allowed.has(table) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        throw new Error(`Backup contains an unknown or invalid table: ${table}`);
      }
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new Error(`Backup contains invalid rows for table: ${table}`);
      }
      const columns = await this.query<{ name: string }>(`PRAGMA table_info("${table}")`);
      const knownColumns = new Set(columns.map((column) => column.name));
      for (const row of rows as Record<string, unknown>[]) {
        const rowColumns = Object.keys(row);
        if (!rowColumns.length || rowColumns.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column) || !knownColumns.has(column))) {
          throw new Error(`Backup contains invalid columns in table: ${table}`);
        }
      }
    }

    // FK checks are disabled only for the duration of a controlled restore, since
    // rows may refer to records inserted later in the same snapshot. Append-only
    // triggers are dropped and recreated inside the same transaction so immutable
    // ledgers can be restored without weakening normal application writes.
    await this.execute('PRAGMA foreign_keys = OFF');
    try {
      await this.transaction(async (tx) => {
        const triggers = await tx.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'"
        );
        for (const { name } of triggers) {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            await tx.execute(`DROP TRIGGER IF EXISTS \"${name}\"`);
          }
        }
        for (const table of [...allowed]) {
          await tx.execute(`DELETE FROM \"${table}\"`);
        }
        for (const [table, rows] of Object.entries(data)) {
          for (const rawRow of rows as Record<string, unknown>[]) {
            const columns = Object.keys(rawRow);
            if (!columns.length || columns.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))) {
              throw new Error(`Backup contains invalid columns in table: ${table}`);
            }
            const placeholders = columns.map(() => '?').join(', ');
            const quotedColumns = columns.map((column) => `\"${column}\"`).join(', ');
            await tx.execute(
              `INSERT INTO \"${table}\" (${quotedColumns}) VALUES (${placeholders})`,
              columns.map((column) => rawRow[column])
            );
          }
        }
        for (const statement of splitMigrationStatements(SCHEMA_TRIGGERS_SQL)) {
          await tx.execute(`${statement};`);
        }
      });
    } finally {
      await this.execute('PRAGMA foreign_keys = ON');
    }
  }
}

// The browser must use SQLite-WASM. The compatibility adapter is only for Node tests.
let dbInstance: IDatabaseClient | null = null;

export function getDatabaseClient(): IDatabaseClient {
  if (!dbInstance) {
    dbInstance = typeof window !== 'undefined' ? new SqliteWorkerDatabaseClient() : new SqlDatabase();
  }
  return dbInstance;
}

export function resetDatabaseClientForTesting(): IDatabaseClient {
  dbInstance = new SqlDatabase();
  return dbInstance;
}
