import { StockBatch, StockMovement } from './types';

export interface StockBalanceCheckpoint {
  product_id: string;
  location: string;
  quantity: number;
}

export interface BatchBalanceCheckpoint {
  batch_id: string;
  product_id: string;
  location: string;
  quantity_remaining: number;
  cost_paise: number;
}

export interface StockCheckpointPayload {
  format: 'vyapar-os-stock-checkpoint-v1';
  through_movement_id: string | null;
  through_created_at: string;
  stock_balances: StockBalanceCheckpoint[];
  batch_balances: BatchBalanceCheckpoint[];
  integrity_warnings: string[];
}

export interface BuiltStockCheckpoint {
  payload: StockCheckpointPayload;
  snapshot_json: string;
  checksum: string;
  row_count: number;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build a deterministic checkpoint entirely from the append-only movement ledger. */
export async function buildStockCheckpoint(
  movements: StockMovement[],
  batches: StockBatch[],
): Promise<BuiltStockCheckpoint> {
  const orderedMovements = [...movements].sort((a, b) =>
    compareText(a.created_at, b.created_at) || compareText(a.id, b.id)
  );
  const latest = orderedMovements[orderedMovements.length - 1];
  const balances = new Map<string, number>();
  const batchBalances = new Map<string, number>();

  for (const movement of orderedMovements) {
    const balanceKey = `${movement.product_id}\u0000${movement.location}`;
    balances.set(balanceKey, (balances.get(balanceKey) ?? 0) + movement.qty_delta);
    if (movement.batch_id) {
      batchBalances.set(movement.batch_id, (batchBalances.get(movement.batch_id) ?? 0) + movement.qty_delta);
    }
  }

  const stockBalances = [...balances.entries()].map(([key, quantity]) => {
    const [product_id, location] = key.split('\u0000');
    return { product_id, location, quantity };
  }).sort((a, b) => compareText(a.product_id, b.product_id) || compareText(a.location, b.location));

  const warnings: string[] = [];
  const knownBatchIds = new Set(batches.map((batch) => batch.id));
  for (const movement of orderedMovements) {
    if (movement.batch_id && !knownBatchIds.has(movement.batch_id)) {
      warnings.push(`Movement ${movement.id} references missing batch ${movement.batch_id}`);
    }
  }

  const batchBalancesSorted: BatchBalanceCheckpoint[] = batches.map((batch) => {
    const quantity_remaining = batchBalances.get(batch.id) ?? 0;
    if (quantity_remaining < 0) warnings.push(`Batch ${batch.id} has negative ledger balance ${quantity_remaining}`);
    return {
      batch_id: batch.id,
      product_id: batch.product_id,
      location: batch.location,
      quantity_remaining,
      cost_paise: batch.cost_paise,
    };
  }).sort((a, b) => compareText(a.batch_id, b.batch_id));

  const payload: StockCheckpointPayload = {
    format: 'vyapar-os-stock-checkpoint-v1',
    through_movement_id: latest?.id ?? null,
    through_created_at: latest?.created_at ?? new Date(0).toISOString(),
    stock_balances: stockBalances,
    batch_balances: batchBalancesSorted,
    integrity_warnings: [...new Set(warnings)].sort(compareText),
  };
  const snapshot_json = JSON.stringify(payload);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot_json));
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { payload, snapshot_json, checksum, row_count: stockBalances.length + batchBalancesSorted.length };
}

export async function verifyStockCheckpoint(snapshotJson: string, checksum: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotJson));
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== checksum) return false;
  try {
    const payload = JSON.parse(snapshotJson) as StockCheckpointPayload;
    return payload.format === 'vyapar-os-stock-checkpoint-v1' && Array.isArray(payload.stock_balances) && Array.isArray(payload.batch_balances);
  } catch {
    return false;
  }
}
