import { describe, it, expect } from 'vitest';
import { Product } from '../src/domain/types';
import { ProductRepo } from '../src/domain/repos/databaseRepos';
import { resetDatabaseClientForTesting } from '../src/data/sqliteClient';
import { generateUUIDv7 } from '../src/domain/uuid';
import { SCHEMA_CURRENT_SQL } from '../src/data/schema.sql';

describe('Search Performance Benchmark (T2)', () => {
  it('searches across 500 products in under 200 milliseconds', async () => {
    const db = resetDatabaseClientForTesting();
    await db.execute(SCHEMA_CURRENT_SQL);
    const repo = new ProductRepo(db);

    const now = new Date().toISOString();
    // Pre-populate 500 products
    for (let i = 1; i <= 500; i++) {
      const p: Product = {
        id: generateUUIDv7(),
        name: `Automotive Spare Part Model ${i} - Type ${(i % 10).toString()}`,
        sku: `SKU-AUTO-${i.toString().padStart(4, '0')}`,
        hsn: (4000 + (i % 500)).toString(),
        gst_rate_bp: 1800,
        unit: 'NOS',
        selling_price_paise: i * 1000,
        mrp_paise: i * 1200,
        price_includes_tax: 1,
        category: `Category ${(i % 8).toString()}`,
        active: 1,
        min_stock_alert: 5,
        device_id: 'benchmark-device',
        user_id: 'benchmark-user',
        created_at: now,
        updated_at: now,
      };
      await repo.save(p);
    }

    // Benchmark search operation
    const startTime = performance.now();
    const results = await repo.search('Model 250');
    const elapsed = performance.now() - startTime;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200); // Strict under 200ms threshold
  });
});
