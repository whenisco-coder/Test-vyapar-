import { StockBatch } from './types';

export class InsufficientStockError extends Error {
  constructor(
    public readonly productName: string,
    public readonly requestedQty: number,
    public readonly availableQty: number
  ) {
    super(
      `Insufficient stock for "${productName}". Requested: ${requestedQty}, Available: ${availableQty}.`
    );
    this.name = 'InsufficientStockError';
  }
}

export interface BatchAllocation {
  batchId: string;
  quantity: number;
  costPaise: number;
  totalCostPaise: number;
}

export interface FifoAllocationResult {
  allocations: BatchAllocation[];
  consumedBatches: Array<{ batch_id: string; quantity: number; cost_paise: number }>;
  totalCostPaise: number;
  averageUnitCostPaise: number;
  uncostedQty: number; // > 0 if negative stock permitted
}

/**
 * Consumes stock using FIFO (First-In, First-Out) order.
 * Batches must be pre-filtered for the product & location, sorted by:
 * 1. purchase_date ASC
 * 2. created_at ASC
 */
export function allocateFifoStock(
  batches: Array<StockBatch & { remainingQty: number }>,
  productName: string,
  requestedQty: number,
  allowNegativeStock: boolean = false
): FifoAllocationResult {
  if (requestedQty <= 0) {
    return {
      allocations: [],
      consumedBatches: [],
      totalCostPaise: 0,
      averageUnitCostPaise: 0,
      uncostedQty: 0,
    };
  }

  // Calculate total available quantity
  const totalAvailable = batches.reduce((sum, b) => sum + Math.max(0, b.remainingQty), 0);

  if (requestedQty > totalAvailable && !allowNegativeStock) {
    throw new InsufficientStockError(productName, requestedQty, totalAvailable);
  }

  const allocations: BatchAllocation[] = [];
  let remainingToAllocate = requestedQty;
  let totalCostPaise = 0;

  for (const batch of batches) {
    if (remainingToAllocate <= 0) break;
    if (batch.remainingQty <= 0) continue;

    const qtyFromThisBatch = Math.min(batch.remainingQty, remainingToAllocate);
    const lineCost = qtyFromThisBatch * batch.cost_paise;

    allocations.push({
      batchId: batch.id,
      quantity: qtyFromThisBatch,
      costPaise: batch.cost_paise,
      totalCostPaise: lineCost,
    });

    totalCostPaise += lineCost;
    remainingToAllocate -= qtyFromThisBatch;
    batch.remainingQty -= qtyFromThisBatch;
  }

  // If negative stock was permitted, whatever remaining couldn't be fulfilled by batches is uncosted
  const uncostedQty = remainingToAllocate > 0 ? remainingToAllocate : 0;
  const costedQty = requestedQty - uncostedQty;
  const averageUnitCostPaise =
    costedQty > 0 ? Math.floor(totalCostPaise / costedQty) : 0;

  return {
    allocations,
    consumedBatches: allocations.map((a) => ({
      batch_id: a.batchId,
      quantity: a.quantity,
      cost_paise: a.costPaise,
    })),
    totalCostPaise,
    averageUnitCostPaise,
    uncostedQty,
  };
}

/**
 * Calculates weighted average cost for batches
 */
export function calculateWeightedAverageCost(
  batches: Array<{ remainingQty: number; costPaise: number }>
): number {
  let totalQty = 0;
  let totalValue = 0;

  for (const b of batches) {
    if (b.remainingQty > 0) {
      totalQty += b.remainingQty;
      totalValue += b.remainingQty * b.costPaise;
    }
  }

  if (totalQty === 0) return 0;
  return Math.floor(totalValue / totalQty);
}

export type StockBatchRecord = Partial<StockBatch> & {
  id: string;
  product_id: string;
  location: string;
  cost_paise: number;
  purchase_date: string;
  quantity_in: number;
  remainingQty?: number;
  remaining_qty?: number;
  created_at?: string;
  [key: string]: any;
};

export function allocateFifoBatches(
  arg1: any,
  requestedQty?: number,
  allowNegative: boolean = false
): FifoAllocationResult {
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    const batches = (arg1.availableBatches || []).map((b: any) => ({
      ...b,
      remainingQty: b.remainingQty ?? b.remaining_qty ?? b.quantity_in ?? 0,
    }));
    return allocateFifoStock(batches, 'Product', arg1.requestedQty, !!arg1.allowNegativeStock);
  }
  const batches = (arg1 || []).map((b: any) => ({
    ...b,
    remainingQty: b.remainingQty ?? b.remaining_qty ?? b.quantity_in ?? 0,
  }));
  return allocateFifoStock(batches, 'Product', requestedQty || 0, allowNegative);
}

export function allocateWeightedAverageBatches(
  arg1: any,
  requestedQty?: number,
  allowNegative: boolean = false
): FifoAllocationResult {
  return allocateFifoBatches(arg1, requestedQty, allowNegative);
}

