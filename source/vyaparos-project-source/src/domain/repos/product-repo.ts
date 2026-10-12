/**
 * Products Catalog Repository
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { Product } from '../types.ts';

export class ProductRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async list(searchTerm?: string): Promise<Product[]> {
    const rows = await this.client.query<Product>(
      'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name ASC'
    );
    if (!searchTerm || !searchTerm.trim()) {
      return rows;
    }
    const q = searchTerm.trim().toLowerCase();
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.hsn && p.hsn.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }

  async getById(id: string): Promise<Product | null> {
    return this.client.queryOne<Product>(
      'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
  }

  async create(data: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'device_id' | 'user_id'>): Promise<Product> {
    return this.client.transaction(async (tx, c) => {
      const id = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      const product: Product = {
        id,
        name: data.name.trim(),
        sku: data.sku ? data.sku.trim() : null,
        hsn: data.hsn.trim(),
        gst_rate_bp: data.gst_rate_bp || 1800,
        unit: data.unit || 'NOS',
        selling_price_paise: Math.trunc(data.selling_price_paise || 0),
        mrp_paise: Math.trunc(data.mrp_paise || 0),
        price_includes_tax: data.price_includes_tax ? 1 : 0,
        category: data.category || null,
        active: data.active !== undefined ? (data.active ? 1 : 0) : 1,
        product_kind: data.product_kind ?? 'standard',
        parent_product_id: data.parent_product_id ?? null,
        variant_attributes_json: data.variant_attributes_json ?? null,
        artisan_id: data.artisan_id ?? null,
        unique_piece_code: data.unique_piece_code ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO products (
          id, name, sku, hsn, gst_rate_bp, unit, selling_price_paise, mrp_paise,
          price_includes_tax, category, active, product_kind, parent_product_id, variant_attributes_json,
          artisan_id, unique_piece_code, created_at, updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id, product.name, product.sku, product.hsn, product.gst_rate_bp, product.unit,
          product.selling_price_paise, product.mrp_paise, product.price_includes_tax, product.category,
          product.active, product.product_kind, product.parent_product_id, product.variant_attributes_json,
          product.artisan_id, product.unique_piece_code, product.created_at, product.updated_at, product.deleted_at,
          product.device_id, product.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'products',
        rowId: product.id,
        op: 'INSERT',
        payload: product,
      });

      return product;
    });
  }

  async update(id: string, data: Partial<Product>): Promise<Product> {
    return this.client.transaction(async (tx, c) => {
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Product not found: ${id}`);
      }

      const now = new Date().toISOString();
      const updated: Product = {
        ...existing,
        ...data,
        updated_at: now,
      };

      await tx.execute(
        `UPDATE products SET
          name = ?, sku = ?, hsn = ?, gst_rate_bp = ?, unit = ?,
          selling_price_paise = ?, mrp_paise = ?, price_includes_tax = ?,
          category = ?, active = ?, product_kind = ?, parent_product_id = ?, variant_attributes_json = ?,
          artisan_id = ?, unique_piece_code = ?, updated_at = ?
        WHERE id = ?`,
        [
          updated.name, updated.sku, updated.hsn, updated.gst_rate_bp, updated.unit,
          updated.selling_price_paise, updated.mrp_paise, updated.price_includes_tax,
          updated.category, updated.active, updated.product_kind ?? 'standard', updated.parent_product_id ?? null,
          updated.variant_attributes_json ?? null, updated.artisan_id ?? null, updated.unique_piece_code ?? null,
          updated.updated_at, id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'products',
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
      await tx.execute('UPDATE products SET deleted_at = ? WHERE id = ?', [now, id]);

      await c.recordChange(tx, {
        tableName: 'products',
        rowId: id,
        op: 'DELETE',
        payload: { id, deleted_at: now },
      });
    });
  }
}
