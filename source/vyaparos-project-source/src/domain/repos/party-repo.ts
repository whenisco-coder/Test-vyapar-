/**
 * Parties (Customers & Suppliers) Repository
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { Party } from '../types.ts';

export class PartyRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async list(type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'): Promise<Party[]> {
    let sql = 'SELECT * FROM customers WHERE deleted_at IS NULL';
    const params: any[] = [];
    if (type) {
      sql += ' AND (type = ? OR type = ?)';
      params.push(type, 'BOTH');
    }
    sql += ' ORDER BY name ASC';
    return this.client.query<Party>(sql, params);
  }

  async getById(id: string): Promise<Party | null> {
    return this.client.queryOne<Party>(
      'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
  }

  async findByMobile(mobile: string): Promise<Party | null> {
    if (!mobile) return null;
    const clean = mobile.trim();
    return this.client.queryOne<Party>(
      'SELECT * FROM customers WHERE mobile = ? AND deleted_at IS NULL LIMIT 1',
      [clean]
    );
  }

  async create(data: Omit<Party, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'device_id' | 'user_id'>): Promise<Party> {
    return this.client.transaction(async (tx, c) => {
      const id = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      const party: Party = {
        id,
        name: data.name.trim(),
        type: data.type || 'CUSTOMER',
        party_kind: data.party_kind || 'B2C',
        gstin: data.gstin ? data.gstin.trim().toUpperCase() : null,
        mobile: data.mobile ? data.mobile.trim() : null,
        email: data.email ? data.email.trim() : null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        pincode: data.pincode || null,
        state_code: data.state_code || '27',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO customers (
          id, name, type, party_kind, gstin, mobile, email,
          address_line1, address_line2, city, pincode, state_code,
          created_at, updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          party.id, party.name, party.type, party.party_kind, party.gstin, party.mobile, party.email,
          party.address_line1, party.address_line2, party.city, party.pincode, party.state_code,
          party.created_at, party.updated_at, party.deleted_at, party.device_id, party.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'customers',
        rowId: party.id,
        op: 'INSERT',
        payload: party,
      });

      return party;
    });
  }

  async update(id: string, data: Partial<Party>): Promise<Party> {
    return this.client.transaction(async (tx, c) => {
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Party not found: ${id}`);
      }

      const now = new Date().toISOString();
      const updated: Party = {
        ...existing,
        ...data,
        updated_at: now,
      };

      await tx.execute(
        `UPDATE customers SET
          name = ?, type = ?, party_kind = ?, gstin = ?, mobile = ?, email = ?,
          address_line1 = ?, address_line2 = ?, city = ?, pincode = ?, state_code = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          updated.name, updated.type, updated.party_kind, updated.gstin, updated.mobile, updated.email,
          updated.address_line1, updated.address_line2, updated.city, updated.pincode, updated.state_code,
          updated.updated_at, id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'customers',
        rowId: id,
        op: 'UPDATE',
        payload: updated,
      });

      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    return this.client.transaction(async (tx, c) => {
      const existing = await this.getById(id);
      if (!existing) return;

      const now = new Date().toISOString();
      await tx.execute('UPDATE customers SET deleted_at = ? WHERE id = ?', [now, id]);

      await c.recordChange(tx, {
        tableName: 'customers',
        rowId: id,
        op: 'DELETE',
        payload: { id, deleted_at: now },
      });
    });
  }
}
