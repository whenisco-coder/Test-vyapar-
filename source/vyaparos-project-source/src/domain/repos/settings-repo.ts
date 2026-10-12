/**
 * Business Settings Repository
 */

import { getDbClient, DbClient } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { BusinessSettings } from '../types.ts';

export class SettingsRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async get(): Promise<BusinessSettings | null> {
    const rows = await this.client.query<BusinessSettings>(
      'SELECT * FROM business_settings WHERE deleted_at IS NULL LIMIT 1'
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async save(data: Partial<BusinessSettings>): Promise<BusinessSettings> {
    return this.client.transaction(async (tx, c) => {
      const existing = await this.get();
      const now = new Date().toISOString();
      const deviceId = c.getDb().isPersistent ? await c.getDb().isPersistent() : true;

      if (!existing) {
        const id = generateUUIDv7();
        const settings: BusinessSettings = {
          id,
          business_name: data.business_name || '',
          trade_name: data.trade_name || null,
          gstin: (data.gstin || '').toUpperCase(),
          state_code: data.state_code || '27',
          phone: data.phone || null,
          email: data.email || null,
          address_line1: data.address_line1 || '',
          address_line2: data.address_line2 || null,
          city: data.city || '',
          pincode: data.pincode || '',
          invoice_prefix: data.invoice_prefix || 'INV',
          financial_year_start: data.financial_year_start || '04-01',
          stock_method: data.stock_method || 'FIFO',
          allow_negative_stock: data.allow_negative_stock || 0,
          tally_sales_ledger: data.tally_sales_ledger || 'Sales Account',
          tally_cgst_ledger: data.tally_cgst_ledger || 'Output CGST',
          tally_sgst_ledger: data.tally_sgst_ledger || 'Output SGST',
          tally_igst_ledger: data.tally_igst_ledger || 'Output IGST',
          tally_round_off_ledger: data.tally_round_off_ledger || 'Round Off',
          is_onboarded: data.is_onboarded || 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: id,
          user_id: 'default-owner',
        };

        await tx.execute(
          `INSERT INTO business_settings (
            id, business_name, trade_name, gstin, state_code, phone, email,
            address_line1, address_line2, city, pincode, invoice_prefix,
            financial_year_start, stock_method, allow_negative_stock,
            tally_sales_ledger, tally_cgst_ledger, tally_sgst_ledger,
            tally_igst_ledger, tally_round_off_ledger, is_onboarded,
            created_at, updated_at, deleted_at, device_id, user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            settings.id, settings.business_name, settings.trade_name, settings.gstin, settings.state_code,
            settings.phone, settings.email, settings.address_line1, settings.address_line2, settings.city,
            settings.pincode, settings.invoice_prefix, settings.financial_year_start, settings.stock_method,
            settings.allow_negative_stock, settings.tally_sales_ledger, settings.tally_cgst_ledger,
            settings.tally_sgst_ledger, settings.tally_igst_ledger, settings.tally_round_off_ledger,
            settings.is_onboarded, settings.created_at, settings.updated_at, settings.deleted_at,
            settings.device_id, settings.user_id,
          ]
        );

        await c.recordChange(tx, {
          tableName: 'business_settings',
          rowId: settings.id,
          op: 'INSERT',
          payload: settings,
        });

        return settings;
      } else {
        const updated: BusinessSettings = {
          ...existing,
          ...data,
          updated_at: now,
        };

        await tx.execute(
          `UPDATE business_settings SET
            business_name = ?, trade_name = ?, gstin = ?, state_code = ?, phone = ?, email = ?,
            address_line1 = ?, address_line2 = ?, city = ?, pincode = ?, invoice_prefix = ?,
            financial_year_start = ?, stock_method = ?, allow_negative_stock = ?,
            tally_sales_ledger = ?, tally_cgst_ledger = ?, tally_sgst_ledger = ?,
            tally_igst_ledger = ?, tally_round_off_ledger = ?, is_onboarded = ?,
            updated_at = ?
          WHERE id = ?`,
          [
            updated.business_name, updated.trade_name, updated.gstin, updated.state_code, updated.phone, updated.email,
            updated.address_line1, updated.address_line2, updated.city, updated.pincode, updated.invoice_prefix,
            updated.financial_year_start, updated.stock_method, updated.allow_negative_stock,
            updated.tally_sales_ledger, updated.tally_cgst_ledger, updated.tally_sgst_ledger,
            updated.tally_igst_ledger, updated.tally_round_off_ledger, updated.is_onboarded,
            updated.updated_at, updated.id,
          ]
        );

        await c.recordChange(tx, {
          tableName: 'business_settings',
          rowId: updated.id,
          op: 'UPDATE',
          payload: updated,
        });

        return updated;
      }
    });
  }
}
