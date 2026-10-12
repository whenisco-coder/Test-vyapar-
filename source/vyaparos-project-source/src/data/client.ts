/**
 * Typed Data Client & Transaction Coordinator
 * Orchestrates SQL execution, migration startup, and change tracking.
 */

import { generateUUIDv7 } from '../domain/uuid.ts';
import { tickHLC, parseHLC } from '../domain/hlc.ts';
import { runMigrations, type MigrationResult } from './migrations.ts';
import { getDatabase, StorageDatabase } from './storage-backend.ts';

let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('business_os_device_id');
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const fresh = generateUUIDv7();
    localStorage.setItem('business_os_device_id', fresh);
    cachedDeviceId = fresh;
    return fresh;
  }
  cachedDeviceId = generateUUIDv7();
  return cachedDeviceId;
}

export interface ChangeEventInput {
  tableName: string;
  rowId: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
}

export class DbClient {
  private db: StorageDatabase;
  private initialized = false;
  private migrationResult: MigrationResult | null = null;

  constructor(db?: StorageDatabase) {
    this.db = db || getDatabase();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.migrationResult = await runMigrations(this.db);
    this.initialized = true;
  }

  getDb(): StorageDatabase {
    return this.db;
  }

  getMigrationResult(): MigrationResult | null {
    return this.migrationResult;
  }

  /**
   * Appends an entry to the `changes` table in the same transaction
   */
  async recordChange(
    tx: StorageDatabase,
    event: ChangeEventInput,
    deviceId?: string
  ): Promise<void> {
    const devId = deviceId || getDeviceId();
    const changeId = generateUUIDv7();
    const timestamp = new Date().toISOString();
    const payloadJson = JSON.stringify(event.payload);
    const clock = await tx.queryOne<{ id: string; last_hlc: string }>(
      'SELECT id, last_hlc FROM device_clock WHERE device_id = ?', [devId]
    );
    const hlc = tickHLC(clock?.last_hlc, Date.now(), devId);
    const parsed = parseHLC(hlc);
    if (clock) {
      await tx.execute(
        'UPDATE device_clock SET physical_ms = ?, logical_counter = ?, last_hlc = ?, updated_at = ? WHERE id = ?',
        [parsed.physicalMs, parsed.logical, hlc, timestamp, clock.id]
      );
    } else {
      await tx.execute(
        'INSERT INTO device_clock (id, device_id, physical_ms, logical_counter, last_hlc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateUUIDv7(), devId, parsed.physicalMs, parsed.logical, hlc, timestamp, timestamp]
      );
    }

    await tx.execute(
      'INSERT INTO changes (id, device_id, origin_device_id, hlc, table_name, row_id, op, payload, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [changeId, devId, devId, hlc, event.tableName, event.rowId, event.op, payloadJson, timestamp, event.payload?.user_id ?? null]
    );
  }

  async transaction<T>(fn: (tx: StorageDatabase, client: DbClient) => Promise<T>): Promise<T> {
    await this.init();
    return this.db.transaction(async (tx) => {
      return await fn(tx, this);
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.init();
    return this.db.query<T>(sql, params);
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    await this.init();
    return this.db.queryOne<T>(sql, params);
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.init();
    await this.db.execute(sql, params);
  }
}

let globalClient: DbClient | null = null;

export function getDbClient(): DbClient {
  if (!globalClient) {
    globalClient = new DbClient();
  }
  return globalClient;
}

export function setDbClient(client: DbClient) {
  globalClient = client;
}
