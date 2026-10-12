import { getDatabaseClient, IDatabaseClient } from './sqliteClient';

/**
 * StorageDatabase compatibility interface. Browser use is backed by the shared
 * SQLite-WASM/OPFS worker; the in-memory implementation below exists for tests.
 */

export interface QueryResult<T = any> {
  rows: T[];
  rowsAffected: number;
}

export interface StorageDatabase {
  execute(sql: string, params?: any[]): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  transaction<T>(fn: (tx: StorageDatabase) => Promise<T>): Promise<T>;
  dumpAllTables(): Promise<Record<string, any[]>>;
  restoreAllTables(tables: Record<string, any[]>): Promise<void>;
  exportAllData?(): Promise<Record<string, any[]>>;
  restoreAllData?(tables: Record<string, any[]>): Promise<void>;
  isPersistent(): Promise<boolean>;
}

export interface ChangeRecordInput {
  table_name: string;
  row_id: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  device_id: string;
}

/**
 * Deterministic in-memory SQL-subset adapter for Node tests only. Never selected
 * as an automatic browser fallback because it is not durable storage or SQLite.
 */
export class MemoryStorageDatabase implements StorageDatabase {
  private tables: Map<string, Map<string, Record<string, any>>> = new Map();
  private inTransaction = false;
  private transactionBackup: Map<string, Map<string, Record<string, any>>> | null = null;

  constructor() {
    this.ensureTables();
  }

  private ensureTables() {
    const knownTables = [
      'schema_version',
      'business_settings',
      'users',
      'customers',
      'artisans',
      'products',
      'stock_batches',
      'stock_movements',
      'purchases',
      'purchase_items',
      'invoice_series',
      'invoices',
      'invoice_items',
      'payments',
      'audit_log',
      'changes',
      'device_clock',
      'stock_checkpoints',
      'sync_checkpoints',
      'invoice_reversals',
      'backups_log',
    ];
    for (const t of knownTables) {
      if (!this.tables.has(t)) {
        this.tables.set(t, new Map());
      }
    }
  }

  async isPersistent(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
    return true;
  }

  async exportAllData(): Promise<Record<string, any[]>> {
    return this.dumpAllTables();
  }

  async restoreAllData(tables: Record<string, any[]>): Promise<void> {
    return this.restoreAllTables(tables);
  }


  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.query(sql, params);
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const res = await this.query<T>(sql, params);
    return res.length > 0 ? res[0] : null;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const trimmed = sql.trim();

    // Handle multiple statements separated by ';'
    if (trimmed.includes(';') && (trimmed.startsWith('CREATE') || trimmed.startsWith('--'))) {
      const statements = trimmed
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));
      for (const stmt of statements) {
        await this.query(stmt, []);
      }
      return [] as T[];
    }

    // CREATE TABLE
    if (trimmed.toUpperCase().startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
      if (match) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, new Map());
        }
      }
      return [] as T[];
    }

    // CREATE INDEX
    if (trimmed.toUpperCase().startsWith('CREATE INDEX')) {
      return [] as T[];
    }

    // INSERT INTO table (cols...) VALUES (?, ?)
    if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
      const match = trimmed.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const cols = match[2].split(',').map((c) => c.trim());
        const table = this.tables.get(tableName);
        if (!table) {
          this.tables.set(tableName, new Map());
        }
        const record: Record<string, any> = {};
        for (let i = 0; i < cols.length; i++) {
          record[cols[i]] = params[i] !== undefined ? params[i] : null;
        }

        const id = record['id'] ?? record['version'] ?? Object.values(record)[0];
        this.tables.get(tableName)!.set(String(id), record);
        return [] as T[];
      }
    }

    // UPDATE table SET col1 = ?, col2 = ? WHERE id = ?
    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      const match = trimmed.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
      if (match) {
        const tableName = match[1];
        const setClause = match[2];
        const whereClause = match[3];

        const setPairs = setClause.split(',').map((s) => s.trim());
        const setColNames = setPairs.map((p) => p.split('=')[0].trim());

        const numSetParams = setColNames.length;
        const setValues = params.slice(0, numSetParams);
        const whereValues = params.slice(numSetParams);

        const table = this.tables.get(tableName);
        if (table) {
          for (const [key, row] of table.entries()) {
            if (this.evalWhere(row, whereClause, whereValues)) {
              for (let i = 0; i < setColNames.length; i++) {
                row[setColNames[i]] = setValues[i];
              }
            }
          }
        }
        return [] as T[];
      }
    }

    // DELETE FROM table WHERE ...
    if (trimmed.toUpperCase().startsWith('DELETE FROM')) {
      const match = trimmed.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
      if (match) {
        const tableName = match[1];
        const whereClause = match[2];
        const table = this.tables.get(tableName);
        if (table) {
          const toDelete: string[] = [];
          for (const [key, row] of table.entries()) {
            if (this.evalWhere(row, whereClause, params)) {
              toDelete.push(key);
            }
          }
          for (const k of toDelete) {
            table.delete(k);
          }
        }
        return [] as T[];
      }
    }

    // SELECT
    if (trimmed.toUpperCase().startsWith('SELECT')) {
      return this.handleSelect<T>(trimmed, params);
    }

    return [] as T[];
  }

  private evalWhere(row: Record<string, any>, whereClause?: string, params: any[] = []): boolean {
    if (!whereClause) return true;
    let paramIndex = 0;

    // Support AND-separated basic expressions
    const conditions = whereClause.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const c = cond.trim();

      // col IS NULL
      const isNullMatch = c.match(/^([a-zA-Z0-9_]+)\s+IS\s+NULL$/i);
      if (isNullMatch) {
        const col = isNullMatch[1];
        if (row[col] !== null && row[col] !== undefined) return false;
        continue;
      }

      // col IS NOT NULL
      const isNotNullMatch = c.match(/^([a-zA-Z0-9_]+)\s+IS\s+NOT\s+NULL$/i);
      if (isNotNullMatch) {
        const col = isNotNullMatch[1];
        if (row[col] === null || row[col] === undefined) return false;
        continue;
      }

      // col = ?
      const eqMatch = c.match(/^([a-zA-Z0-9_]+)\s*=\s*\?$/);
      if (eqMatch) {
        const col = eqMatch[1];
        const val = params[paramIndex++];
        if (String(row[col]) !== String(val)) return false;
        continue;
      }

      // col != ? or col <> ?
      const neMatch = c.match(/^([a-zA-Z0-9_]+)\s*(?:!=|<>)\s*\?$/);
      if (neMatch) {
        const col = neMatch[1];
        const val = params[paramIndex++];
        if (String(row[col]) === String(val)) return false;
        continue;
      }

      // col >= ?
      const gteMatch = c.match(/^([a-zA-Z0-9_]+)\s*>=\s*\?$/);
      if (gteMatch) {
        const col = gteMatch[1];
        const val = params[paramIndex++];
        if (row[col] < val) return false;
        continue;
      }

      // col <= ?
      const lteMatch = c.match(/^([a-zA-Z0-9_]+)\s*<=\s*\?$/);
      if (lteMatch) {
        const col = lteMatch[1];
        const val = params[paramIndex++];
        if (row[col] > val) return false;
        continue;
      }

      // col LIKE ?
      const likeMatch = c.match(/^([a-zA-Z0-9_]+)\s+LIKE\s+\?$/i);
      if (likeMatch) {
        const col = likeMatch[1];
        const pattern = String(params[paramIndex++] || '');
        const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
        const reg = new RegExp(`^${regexPattern}$`, 'i');
        if (!reg.test(String(row[col] || ''))) return false;
        continue;
      }
    }
    return true;
  }

  private handleSelect<T>(sql: string, params: any[]): T[] {
    const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (!match) {
      // Check simple SELECT 1 or count
      return [] as T[];
    }

    const selectCols = match[1].trim();
    const tableName = match[2].trim();
    const whereClause = match[3]?.trim();
    const groupByClause = match[4]?.trim();
    const orderByClause = match[5]?.trim();
    const limitClause = match[6]?.trim();

    const table = this.tables.get(tableName);
    if (!table) return [] as T[];

    let rows: Record<string, any>[] = [];
    for (const row of table.values()) {
      if (this.evalWhere(row, whereClause, params)) {
        rows.push({ ...row });
      }
    }

    // Aggregates: SELECT SUM(qty_delta) as total FROM ...
    if (selectCols.toUpperCase().includes('SUM(') || selectCols.toUpperCase().includes('COUNT(')) {
      if (!groupByClause) {
        const result: Record<string, any> = {};
        const colDefs = selectCols.split(',').map((c) => c.trim());
        for (const colDef of colDefs) {
          const sumMatch = colDef.match(/SUM\((.+?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
          if (sumMatch) {
            const field = sumMatch[1].trim();
            const alias = sumMatch[2] || `SUM(${field})`;
            const total = rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
            result[alias] = total;
            continue;
          }
          const countMatch = colDef.match(/COUNT\((.+?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
          if (countMatch) {
            const alias = countMatch[2] || 'count';
            result[alias] = rows.length;
            continue;
          }
        }
        return [result as unknown as T];
      } else {
        // Group By
        const groups = new Map<string, Record<string, any>[]>();
        for (const r of rows) {
          const key = String(r[groupByClause]);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        }
        const groupedRows: Record<string, any>[] = [];
        for (const [key, groupRows] of groups.entries()) {
          const result: Record<string, any> = {};
          result[groupByClause] = groupRows[0][groupByClause];
          const colDefs = selectCols.split(',').map((c) => c.trim());
          for (const colDef of colDefs) {
            const sumMatch = colDef.match(/SUM\((.+?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
            if (sumMatch) {
              const field = sumMatch[1].trim();
              const alias = sumMatch[2] || `SUM(${field})`;
              result[alias] = groupRows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
            }
          }
          groupedRows.push(result);
        }
        rows = groupedRows;
      }
    }

    // ORDER BY
    if (orderByClause) {
      const parts = orderByClause.split(',').map((p) => p.trim());
      rows.sort((a, b) => {
        for (const part of parts) {
          const [field, direction] = part.split(/\s+/);
          const isDesc = (direction || '').toUpperCase() === 'DESC';
          if (a[field] < b[field]) return isDesc ? 1 : -1;
          if (a[field] > b[field]) return isDesc ? -1 : 1;
        }
        return 0;
      });
    }

    // LIMIT
    if (limitClause) {
      const limit = parseInt(limitClause, 10);
      rows = rows.slice(0, limit);
    }

    return rows as T[];
  }

  async transaction<T>(fn: (tx: StorageDatabase) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return await fn(this);
    }

    this.inTransaction = true;
    // Deep clone state for rollback capability
    this.transactionBackup = new Map();
    for (const [tblName, rows] of this.tables.entries()) {
      const rowClone = new Map<string, Record<string, any>>();
      for (const [rKey, rVal] of rows.entries()) {
        rowClone.set(rKey, { ...rVal });
      }
      this.transactionBackup.set(tblName, rowClone);
    }

    try {
      const result = await fn(this);
      this.inTransaction = false;
      this.transactionBackup = null;
      return result;
    } catch (err) {
      // Rollback
      if (this.transactionBackup) {
        this.tables = this.transactionBackup;
      }
      this.inTransaction = false;
      this.transactionBackup = null;
      throw err;
    }
  }

  async dumpAllTables(): Promise<Record<string, any[]>> {
    const dump: Record<string, any[]> = {};
    for (const [tblName, rowMap] of this.tables.entries()) {
      dump[tblName] = Array.from(rowMap.values());
    }
    return dump;
  }

  async restoreAllTables(tables: Record<string, any[]>): Promise<void> {
    this.tables.clear();
    for (const [tblName, rows] of Object.entries(tables)) {
      const rowMap = new Map<string, Record<string, any>>();
      for (const row of rows) {
        const id = row.id ?? row.version ?? Math.random().toString();
        rowMap.set(String(id), { ...row });
      }
      this.tables.set(tblName, rowMap);
    }
    this.ensureTables();
  }
}

/**
 * Compatibility bridge for repositories still using StorageDatabase. It shares
 * the exact same IDatabaseClient/SQLite worker as domain services so the app does
 * not open two competing connections to the OPFS database.
 */
class SqliteStorageAdapter implements StorageDatabase {
  constructor(private readonly client: IDatabaseClient) {}

  get migrationIdentity(): object {
    return (this.client as IDatabaseClient & { migrationIdentity?: object }).migrationIdentity ?? this.client;
  }

  execute(sql: string, params: any[] = []): Promise<void> {
    return this.client.execute(sql, params);
  }

  query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.client.query<T>(sql, params);
  }

  queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return this.client.queryOne<T>(sql, params);
  }

  transaction<T>(fn: (tx: StorageDatabase) => Promise<T>): Promise<T> {
    return this.client.transaction((tx) => fn(new SqliteStorageAdapter(tx)));
  }

  dumpAllTables(): Promise<Record<string, any[]>> {
    return this.client.exportAllData() as Promise<Record<string, any[]>>;
  }

  restoreAllTables(tables: Record<string, any[]>): Promise<void> {
    return this.client.restoreAllData(tables);
  }

  exportAllData(): Promise<Record<string, any[]>> {
    return this.dumpAllTables();
  }

  restoreAllData(tables: Record<string, any[]>): Promise<void> {
    return this.restoreAllTables(tables);
  }

  async isPersistent(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      return navigator.storage.persisted();
    }
    // OPFS is persistent origin storage; initialization errors are surfaced by SQL calls.
    return typeof window !== 'undefined';
  }
}

// Node tests use the deterministic in-memory adapter. Browser sessions use one real
// SQLite-WASM worker shared by both data-layer APIs; there is no silent browser fallback.
let activeDb: StorageDatabase | null = null;

export function getDatabase(): StorageDatabase {
  if (!activeDb) {
    activeDb = typeof window !== 'undefined'
      ? new SqliteStorageAdapter(getDatabaseClient())
      : new MemoryStorageDatabase();
  }
  return activeDb;
}

export function setDatabase(db: StorageDatabase) {
  activeDb = db;
}
