import { describe, expect, it, vi } from 'vitest';
import type { SqlDriver, SqlValue } from '../src/data/driver';
import { SqliteWorkerDatabaseClient } from '../src/data/sqliteClient';

describe('SqliteWorkerDatabaseClient', () => {
  it('forwards SQL to the real driver and runs transaction callbacks on the transaction connection', async () => {
    const calls: Array<{ sql: string; params?: SqlValue[] }> = [];
    const driver: SqlDriver = {
      exec: vi.fn(async (sql: string, params: SqlValue[] = []) => { calls.push({ sql, params }); }),
      query: vi.fn(async <T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) => {
        calls.push({ sql, params });
        return [{ value: 7 }] as T[];
      }),
      queryOne: vi.fn(async <T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) => {
        calls.push({ sql, params });
        return { value: 7 } as T;
      }),
      transaction: vi.fn(async <T>(fn: (tx: SqlDriver) => Promise<T>) => fn(driver)),
      exportDatabase: vi.fn(async () => new Uint8Array()),
      close: vi.fn(async () => {}),
    };

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
});

it('restores immutable-ledger snapshots by recreating triggers inside the transaction', async () => {
  const executed: string[] = [];
  const driver: SqlDriver = {
    exec: vi.fn(async (sql: string) => { executed.push(sql); }),
    query: vi.fn(async <T = Record<string, unknown>>(sql: string) => {
      if (sql.includes("type = 'table'")) return [{ name: 'demo' }] as T[];
      if (sql.includes("type = 'trigger'")) return [{ name: 'trg_demo_immutable' }] as T[];
      return [] as T[];
    }),
    queryOne: vi.fn(async () => null),
    transaction: vi.fn(async <T>(fn: (tx: SqlDriver) => Promise<T>) => fn(driver)),
    exportDatabase: vi.fn(async () => new Uint8Array()),
    close: vi.fn(async () => {}),
  };

  const client = new SqliteWorkerDatabaseClient(driver);
  await client.restoreAllData({ demo: [{ id: 'row-1', value: 1 }] });

  expect(executed).toContain('PRAGMA foreign_keys = OFF');
  expect(executed).toContain('DROP TRIGGER IF EXISTS "trg_demo_immutable"');
  expect(executed).toContain('DELETE FROM "demo"');
  expect(executed.some((sql) => sql.startsWith('CREATE TRIGGER IF NOT EXISTS'))).toBe(true);
  expect(executed.at(-1)).toBe('PRAGMA foreign_keys = ON');
});
