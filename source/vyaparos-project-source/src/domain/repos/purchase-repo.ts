/**
 * Purchases Repository (Stock Inward)
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { Purchase, PurchaseItem } from '../types.ts';
import { StockRepo } from './stock-repo.ts';
import { calculateLineGst } from '../gst.ts';
import { Money } from '../money.ts';

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  costPaise: number;
  gstRateBp: number;
  batchAttributesJson?: string | null;
}

export interface CreatePurchaseInput {
  supplierId: string;
  invoiceNumber?: string | null;
  purchaseDate: string; // YYYY-MM-DD
  notes?: string | null;
  items: PurchaseItemInput[];
  postImmediately?: boolean;
}

export class PurchaseRepo {
  private stockRepo: StockRepo;

  constructor(private client: DbClient = getDbClient()) {
    this.stockRepo = new StockRepo(client);
  }

  async list(): Promise<Purchase[]> {
    return this.client.query<Purchase>(
      'SELECT * FROM purchases WHERE deleted_at IS NULL ORDER BY purchase_date DESC, created_at DESC'
    );
  }

  async getById(id: string): Promise<{ purchase: Purchase; items: PurchaseItem[] } | null> {
    const purchase = await this.client.queryOne<Purchase>(
      'SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!purchase) return null;

    const items = await this.client.query<PurchaseItem>(
      'SELECT * FROM purchase_items WHERE purchase_id = ? AND deleted_at IS NULL',
      [id]
    );
    return { purchase, items };
  }

  async create(data: CreatePurchaseInput): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
    return this.client.transaction(async (tx, c) => {
      const purchaseId = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      let totalTaxable = 0;
      let totalTax = 0;
      let totalAmount = 0;

      const createdItems: PurchaseItem[] = [];

      for (const itemInput of data.items) {
        const gst = calculateLineGst({
          quantity: itemInput.quantity,
          unitPricePaise: itemInput.costPaise,
          gstRateBp: itemInput.gstRateBp,
          priceIncludesTax: false,
          isInterState: false, // Purchase total tax computation
        });

        totalTaxable = Money.add(totalTaxable, gst.taxablePaise);
        totalTax = Money.add(totalTax, gst.totalTaxPaise);
        totalAmount = Money.add(totalAmount, gst.totalPaise);

        const itemId = generateUUIDv7();
        const pItem: PurchaseItem = {
          id: itemId,
          purchase_id: purchaseId,
          product_id: itemInput.productId,
          quantity: itemInput.quantity,
          cost_paise: itemInput.costPaise,
          gst_rate_bp: itemInput.gstRateBp,
          taxable_paise: gst.taxablePaise,
          tax_paise: gst.totalTaxPaise,
          total_paise: gst.totalPaise,
          batch_attributes_json: itemInput.batchAttributesJson || null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: deviceId,
          user_id: 'default-owner',
        };

        await tx.execute(
          `INSERT INTO purchase_items (
            id, purchase_id, product_id, quantity, cost_paise, gst_rate_bp,
            taxable_paise, tax_paise, total_paise, batch_attributes_json,
            created_at, updated_at, deleted_at, device_id, user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pItem.id, pItem.purchase_id, pItem.product_id, pItem.quantity,
            pItem.cost_paise, pItem.gst_rate_bp, pItem.taxable_paise,
            pItem.tax_paise, pItem.total_paise, pItem.batch_attributes_json,
            pItem.created_at, pItem.updated_at, pItem.deleted_at,
            pItem.device_id, pItem.user_id
          ]
        );

        await c.recordChange(tx, {
          tableName: 'purchase_items',
          rowId: pItem.id,
          op: 'INSERT',
          payload: pItem,
        });

        createdItems.push(pItem);
      }

      const status: 'DRAFT' | 'POSTED' = data.postImmediately ? 'POSTED' : 'DRAFT';

      const purchase: Purchase = {
        id: purchaseId,
        supplier_id: data.supplierId,
        invoice_number: data.invoiceNumber ? data.invoiceNumber.trim() : null,
        purchase_date: data.purchaseDate,
        status,
        total_taxable_paise: totalTaxable,
        total_tax_paise: totalTax,
        total_amount_paise: totalAmount,
        notes: data.notes || null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO purchases (
          id, supplier_id, invoice_number, purchase_date, status,
          total_taxable_paise, total_tax_paise, total_amount_paise, notes,
          created_at, updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchase.id, purchase.supplier_id, purchase.invoice_number, purchase.purchase_date,
          purchase.status, purchase.total_taxable_paise, purchase.total_tax_paise,
          purchase.total_amount_paise, purchase.notes, purchase.created_at,
          purchase.updated_at, purchase.deleted_at, purchase.device_id, purchase.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'purchases',
        rowId: purchase.id,
        op: 'INSERT',
        payload: purchase,
      });

      // If posted immediately, create stock batches and inward movements
      if (status === 'POSTED') {
        for (const itm of createdItems) {
          const batch = await this.stockRepo.createBatch(tx, {
            productId: itm.product_id,
            location: 'Own',
            supplierId: purchase.supplier_id,
            purchaseId: purchase.id,
            costPaise: itm.cost_paise ?? 0,
            purchaseDate: purchase.purchase_date,
            quantityIn: itm.quantity,
            attributesJson: itm.batch_attributes_json,
          });

          await this.stockRepo.addMovement(tx, {
            productId: itm.product_id,
            batchId: batch.id,
            location: 'Own',
            qtyDelta: itm.quantity,
            reason: 'PURCHASE',
            refTable: 'purchases',
            refId: purchase.id,
            notes: `Purchase Bill #${purchase.invoice_number || purchase.id.slice(0, 8)}`,
          });
        }
      }

      return { purchase, items: createdItems };
    });
  }

  async postPurchase(purchaseId: string): Promise<Purchase> {
    return this.client.transaction(async (tx, c) => {
      const full = await this.getById(purchaseId);
      if (!full) throw new Error(`Purchase not found: ${purchaseId}`);
      if (full.purchase.status === 'POSTED') {
        return full.purchase; // Already posted
      }

      const now = new Date().toISOString();
      await tx.execute(
        'UPDATE purchases SET status = ?, updated_at = ? WHERE id = ?',
        ['POSTED', now, purchaseId]
      );

      for (const itm of full.items) {
        const batch = await this.stockRepo.createBatch(tx, {
          productId: itm.product_id,
          location: 'Own',
          supplierId: full.purchase.supplier_id,
          purchaseId: full.purchase.id,
          costPaise: itm.cost_paise ?? 0,
          purchaseDate: full.purchase.purchase_date,
          quantityIn: itm.quantity,
          attributesJson: itm.batch_attributes_json,
        });

        await this.stockRepo.addMovement(tx, {
          productId: itm.product_id,
          batchId: batch.id,
          location: 'Own',
          qtyDelta: itm.quantity,
          reason: 'PURCHASE',
          refTable: 'purchases',
          refId: full.purchase.id,
          notes: `Purchase Bill #${full.purchase.invoice_number || full.purchase.id.slice(0, 8)}`,
        });
      }

      const updatedPurchase = { ...full.purchase, status: 'POSTED' as const, updated_at: now };
      await c.recordChange(tx, {
        tableName: 'purchases',
        rowId: purchaseId,
        op: 'UPDATE',
        payload: updatedPurchase,
      });

      return updatedPurchase;
    });
  }
}
