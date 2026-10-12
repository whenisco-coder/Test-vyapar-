/**
 * Stock Movements & Batches Repository
 * Append-only stock movements and FIFO batch allocation.
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { StorageDatabase } from '../../data/storage-backend.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { StockBatch, StockMovement } from '../types.ts';
import { StockBatchRecord } from '../fifo.ts';

export class StockRepo {
  constructor(private client: DbClient = getDbClient()) {}

  /**
   * Appends an immutable stock movement and tracks it in changes table
   */
  async addMovement(
    tx: StorageDatabase,
    data: {
      productId: string;
      batchId?: string | null;
      location?: string;
      qtyDelta: number;
      reason: 'OPENING' | 'PURCHASE' | 'SALE' | 'CANCEL_SALE' | 'ADJUSTMENT';
      refTable?: string | null;
      refId?: string | null;
      notes?: string | null;
    }
  ): Promise<StockMovement> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const movement: StockMovement = {
      id,
      product_id: data.productId,
      batch_id: data.batchId || null,
      location: data.location || 'Own',
      qty_delta: data.qtyDelta,
      reason: data.reason,
      ref_table: data.refTable || null,
      ref_id: data.refId || null,
      notes: data.notes || null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      device_id: deviceId,
      user_id: 'default-owner',
    };

    await tx.execute(
      `INSERT INTO stock_movements (
        id, product_id, batch_id, location, qty_delta, reason,
        ref_table, ref_id, notes, created_at, updated_at, deleted_at,
        device_id, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movement.id, movement.product_id, movement.batch_id, movement.location,
        movement.qty_delta, movement.reason, movement.ref_table, movement.ref_id,
        movement.notes, movement.created_at, movement.updated_at, movement.deleted_at,
        movement.device_id, movement.user_id
      ]
    );

    await this.client.recordChange(tx, {
      tableName: 'stock_movements',
      rowId: movement.id,
      op: 'INSERT',
      payload: movement,
    });

    return movement;
  }

  /**
   * Creates a new purchase or opening stock batch
   */
  async createBatch(
    tx: StorageDatabase,
    data: {
      productId: string;
      location?: string;
      supplierId?: string | null;
      purchaseId?: string | null;
      costPaise: number;
      purchaseDate: string;
      quantityIn: number;
      attributesJson?: string | null;
    }
  ): Promise<StockBatch> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const batch: StockBatch = {
      id,
      product_id: data.productId,
      location: data.location || 'Own',
      supplier_id: data.supplierId || null,
      purchase_id: data.purchaseId || null,
      cost_paise: data.costPaise,
      purchase_date: data.purchaseDate,
      quantity_in: data.quantityIn,
      attributes_json: data.attributesJson || null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      device_id: deviceId,
      user_id: 'default-owner',
    };

    await tx.execute(
      `INSERT INTO stock_batches (
        id, product_id, location, supplier_id, purchase_id, cost_paise,
        purchase_date, quantity_in, attributes_json, created_at, updated_at,
        deleted_at, device_id, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batch.id, batch.product_id, batch.location, batch.supplier_id,
        batch.purchase_id, batch.cost_paise, batch.purchase_date,
        batch.quantity_in, batch.attributes_json, batch.created_at,
        batch.updated_at, batch.deleted_at, batch.device_id, batch.user_id
      ]
    );

    await this.client.recordChange(tx, {
      tableName: 'stock_batches',
      rowId: batch.id,
      op: 'INSERT',
      payload: batch,
    });

    return batch;
  }

  /**
   * Computes stock on hand derived purely from stock movements
   */
  async getStockOnHand(productId: string, location?: string): Promise<number> {
    let sql = 'SELECT SUM(qty_delta) as total FROM stock_movements WHERE product_id = ?';
    const params: any[] = [productId];
    if (location) {
      sql += ' AND location = ?';
      params.push(location);
    }
    const res = await this.client.query<{ total: number }>(sql, params);
    return res.length > 0 && res[0].total !== null ? Number(res[0].total) : 0;
  }

  /**
   * Retrieves stock on hand for all products in a single aggregated query
   */
  async getAllStockOnHand(): Promise<Map<string, number>> {
    const rows = await this.client.query<{ product_id: string; total: number }>(
      'SELECT product_id, SUM(qty_delta) as total FROM stock_movements GROUP BY product_id'
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.product_id, Number(r.total) || 0);
    }
    return map;
  }

  /**
   * Retrieves available batches for a product with remaining quantity for FIFO allocation
   */
  async getAvailableBatches(productId: string, location: string = 'Own'): Promise<StockBatchRecord[]> {
    const batches = await this.client.query<StockBatch>(
      'SELECT * FROM stock_batches WHERE product_id = ? AND location = ? AND deleted_at IS NULL ORDER BY purchase_date ASC, created_at ASC',
      [productId, location]
    );

    if (batches.length === 0) {
      return [];
    }

    // Get all movements tagged with these batches
    const movements = await this.client.query<{ batch_id: string; total: number }>(
      'SELECT batch_id, SUM(qty_delta) as total FROM stock_movements WHERE product_id = ? AND batch_id IS NOT NULL GROUP BY batch_id',
      [productId]
    );

    const movementMap = new Map<string, number>();
    for (const m of movements) {
      if (m.batch_id) {
        movementMap.set(m.batch_id, Number(m.total) || 0);
      }
    }

    const records: StockBatchRecord[] = [];
    for (const b of batches) {
      const netMovement = movementMap.get(b.id) || 0;
      // Inward movements are positive, sales consumption are negative.
      // Net sum in movements already reflects remaining qty if inward is included in movements.
      // Notice: In our ledger, opening & purchase create batch AND an inward movement (+qty).
      // Sale creates consumption movement (-qty).
      // Therefore, remaining_qty in this batch is precisely sum(qty_delta)!
      const remaining = netMovement;
      records.push({
        id: b.id,
        product_id: b.product_id,
        location: b.location,
        cost_paise: b.cost_paise,
        purchase_date: b.purchase_date,
        quantity_in: b.quantity_in,
        created_at: b.created_at,
        remaining_qty: remaining,
      });
    }

    return records;
  }

  /**
   * Records opening stock for a product
   */
  async setOpeningStock(params: {
    productId: string;
    quantity: number;
    costPaise: number;
    location?: string;
  }): Promise<{ batch: StockBatch; movement: StockMovement }> {
    return this.client.transaction(async (tx) => {
      const location = params.location || 'Own';
      const purchaseDate = new Date().toISOString().slice(0, 10);

      const batch = await this.createBatch(tx, {
        productId: params.productId,
        location,
        costPaise: params.costPaise,
        purchaseDate,
        quantityIn: params.quantity,
        attributesJson: JSON.stringify({ isOpening: true }),
      });

      const movement = await this.addMovement(tx, {
        productId: params.productId,
        batchId: batch.id,
        location,
        qtyDelta: params.quantity,
        reason: 'OPENING',
        refTable: 'products',
        refId: params.productId,
        notes: `Opening stock: ${params.quantity} units @ ₹${(params.costPaise / 100).toFixed(2)}`,
      });

      return { batch, movement };
    });
  }

  async getMovementsForProduct(productId: string): Promise<StockMovement[]> {
    return this.client.query<StockMovement>(
      'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC',
      [productId]
    );
  }
}
