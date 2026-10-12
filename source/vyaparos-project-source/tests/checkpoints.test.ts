import { describe, expect, it } from 'vitest';
import { buildStockCheckpoint, verifyStockCheckpoint } from '../src/domain/checkpoints';
import { StockBatch, StockMovement } from '../src/domain/types';

const movement = (id: string, qty_delta: number, created_at: string, batch_id = 'batch-a'): StockMovement => ({
  id, product_id: 'product-a', batch_id, location: 'Own', qty_delta, cost_paise: 2500,
  reason: qty_delta < 0 ? 'sale' : 'opening', device_id: 'device-a', user_id: 'user-a', created_at,
});

const batch: StockBatch = {
  id: 'batch-a', product_id: 'product-a', location: 'Own', cost_paise: 2500,
  purchase_date: '2026-01-01', quantity_in: 10, device_id: 'device-a', user_id: 'user-a',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Stock replay checkpoints', () => {
  it('derives balances from the append-only ledger and builds a deterministic checksum', async () => {
    const movements = [
      movement('m1', 10, '2026-01-01T00:00:00.000Z'),
      movement('m2', -3, '2026-01-02T00:00:00.000Z'),
      movement('m3', 1, '2026-01-03T00:00:00.000Z'),
    ];
    const first = await buildStockCheckpoint(movements, [batch]);
    const second = await buildStockCheckpoint([...movements].reverse(), [batch]);
    expect(first.payload.stock_balances).toEqual([{ product_id: 'product-a', location: 'Own', quantity: 8 }]);
    expect(first.payload.batch_balances[0].quantity_remaining).toBe(8);
    expect(first.snapshot_json).toBe(second.snapshot_json);
    expect(first.checksum).toBe(second.checksum);
    expect(await verifyStockCheckpoint(first.snapshot_json, first.checksum)).toBe(true);
    expect(await verifyStockCheckpoint(first.snapshot_json + ' ', first.checksum)).toBe(false);
  });

  it('reports movements that reference missing batches and negative batch balances', async () => {
    const result = await buildStockCheckpoint([
      movement('m1', -2, '2026-01-01T00:00:00.000Z', 'missing-batch'),
      movement('m2', -1, '2026-01-02T00:00:00.000Z', 'batch-a'),
    ], [batch]);
    expect(result.payload.integrity_warnings.some((warning) => warning.includes('missing batch'))).toBe(true);
    expect(result.payload.integrity_warnings.some((warning) => warning.includes('negative ledger balance'))).toBe(true);
  });
});
