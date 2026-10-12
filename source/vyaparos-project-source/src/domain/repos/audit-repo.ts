/**
 * Audit Log & Changes Repository
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { AuditLog, ChangeRecord } from '../types.ts';

export class AuditRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async log(action: string, entityType: string, entityId?: string | null, details?: any): Promise<AuditLog> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const detailsJson = details ? JSON.stringify(details) : null;

    const entry: AuditLog = {
      id,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details_json: detailsJson,
      timestamp: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      device_id: deviceId,
      user_id: 'default-owner',
    };

    await this.client.execute(
      `INSERT INTO audit_log (
        id, action, entity_type, entity_id, details_json, timestamp,
        created_at, updated_at, deleted_at, device_id, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id, entry.action, entry.entity_type, entry.entity_id,
        entry.details_json, entry.timestamp, entry.created_at, entry.updated_at,
        entry.deleted_at, entry.device_id, entry.user_id
      ]
    );

    return entry;
  }

  async list(limit: number = 100): Promise<AuditLog[]> {
    return this.client.query<AuditLog>(
      'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
  }
}

export class ChangesRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async list(limit: number = 100): Promise<ChangeRecord[]> {
    return this.client.query<ChangeRecord>(
      'SELECT * FROM changes ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
  }

  async count(): Promise<number> {
    const res = await this.client.query<{ count: number }>(
      'SELECT COUNT(id) as count FROM changes'
    );
    return res.length > 0 ? Number(res[0].count) : 0;
  }
}
