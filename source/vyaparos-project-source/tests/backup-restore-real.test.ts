import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { AppService } from '../src/domain/services';
import { encryptBackup } from '../src/domain/crypto';
import { runMigrations } from '../src/data/migrations';
import { SCHEMA_VERSION } from '../src/data/schema';
import { cleanupRealSqliteDbs, makeDb } from './helpers/file-sqlite-client';


async function setupBusiness(service: AppService, name: string) {
  await service.init();
  await service.setupBusiness({ businessName: name, stateCode: '24', invoicePrefix: 'TST' });
}

describe('restore safety using file-backed SQLite', () => {
  it('migrates a real v2 backups_log table by adding both v3 columns', async () => {
    const db = makeDb();
    await db.init();

    // Model a persisted v2 database: neither of the v3 backup metadata columns exists.
    db.raw.exec('ALTER TABLE backups_log DROP COLUMN file_name; ALTER TABLE backups_log DROP COLUMN size_bytes; PRAGMA user_version = 2;');
    const before = await db.query<{ name: string }>('PRAGMA table_info(backups_log);');
    expect(before.some((column) => column.name === 'file_name')).toBe(false);
    expect(before.some((column) => column.name === 'size_bytes')).toBe(false);

    const migration = await runMigrations(db, SCHEMA_VERSION);
    expect(migration.previousVersion).toBe(2);
    expect(migration.newVersion).toBe(SCHEMA_VERSION);

    const after = await db.query<{ name: string; type: string; notnull: number }>('PRAGMA table_info(backups_log);');
    expect(after.find((column) => column.name === 'file_name')?.type.toUpperCase()).toBe('TEXT');
    expect(after.find((column) => column.name === 'size_bytes')?.type.toUpperCase()).toBe('INTEGER');
    await db.execute(
      'INSERT INTO backups_log (id, backup_type, checksum, file_name, size_bytes, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['v3-backup-row', 'auto_safety', 'abc123', 'safety-v2-migrated.sqlite3', 4096, 0, new Date().toISOString()],
    );
    const inserted = await db.queryOne<{ file_name: string; size_bytes: number }>(
      'SELECT file_name, size_bytes FROM backups_log WHERE id = ?', ['v3-backup-row'],
    );
    expect(inserted).toEqual({ file_name: 'safety-v2-migrated.sqlite3', size_bytes: 4096 });
    await expect(db.execute(
      'INSERT INTO backups_log (id, backup_type, checksum, file_name, size_bytes, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['negative-size-row', 'auto_safety', 'abc123', 'invalid.sqlite3', -1, 0, new Date().toISOString()],
    )).rejects.toThrow(/CHECK constraint failed/i);
  });

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
