import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IDatabaseClient } from '../src/data/sqliteClient';
import { AppService } from '../src/domain/services';
import { encryptBackup } from '../src/domain/crypto';
import { SCHEMA_TRIGGERS_SQL } from '../src/data/schema';
import { splitMigrationStatements, runMigrations } from '../src/data/migrations';

/** File-backed node:sqlite adapter: all statements and transactions execute in real SQLite. */
class FileSqliteClient implements IDatabaseClient {
  raw: DatabaseSync;
  readonly migrationIdentity = this;
  failSafetyWrite = false;

  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
    mkdirSync(this.backupDir, { recursive: true });
    this.raw = this.open();
  }
  get dbPath() { return path.join(this.root, 'app.sqlite3'); }
  get backupDir() { return path.join(this.root, 'vyapar-os-backups'); }
  private open() { const db = new DatabaseSync(this.dbPath); db.exec('PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;'); return db; }
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> { return this.raw.prepare(sql).all(...params as any[]) as T[]; }
  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> { return (this.raw.prepare(sql).get(...params as any[]) as T | undefined) ?? null; }
  async execute(sql: string, params: unknown[] = []): Promise<void> { this.raw.prepare(sql).run(...params as any[]); }
  async transaction<T>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    this.raw.exec('BEGIN IMMEDIATE');
    try { const result = await fn(this); this.raw.exec('COMMIT'); return result; }
    catch (error) { try { this.raw.exec('ROLLBACK'); } catch {} throw error; }
  }
  async exportDatabase(): Promise<Uint8Array> { return new Uint8Array(readFileSync(this.dbPath)); }
  async persistSafetyBackup(bytes: Uint8Array): Promise<{ fileName: string; checksum: string; sizeBytes: number }> {
    if (this.failSafetyWrite) throw new Error('simulated backup disk failure');
    const fileName = `safety-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`;
    writeFileSync(path.join(this.backupDir, fileName), bytes);
    const reread = readFileSync(path.join(this.backupDir, fileName));
    if (!reread.byteLength) throw new Error('backup read-back was empty');
    const checksum = createHash('sha256').update(reread).digest('hex');
    const files = readdirSync(this.backupDir).filter(n => /^safety-.*\.sqlite3$/.test(n)).sort().reverse();
    for (const old of files.slice(3)) rmSync(path.join(this.backupDir, old));
    return { fileName, checksum, sizeBytes: reread.byteLength };
  }
  async readLatestSafetyBackup(): Promise<{ fileName: string; checksum: string; sizeBytes: number; bytes: Uint8Array } | null> {
    const names = readdirSync(this.backupDir).filter(n => /^safety-.*\.sqlite3$/.test(n)).sort().reverse();
    if (!names.length) return null;
    const fileName = names[0]; const bytes = new Uint8Array(readFileSync(path.join(this.backupDir, fileName)));
    return { fileName, bytes, sizeBytes: bytes.byteLength, checksum: createHash('sha256').update(bytes).digest('hex') };
  }
  async restoreDatabaseBytes(bytes: Uint8Array): Promise<void> {
    this.raw.close(); writeFileSync(this.dbPath, bytes); this.raw = this.open();
  }
  async exportAllData(): Promise<Record<string, unknown[]>> {
    const tables = await this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const data: Record<string, unknown[]> = {};
    for (const { name } of tables) data[name] = await this.query(`SELECT * FROM "${name}"`);
    return data;
  }
  async restoreAllData(data: Record<string, unknown[]>): Promise<void> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Backup payload must be a table-to-rows object');
    const tables = await this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const allowed = new Set(tables.map(t => t.name));
    for (const [table, rows] of Object.entries(data)) {
      if (!allowed.has(table) || !Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error(`Backup contains invalid table or rows: ${table}`);
      const columns = await this.query<{ name: string }>(`PRAGMA table_info(\"${table}\")`); const known = new Set(columns.map(c => c.name));
      for (const row of rows as Record<string, unknown>[]) if (!Object.keys(row).length || Object.keys(row).some(c => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c) || !known.has(c))) throw new Error(`Backup contains invalid columns in table: ${table}`);
    }
    await this.execute('PRAGMA foreign_keys = OFF');
    try {
      await this.transaction(async tx => {
        const triggers = await tx.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'sqlite_%'");
        for (const { name } of triggers) await tx.execute(`DROP TRIGGER IF EXISTS "${name}"`);
        for (const table of allowed) await tx.execute(`DELETE FROM "${table}"`);
        for (const [table, rows] of Object.entries(data)) for (const row of rows as Record<string, unknown>[]) {
          const columns = Object.keys(row); if (!columns.length) throw new Error(`Backup row has no columns in ${table}`);
          await tx.execute(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(c => row[c]));
        }
        for (const sql of splitMigrationStatements(SCHEMA_TRIGGERS_SQL)) await tx.execute(`${sql};`);
      });
    } finally { await this.execute('PRAGMA foreign_keys = ON'); }
  }
  async init() { await runMigrations(this as any); }
  close() { this.raw.close(); }
}

const roots: string[] = [];
function makeDb() { const root = mkdtempSync(path.join(tmpdir(), 'vyapar-os-restore-real-')); roots.push(root); return new FileSqliteClient(root); }
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0; });

async function setupBusiness(service: AppService, name: string) {
  await service.init();
  await service.setupBusiness({ businessName: name, stateCode: '24', invoicePrefix: 'TST' });
}

describe('restore safety using file-backed SQLite', () => {
  it('restores incoming backup data', async () => {
    const sourceDb = makeDb(); const source = new AppService(sourceDb); await setupBusiness(source, 'Backup Business');
    const encrypted = await source.createEncryptedBackup('correct-pass');
    const targetDb = makeDb(); const target = new AppService(targetDb); await setupBusiness(target, 'Original Business');
    await target.restoreFromEncryptedBackup(encrypted, 'correct-pass');
    expect((await target.settings.get())?.business_name).toBe('Backup Business');
    expect((await targetDb.query<any>("SELECT file_name, checksum FROM backups_log WHERE backup_type='auto_safety'")).length).toBe(1);
    expect(readdirSync(targetDb.backupDir).some(n => n.endsWith('.sqlite3'))).toBe(true);
    sourceDb.close(); targetDb.close();
  });

  it('wrong passphrase leaves data unchanged', async () => {
    const sourceDb = makeDb(); const source = new AppService(sourceDb); await setupBusiness(source, 'Incoming');
    const encrypted = await source.createEncryptedBackup('right-pass');
    const targetDb = makeDb(); const target = new AppService(targetDb); await setupBusiness(target, 'Keep Me');
    await expect(target.restoreFromEncryptedBackup(encrypted, 'wrong-pass')).rejects.toThrow(/Incorrect passphrase|Decryption failed/i);
    expect((await target.settings.get())?.business_name).toBe('Keep Me');
    sourceDb.close(); targetDb.close();
  });

  it('refuses restore when safety backup write fails and leaves data unchanged', async () => {
    const sourceDb = makeDb(); const source = new AppService(sourceDb); await setupBusiness(source, 'Incoming');
    const encrypted = await source.createEncryptedBackup('right-pass');
    const targetDb = makeDb(); const target = new AppService(targetDb); await setupBusiness(target, 'Keep Me'); targetDb.failSafetyWrite = true;
    await expect(target.restoreFromEncryptedBackup(encrypted, 'right-pass')).rejects.toThrow(/safety backup could not be written/i);
    expect((await target.settings.get())?.business_name).toBe('Keep Me');
    sourceDb.close(); targetDb.close();
  });

  it('rolls back a midway restore failure and the safety image restores original data', async () => {
    const sourceDb = makeDb(); const source = new AppService(sourceDb); await setupBusiness(source, 'Incoming');
    const payload = await sourceDb.exportAllData();
    // Valid columns but a CHECK-constraint violation fails after earlier tables were touched inside the transaction.
    payload.business_settings = (payload.business_settings as Record<string, unknown>[]).map(row => ({ ...row, stock_method: 'BROKEN' }));
    const encrypted = await encryptBackup(payload, 'right-pass');
    const targetDb = makeDb(); const target = new AppService(targetDb); await setupBusiness(target, 'Keep Me');
    await expect(target.restoreFromEncryptedBackup(encrypted, 'right-pass')).rejects.toThrow(/CHECK constraint failed|constraint failed/i);
    expect((await target.settings.get())?.business_name).toBe('Keep Me');
    await target.restoreLatestSafetyBackup();
    expect((await target.settings.get())?.business_name).toBe('Keep Me');
    const latest = await targetDb.readLatestSafetyBackup(); expect(latest?.sizeBytes).toBeGreaterThan(0);
    sourceDb.close(); targetDb.close();
  });

  it('restoring latest safety backup returns pre-restore data after a successful restore', async () => {
    const sourceDb = makeDb(); const source = new AppService(sourceDb); await setupBusiness(source, 'Incoming');
    const encrypted = await source.createEncryptedBackup('right-pass');
    const targetDb = makeDb(); const target = new AppService(targetDb); await setupBusiness(target, 'Original');
    await target.restoreFromEncryptedBackup(encrypted, 'right-pass');
    expect((await target.settings.get())?.business_name).toBe('Incoming');
    await target.restoreLatestSafetyBackup();
    expect((await target.settings.get())?.business_name).toBe('Original');
    sourceDb.close(); targetDb.close();
  });
});
