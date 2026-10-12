import { describe, expect, it, vi } from 'vitest';
import type { SqlDriver, SqlRow, SqlValue } from '../src/data/driver';
import { SqliteWorkerDatabaseClient } from '../src/data/sqliteClient';

function makeDriver(calls: Array<{ sql: string; params?: SqlValue[] }> = [], executed: string[] = []): SqlDriver {
  let driver: SqlDriver;
  const exec: SqlDriver['exec'] = async (sql, params = []) => {
    calls.push({ sql, params });
    executed.push(sql);
  };
  const query: SqlDriver['query'] = async <T = SqlRow>(sql: string, params: SqlValue[] = []) => {
    calls.push({ sql, params });
    if (/^\s*PRAGMA\s+table_info\s*\(\s*"?demo"?\s*\)/i.test(sql)) {
      return [{ name: 'id' }, { name: 'value' }] as unknown as T[];
    }
    if (sql.includes("type = 'table'")) return [{ name: 'demo' }] as unknown as T[];
    if (sql.includes("type = 'trigger'")) return [{ name: 'trg_demo_immutable' }] as unknown as T[];
    return [{ value: 7 }] as unknown as T[];
  };
  const queryOne: SqlDriver['queryOne'] = async <T = SqlRow>(sql: string, params: SqlValue[] = []) => {
    calls.push({ sql, params });
    return { value: 7 } as unknown as T;
  };
  const transaction: SqlDriver['transaction'] = async <T>(fn: (tx: SqlDriver) => Promise<T>) => fn(driver);
  driver = {
    exec: vi.fn(exec),
    query: vi.fn(query),
    queryOne: vi.fn(queryOne),
    transaction: vi.fn(transaction),
    exportDatabase: vi.fn(async () => new Uint8Array()),
    close: vi.fn(async () => {}),
  };
  return driver;
}

describe('SqliteWorkerDatabaseClient', () => {
  it('forwards SQL to the real driver and runs transaction callbacks on the transaction connection', async () => {
    const calls: Array<{ sql: string; params?: SqlValue[] }> = [];
    const driver = makeDriver(calls);
    const client = new SqliteWorkerDatabaseClient(driver);
    await expect(client.queryOne('SELECT 7 AS value')).resolves.toEqual({ value: 7 });
    await client.execute('UPDATE demo SET value = ?', [7]);
    const result = await client.transaction(async (tx) => {
      await tx.execute('INSERT INTO demo (value) VALUES (?)', [8]);
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(driver.queryOne).toHaveBeenCalledWith('SELECT 7 AS value', []);
    expect(calls.some((call) => call.sql.startsWith('UPDATE demo'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('INSERT INTO demo'))).toBe(true);
    expect(driver.transaction).toHaveBeenCalledTimes(1);
  });

  it('normalizes undefined SQL parameters to null before binding', async () => {
    const calls: Array<{ sql: string; params?: SqlValue[] }> = [];
    const driver = makeDriver(calls);
    const client = new SqliteWorkerDatabaseClient(driver);

    await client.execute('UPDATE demo SET value = ?', [undefined]);
    await client.query('SELECT value FROM demo WHERE value = ?', [undefined]);
    await client.queryOne('SELECT value FROM demo WHERE value = ?', [undefined]);

    expect(calls.filter((call) => call.sql.includes('demo')).map((call) => call.params)).toEqual([[null], [null], [null]]);
  });

  it('restores immutable-ledger snapshots by recreating triggers inside the transaction', async () => {
    const executed: string[] = [];
    const driver = makeDriver([], executed);
    const client = new SqliteWorkerDatabaseClient(driver);
    await client.restoreAllData({ demo: [{ id: 'row-1', value: 1 }] });

    expect(executed).toContain('PRAGMA foreign_keys = OFF');
    expect(executed).toContain('DROP TRIGGER IF EXISTS "trg_demo_immutable"');
    expect(executed).toContain('DELETE FROM "demo"');
    expect(executed.some((sql) => sql.startsWith('CREATE TRIGGER IF NOT EXISTS'))).toBe(true);
    expect(executed.at(-1)).toBe('PRAGMA foreign_keys = ON');
  });
});
