import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMigrations, DowngradeNotAllowedError } from '../src/data/migrations';
import { SCHEMA_VERSION } from '../src/data/schema';

/** Real SQLite adapter for integration tests; unlike MemoryStorageDatabase, this executes SQLite SQL. */
class RealSqliteTestDatabase {
  readonly raw: DatabaseSync;
  readonly backupDirectory: string;
  exportCount = 0;
  persistCount = 0;

  constructor(readonly databasePath: string, backupDirectory: string) {
    this.raw = new DatabaseSync(databasePath);
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.backupDirectory = backupDirectory;
    mkdirSync(backupDirectory, { recursive: true });
  }

  async exec(sql: string, params: any[] = []): Promise<void> {
    if (params.length) this.raw.prepare(sql).run(...params);
    else this.raw.exec(sql);
  }

  async query<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...params).map((row) => ({ ...row })) as T[];
  }

  async queryOne<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T | null> {
    const row = this.raw.prepare(sql).get(...params) as T | undefined;
    return row ? ({ ...row } as T) : null;
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.raw.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.raw.exec('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    }
  }

  async exportDatabase(): Promise<Uint8Array> {
    this.exportCount++;
    return new Uint8Array(readFileSync(this.databasePath));
  }

  async persistSafetyBackup(bytes: Uint8Array): Promise<void> {
    this.persistCount++;
    const name = `safety-${Date.now()}-${this.persistCount}.sqlite3`;
    writeFileSync(path.join(this.backupDirectory, name), bytes);
    const backups = readdirSync(this.backupDirectory).filter((file) => file.endsWith('.sqlite3')).sort().reverse();
    for (const old of backups.slice(3)) rmSync(path.join(this.backupDirectory, old));
  }

  close(): void { this.raw.close(); }
}

let testRoots: string[] = [];
function createDatabase(): RealSqliteTestDatabase {
  const root = mkdtempSync(path.join(tmpdir(), 'vyapar-os-real-sqlite-'));
  testRoots.push(root);
  return new RealSqliteTestDatabase(path.join(root, 'app.sqlite3'), path.join(root, 'backups'));
}
afterEach(() => {
  for (const root of testRoots) rmSync(root, { recursive: true, force: true });
  testRoots = [];
});

describe('real SQLite migration and constraint integration', () => {
  it('migrates a fresh database to the current schema', async () => {
    const db = createDatabase();
    const result = await runMigrations(db);
    expect(result).toMatchObject({ previousVersion: 0, newVersion: SCHEMA_VERSION });
    expect(result.safetyBackup).toBeUndefined();
    expect(await db.queryOne('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'stock_movements\'')).not.toBeNull();
    expect(await db.queryOne<{ user_version: number }>('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION });
    db.close();
  });

  it('makes the second launch a no-op without exporting or persisting a backup', async () => {
    const db = createDatabase();
    await runMigrations(db);
    const result = await runMigrations(db);
    expect(result).toEqual({ previousVersion: SCHEMA_VERSION, newVersion: SCHEMA_VERSION });
    expect(db.exportCount).toBe(0);
    expect(db.persistCount).toBe(0);
    expect(readdirSync(db.backupDirectory)).toHaveLength(0);
    db.close();
  });

  it('refuses a downgrade', async () => {
    const db = createDatabase();
    await runMigrations(db);
    await expect(runMigrations(db, SCHEMA_VERSION - 1)).rejects.toBeInstanceOf(DowngradeNotAllowedError);
    db.close();
  });

  it('creates a persistent raw safety backup before upgrading a real v1 schema fixture', async () => {
    const db = createDatabase();
    const fixture = readFileSync(path.resolve('tests/fixtures/schema-v1.sql'), 'utf8');
    db.raw.exec(fixture);
    db.raw.exec("INSERT INTO schema_version (version, applied_at, description) VALUES (1, '2026-01-01T00:00:00.000Z', 'historical v1 fixture')");
    db.raw.exec('PRAGMA user_version = 1');

    const result = await runMigrations(db);
    expect(result).toMatchObject({ previousVersion: 1, newVersion: SCHEMA_VERSION });
    expect(result.safetyBackup).toBeInstanceOf(Uint8Array);
    expect(db.exportCount).toBe(1);
    expect(db.persistCount).toBe(1);
    const files = readdirSync(db.backupDirectory).filter((file) => file.endsWith('.sqlite3'));
    expect(files).toHaveLength(1);
    expect(existsSync(path.join(db.backupDirectory, files[0]))).toBe(true);
    expect(await db.queryOne<{ product_kind: string }>("SELECT product_kind FROM products LIMIT 1")).toBeNull();
    expect(await db.queryOne<{ user_version: number }>('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION });
    db.close();
  });


  it('retains only the newest three persisted safety backups', async () => {
    const db = createDatabase();
    for (let index = 0; index < 4; index++) await db.persistSafetyBackup(new Uint8Array([index + 1]));
    const files = readdirSync(db.backupDirectory).filter((file) => file.endsWith('.sqlite3'));
    expect(files).toHaveLength(3);
    expect(files.some((file) => file.endsWith('-1.sqlite3'))).toBe(false);
    db.close();
  });

  it('enforces append-only stock ledger triggers and foreign keys', async () => {
    const db = createDatabase();
    await runMigrations(db);
    const now = new Date().toISOString();
    await db.exec(`INSERT INTO products (id, name, hsn, gst_rate_bp, unit, selling_price_paise, mrp_paise, price_includes_tax, category, active, min_stock_alert, device_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'product-1', 'Test Product', '1234', 1800, 'NOS', 10000, 10000, 0, 'Test', 1, 0, 'device-1', 'user-1', now, now,
    ]);
    await db.exec(`INSERT INTO stock_movements (id, product_id, location, qty_delta, cost_paise, reason, ref_table, device_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'movement-1', 'product-1', 'Own', 5, 2000, 'opening', 'manual', 'device-1', 'user-1', now,
    ]);
    expect(() => db.raw.prepare("UPDATE stock_movements SET qty_delta = 4 WHERE id = 'movement-1'").run()).toThrow(/append-only ledger/);
    expect(() => db.raw.prepare("DELETE FROM stock_movements WHERE id = 'movement-1'").run()).toThrow(/append-only ledger/);
    expect(() => db.raw.prepare(`INSERT INTO stock_movements (id, product_id, location, qty_delta, cost_paise, reason, ref_table, device_id, user_id, created_at) VALUES ('bad-movement', 'missing-product', 'Own', 1, 0, 'opening', 'manual', 'device-1', 'user-1', ?)`).run(now)).toThrow(/FOREIGN KEY constraint failed/);
    expect(await db.queryOne<{ on_hand_qty: number }>("SELECT on_hand_qty FROM stock_on_hand WHERE product_id = 'product-1' AND location = 'Own'")).toEqual({ on_hand_qty: 5 });
    db.close();
  });

  it('returns correct stock and customer dues from derived views', async () => {
    const db = createDatabase();
    await runMigrations(db);
    const now = new Date().toISOString();
    await db.exec(`INSERT INTO customers (id, name, type, party_kind, state_code, device_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'customer-1', 'Test Customer', 'customer', 'B2B', '24', 'device-1', 'user-1', now, now,
    ]);
    await db.exec(`INSERT INTO products (id, name, hsn, gst_rate_bp, unit, selling_price_paise, mrp_paise, price_includes_tax, category, active, min_stock_alert, device_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'product-1', 'Test Product', '1234', 1800, 'NOS', 10000, 10000, 0, 'Test', 1, 0, 'device-1', 'user-1', now, now,
    ]);
    await db.exec(`INSERT INTO stock_movements (id, product_id, location, qty_delta, cost_paise, reason, ref_table, device_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'movement-1', 'product-1', 'Own', 5, 2000, 'opening', 'manual', 'device-1', 'user-1', now,
    ]);
    await db.exec(`INSERT INTO invoices (id, invoice_number, series, sequence_number, financial_year, invoice_date, customer_id, customer_snapshot_json, mode, status, is_interstate, taxable_total_paise, cgst_total_paise, sgst_total_paise, igst_total_paise, tax_total_paise, round_off_paise, grand_total_paise, device_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'invoice-1', 'INV/2026-27/0001', 'INV', 1, '2026-27', now.slice(0, 10), 'customer-1', '{"name":"Test Customer"}', 'tax_invoice', 'finalized', 0, 10000, 900, 900, 0, 1800, 0, 11800, 'device-1', 'user-1', now, now,
    ]);
    await db.exec(`INSERT INTO payments (id, invoice_id, customer_id, amount_paise, mode, paid_at, device_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'payment-1', 'invoice-1', 'customer-1', 4000, 'cash', now, 'device-1', 'user-1', now,
    ]);
    expect(await db.queryOne<{ on_hand_qty: number }>("SELECT on_hand_qty FROM stock_on_hand WHERE product_id = 'product-1' AND location = 'Own'")).toEqual({ on_hand_qty: 5 });
    expect(await db.queryOne<{ total_invoiced_paise: number; total_paid_paise: number; balance_paise: number }>("SELECT total_invoiced_paise, total_paid_paise, balance_paise FROM customer_dues WHERE customer_id = 'customer-1'")).toEqual({
      total_invoiced_paise: 11800, total_paid_paise: 4000, balance_paise: 7800,
    });
    expect(() => db.raw.prepare("UPDATE payments SET amount_paise = 3000 WHERE id = 'payment-1'").run()).toThrow(/append-only ledger/);
    expect(() => db.raw.prepare("DELETE FROM payments WHERE id = 'payment-1'").run()).toThrow(/append-only ledger/);
    db.close();
  });
});
