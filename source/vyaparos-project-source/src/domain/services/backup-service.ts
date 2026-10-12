/**
 * Backup Service
 * Manages encrypted backup export, restore, safety snapshots, and 7-day reminder check.
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { encryptBackup, decryptBackup, BackupEnvelope, BackupPayload } from '../backup.ts';
import { AuditRepo } from '../repos/audit-repo.ts';

export class BackupService {
  private auditRepo: AuditRepo;

  constructor(private client: DbClient = getDbClient()) {
    this.auditRepo = new AuditRepo(client);
  }

  async exportEncryptedBackup(passphrase: string): Promise<{
    envelope: BackupEnvelope;
    jsonString: string;
    filename: string;
  }> {
    const db = this.client.getDb();
    const tables = await db.dumpAllTables();
    const envelope = await encryptBackup(tables, passphrase);
    const jsonString = JSON.stringify(envelope, null, 2);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `business_os_backup_${dateStr}.enc.json`;

    // Log to backups_log
    const logId = generateUUIDv7();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const sizeBytes = new TextEncoder().encode(jsonString).length;

    await this.client.execute(
      `INSERT INTO backups_log (
        id, backup_type, checksum, size_bytes, timestamp,
        created_at, updated_at, deleted_at, device_id, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logId, 'MANUAL_EXPORT', envelope.ciphertext.slice(0, 32), sizeBytes,
        now, now, now, null, deviceId, 'default-owner'
      ]
    );

    await this.auditRepo.log('BACKUP_EXPORT', 'backups_log', logId, {
      sizeBytes,
      filename,
    });

    return { envelope, jsonString, filename };
  }

  async restoreEncryptedBackup(
    envelope: BackupEnvelope,
    passphrase: string
  ): Promise<{ payload: BackupPayload; safetyBackup: Record<string, any[]> }> {
    // 1. Verify and decrypt backup first (throws if wrong password or corrupt)
    const payload = await decryptBackup(envelope, passphrase);

    const db = this.client.getDb();

    // 2. Take mandatory automatic safety backup before modifying existing state
    const safetyBackup = await db.dumpAllTables();

    // 3. Restore all tables
    await db.restoreAllTables(payload.tables);

    // 4. Log restore event
    await this.auditRepo.log('BACKUP_RESTORE', 'system', null, {
      restoredAt: new Date().toISOString(),
      tablesCount: Object.keys(payload.tables).length,
    });

    return { payload, safetyBackup };
  }

  /**
   * Checks if a backup was created in the past 7 days
   */
  async checkNeedsBackupReminder(): Promise<{ needsReminder: boolean; daysSinceLastBackup: number | null }> {
    const rows = await this.client.query<{ timestamp: string }>(
      "SELECT timestamp FROM backups_log WHERE backup_type = 'MANUAL_EXPORT' ORDER BY timestamp DESC LIMIT 1"
    );

    if (rows.length === 0) {
      return { needsReminder: true, daysSinceLastBackup: null };
    }

    const lastBackupTime = new Date(rows[0].timestamp).getTime();
    const now = Date.now();
    const diffDays = Math.floor((now - lastBackupTime) / (1000 * 60 * 60 * 24));

    return {
      needsReminder: diffDays >= 7,
      daysSinceLastBackup: diffDays,
    };
  }
}
