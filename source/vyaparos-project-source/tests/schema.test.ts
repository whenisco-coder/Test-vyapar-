import { describe, it, expect } from 'vitest';
import { SCHEMA_CURRENT_SQL } from '../src/data/schema.sql';

describe('Schema Integrity & Key Constraints (D5)', () => {
  it('scans schema SQL and confirms zero AUTOINCREMENT keywords exist', () => {
    const hasAutoincrement = /AUTOINCREMENT|AUTO_INCREMENT/i.test(SCHEMA_CURRENT_SQL);
    expect(hasAutoincrement).toBe(false);
  });

  it('includes approved Ajrakhika, sync, reversal, and checkpoint schema', () => {
    expect(SCHEMA_CURRENT_SQL).toContain('CREATE TABLE IF NOT EXISTS artisans');
    expect(SCHEMA_CURRENT_SQL).toContain('product_kind');
    expect(SCHEMA_CURRENT_SQL).toContain('unique_piece_code');
    expect(SCHEMA_CURRENT_SQL).toContain('CREATE TABLE IF NOT EXISTS device_clock');
    expect(SCHEMA_CURRENT_SQL).toContain('CREATE TABLE IF NOT EXISTS stock_checkpoints');
    expect(SCHEMA_CURRENT_SQL).toContain('CREATE TABLE IF NOT EXISTS sync_checkpoints');
    expect(SCHEMA_CURRENT_SQL).toContain('CREATE TABLE IF NOT EXISTS invoice_reversals');
    expect(SCHEMA_CURRENT_SQL).toContain('trg_finalized_invoice_no_update');
    expect(SCHEMA_CURRENT_SQL).toContain('uq_invoices_series_fy_seq');
  });

  it('verifies all entity tables have UUIDv7 text primary keys', () => {
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
