import { describe, it, expect, beforeEach } from 'vitest';
import { SCHEMA_CURRENT_SQL } from '../src/data/schema.sql';
import { runMigrations, getCurrentSchemaVersion, DowngradeNotAllowedError } from '../src/data/migrations';
import { resetDatabaseClientForTesting, IDatabaseClient } from '../src/data/sqliteClient';
import { resetAppServiceForTesting, AppService } from '../src/domain/services';
import {
  addPaise,
  subPaise,
  mulPaise,
  calcPercentBp,
  splitTaxInclusive,
  splitTaxHalf,
  roundToRupee,
  amountInWords,
  formatINR,
} from '../src/domain/money';

describe('T1: Data Layer Tests', () => {
  let db: IDatabaseClient;
  let service: AppService;

  beforeEach(async () => {
    db = resetDatabaseClientForTesting();
    service = resetAppServiceForTesting(db);
    await service.init();
  });

  describe('1. Schema Validation (No Autoincrement)', () => {
    it('verifies schema contains absolutely zero AUTOINCREMENT keywords', () => {
      const containsAutoincrement = /AUTOINCREMENT|AUTO_INCREMENT/i.test(SCHEMA_CURRENT_SQL);
      expect(containsAutoincrement).toBe(false);
    });

    it('verifies all primary key definitions use TEXT PRIMARY KEY (UUIDv7)', () => {
      const tableMatches = Array.from(
        SCHEMA_CURRENT_SQL.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)\s*\(([\s\S]+?)\);/gi)
      );
      expect(tableMatches.length).toBeGreaterThanOrEqual(14);

      for (const match of tableMatches) {
        const tableName = match[1];
        const tableBody = match[2];

        if (tableName === 'schema_version') {
          expect(tableBody).toContain('version INTEGER PRIMARY KEY');
        } else {
          expect(tableBody).toMatch(/id\s+TEXT\s+PRIMARY\s+KEY/i);
        }
      }
    });
  });

  describe('2. Migrations Engine', () => {
    it('successfully migrates up to current schema version and creates tables', async () => {
      const freshDb = resetDatabaseClientForTesting();
      const result = await runMigrations(freshDb, 2);
      expect(result.newVersion).toBe(2);

      const ver = await getCurrentSchemaVersion(freshDb);
      expect(ver).toBe(2);
    });

    it('refuses to downgrade when database version is higher than target version', async () => {
      const freshDb = resetDatabaseClientForTesting();
      await runMigrations(freshDb, 2);

      // Attempt to run with targetVersion 0
      await expect(runMigrations(freshDb, 0)).rejects.toThrow(DowngradeNotAllowedError);
    });
  });

  describe('3. Integer Paise Math', () => {
    it('performs addition, subtraction, and multiplication strictly in integer paise', () => {
      expect(addPaise(1050, 2050)).toBe(3100);
      expect(subPaise(5000, 1250)).toBe(3750);
      expect(mulPaise(2450, 4)).toBe(9800);
    });

    it('correctly calculates GST tax using basis points and half-up rounding', () => {
      // 18% of 10000 paise (₹100.00) = 1800 paise (₹18.00)
      expect(calcPercentBp(10000, 1800)).toBe(1800);
      // 18% of 105 paise = 18.9 paise -> rounds half-up to 19 paise
      expect(calcPercentBp(105, 1800)).toBe(19);
    });

    it('splits tax-inclusive prices without losing a single paise', () => {
      // Product priced at ₹118.00 (11800 paise) inclusive of 18% GST (1800 bp)
      const split = splitTaxInclusive(11800, 1800);
      expect(split.taxablePaise).toBe(10000);
      expect(split.taxPaise).toBe(1800);
      expect(split.taxablePaise + split.taxPaise).toBe(11800);

      // Test with odd paise: ₹105.55 (10555 paise) with 18% GST
      const oddSplit = splitTaxInclusive(10555, 1800);
      expect(oddSplit.taxablePaise + oddSplit.taxPaise).toBe(10555);
    });

    it('splits odd-paise tax into CGST and SGST such that cgst + sgst === totalTax exactly', () => {
      // Total tax: 15 paise
      const splitOdd = splitTaxHalf(15);
      expect(splitOdd.cgstPaise).toBe(8); // 7.5 rounded half-up to 8
      expect(splitOdd.sgstPaise).toBe(7); // remainder is 7
      expect(splitOdd.cgstPaise + splitOdd.sgstPaise).toBe(15);

      // Total tax: 101 paise
      const split101 = splitTaxHalf(101);
      expect(split101.cgstPaise).toBe(51);
      expect(split101.sgstPaise).toBe(50);
      expect(split101.cgstPaise + split101.sgstPaise).toBe(101);
    });

    it('calculates round-off to nearest rupee correctly', () => {
      // ₹100.45 (10045 paise) -> remainder 45 (< 50) -> -45 paise, total ₹100.00 (10000 paise)
      const roundDown = roundToRupee(10045);
      expect(roundDown.roundOffPaise).toBe(-45);
      expect(roundDown.roundedTotalPaise).toBe(10000);

      // ₹100.65 (10065 paise) -> remainder 65 (>= 50) -> +35 paise, total ₹101.00 (10100 paise)
      const roundUp = roundToRupee(10065);
      expect(roundUp.roundOffPaise).toBe(35);
      expect(roundUp.roundedTotalPaise).toBe(10100);

      // Exactly whole rupee
      const whole = roundToRupee(10000);
      expect(whole.roundOffPaise).toBe(0);
      expect(whole.roundedTotalPaise).toBe(10000);
    });

    it('formats Indian Lakh and Crore notation and amounts in words', () => {
      expect(formatINR(123456789, true)).toBe('₹12,34,567.89');
      expect(amountInWords(152050)).toBe('Rupees One Thousand Five Hundred Twenty and Fifty Paise Only');
      expect(amountInWords(100000000)).toBe('Rupees Ten Lakh Only');
    });
  });

  describe('4. Soft Deletes and Change Table Writes', () => {
    it('creates product and automatically records an INSERT change entry', async () => {
      const initialCount = (await service.changes.getAll(1000)).length;

      const prodId = 'prod-test-1';
      await service.products.save({
        id: prodId,
        name: 'Apollo Amazer 165/80 R14',
        sku: 'AP16580',
        hsn: '4011',
        gst_rate_bp: 2800,
        unit: 'NOS',
        selling_price_paise: 385000,
        mrp_paise: 420000,
        price_includes_tax: 1,
        category: 'Tyres',
        active: 1,
        device_id: 'dev-1',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const fetched = await service.products.getById(prodId);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(prodId);
      expect(fetched?.deleted_at).toBeUndefined();

      const newChanges = await service.changes.getAll(1000);
      expect(newChanges.length).toBe(initialCount + 1);

      const latest = newChanges[0];
      expect(latest.table_name).toBe('products');
      expect(latest.row_id).toBe(prodId);
      expect(latest.op.toUpperCase()).toBe('INSERT');
    });

    it('soft deletes product, hides it from list, and logs a DELETE change entry', async () => {
      const prodId = 'prod-temp-1';
      await service.products.save({
        id: prodId,
        name: 'Temporary Tyre',
        hsn: '4011',
        gst_rate_bp: 2800,
        unit: 'NOS',
        selling_price_paise: 100000,
        mrp_paise: 120000,
        price_includes_tax: 0,
        category: 'Tyres',
        active: 1,
        device_id: 'dev-1',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await service.products.softDelete(prodId);

      const list = await service.products.getAll();
      expect(list.some((p) => p.id === prodId)).toBe(false);

      const allChanges = await service.changes.getAll(100);
      const prodChange = allChanges.find((c) => c.row_id === prodId && c.op.toUpperCase() === 'DELETE');
      expect(prodChange).toBeDefined();
      expect(prodChange?.table_name).toBe('products');
    });
  });

  describe('5. Stock Derived Strictly From Movements', () => {
    it('derives stock quantity purely by summing stock_movements ledger', async () => {
      const prodId = 'prod-mrf-1';
      await service.products.save({
        id: prodId,
        name: 'MRF ZVTS 155/80 R13',
        hsn: '4011',
        gst_rate_bp: 2800,
        unit: 'NOS',
        selling_price_paise: 320000,
        mrp_paise: 350000,
        price_includes_tax: 1,
        active: 1,
        device_id: 'dev-1',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Initially zero
      let stock = await service.products.getStockInfo(prodId);
      expect(stock[0].quantityOnHand).toBe(0);

      // Add opening stock: 10 units
      await service.addOpeningStock({
        productId: prodId,
        quantity: 10,
        unitCostPaise: 250000,
      });

      stock = await service.products.getStockInfo(prodId);
      expect(stock[0].quantityOnHand).toBe(10);

      // Add inward movement (+5)
      await service.stock.addMovement({
        id: 'mov-1',
        product_id: prodId,
        location: 'Own',
        qty_delta: 5,
        cost_paise: 250000,
        reason: 'purchase',
        device_id: 'dev-1',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
      });

      stock = await service.products.getStockInfo(prodId);
      expect(stock[0].quantityOnHand).toBe(15);

      // Add outward movement (-3)
      await service.stock.addMovement({
        id: 'mov-2',
        product_id: prodId,
        location: 'Own',
        qty_delta: -3,
        cost_paise: 250000,
        reason: 'sale',
        device_id: 'dev-1',
        user_id: 'user-1',
        created_at: new Date().toISOString(),
      });

      stock = await service.products.getStockInfo(prodId);
      expect(stock[0].quantityOnHand).toBe(12);
    });
  });
});
