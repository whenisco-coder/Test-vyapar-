import { describe, it, expect } from 'vitest';
import {
  allocateFifoStock,
  calculateWeightedAverageCost,
  InsufficientStockError,
} from '../src/domain/fifo';
import { StockBatch } from '../src/domain/types';

describe('FIFO & Stock Valuation Engine (D6, D7, D26)', () => {
  const dummyBatches: Array<StockBatch & { remainingQty: number }> = [
    {
      id: 'batch-1',
      product_id: 'prod-tyre',
      location: 'Own',
      cost_paise: 300000, // ₹ 3,000.00 each
      purchase_date: '2026-01-10',
      quantity_in: 5,
      remainingQty: 5,
      device_id: 'dev-1',
      user_id: 'usr-1',
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-01-10T10:00:00Z',
    },
    {
      id: 'batch-2',
      product_id: 'prod-tyre',
      location: 'Own',
      cost_paise: 320000, // ₹ 3,200.00 each
      purchase_date: '2026-02-15',
      quantity_in: 10,
      remainingQty: 10,
      device_id: 'dev-1',
      user_id: 'usr-1',
      created_at: '2026-02-15T10:00:00Z',
      updated_at: '2026-02-15T10:00:00Z',
    },
  ];

  it('consumes oldest batch first when requested qty fits in one batch', () => {
    const batches = JSON.parse(JSON.stringify(dummyBatches));
    const result = allocateFifoStock(batches, 'MRF Tyre', 3);

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe('batch-1');
    expect(result.allocations[0].quantity).toBe(3);
    expect(result.allocations[0].costPaise).toBe(300000);
    expect(result.totalCostPaise).toBe(900000); // 3 * 3,000.00
    expect(result.averageUnitCostPaise).toBe(300000);
  });

  it('spans multiple batches in strict FIFO order when requested qty exceeds oldest batch', () => {
    const batches = JSON.parse(JSON.stringify(dummyBatches));
    // Request 8 tyres: 5 from batch-1 (cost 3000), 3 from batch-2 (cost 3200)
    const result = allocateFifoStock(batches, 'MRF Tyre', 8);

    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].batchId).toBe('batch-1');
    expect(result.allocations[0].quantity).toBe(5);
    expect(result.allocations[0].costPaise).toBe(300000);

    expect(result.allocations[1].batchId).toBe('batch-2');
    expect(result.allocations[1].quantity).toBe(3);
    expect(result.allocations[1].costPaise).toBe(320000);

    // Total cost = 5*300000 + 3*320000 = 1500000 + 960000 = 2460000 paise (₹ 24,600.00)
    expect(result.totalCostPaise).toBe(2460000);
    expect(result.averageUnitCostPaise).toBe(307500); // 2460000 / 8
  });

  it('throws InsufficientStockError when requested qty exceeds stock and negative stock is disallowed', () => {
    const batches = JSON.parse(JSON.stringify(dummyBatches));
    expect(() => allocateFifoStock(batches, 'MRF Tyre', 20, false)).toThrowError(
      InsufficientStockError
    );
  });

  it('allows negative stock when enabled and returns uncosted quantity', () => {
    const batches = JSON.parse(JSON.stringify(dummyBatches));
    const result = allocateFifoStock(batches, 'MRF Tyre', 20, true);

    expect(result.uncostedQty).toBe(5); // 20 - 15 = 5 uncosted
    expect(result.totalCostPaise).toBe(5 * 300000 + 10 * 320000);
  });

  it('calculates weighted average cost correctly', () => {
    const sample = [
      { remainingQty: 5, costPaise: 300000 },
      { remainingQty: 10, costPaise: 320000 },
    ];
    // (5*300000 + 10*320000) / 15 = 4700000 / 15 = 313333 paise
    const avg = calculateWeightedAverageCost(sample);
    expect(avg).toBe(313333);
  });
});
