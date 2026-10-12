import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqlDriver, SqlRow, SqlValue } from './driver';

export class MemoryDriver implements SqlDriver {
  private sqlite3: any = null;
  private db: any = null;
  private mutexChain: Promise<any> = Promise.resolve();

  constructor() {}

  async init(): Promise<void> {
    if (this.db) return;
    this.sqlite3 = await sqlite3InitModule();
    this.db = new this.sqlite3.oo1.DB(':memory:', 'c');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutexChain.then(fn, fn);
    this.mutexChain = next.then(() => {}, () => {});
    return next;
  }

  async exec(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.init();
    return this.enqueue(async () => {
      this.db.exec({
        sql,
        bind: params,
      });
    });
  }

  async query<T = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    await this.init();
    return this.enqueue(async () => {
      const rows: T[] = [];
      this.db.exec({
        sql,
        bind: params,
        rowMode: 'object',
        callback: (row: any) => {
          rows.push({ ...row });
        },
      });
      return rows;
    });
  }

  async queryOne<T = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    await this.init();
    return this.enqueue(async () => {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        // Within transaction boundary, statements execute directly without re-enqueuing
        const txDriver: SqlDriver = {
          exec: async (sql: string, params: SqlValue[] = []) => {
            this.db.exec({ sql, bind: params });
          },
          query: async <R = SqlRow>(sql: string, params: SqlValue[] = []) => {
            const rows: R[] = [];
            this.db.exec({
              sql,
              bind: params,
              rowMode: 'object',
              callback: (row: any) => {
                rows.push({ ...row });
              },
            });
            return rows;
          },
          queryOne: async <R = SqlRow>(sql: string, params: SqlValue[] = []) => {
            const rows = await txDriver.query<R>(sql, params);
            return rows.length > 0 ? rows[0] : null;
          },
          transaction: async () => {
            throw new Error('Nested transactions not supported');
          },
          exportDatabase: async () => {
            return this.sqlite3.capi.sqlite3_js_db_export(this.db);
          },
          close: async () => {},
        };

        const result = await fn(txDriver);
        this.db.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error if already aborted
        }
        throw err;
      }
    });
  }

  async exportDatabase(): Promise<Uint8Array> {
    await this.init();
    return this.enqueue(async () => {
      return this.sqlite3.capi.sqlite3_js_db_export(this.db);
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.enqueue(async () => {
        this.db.close();
        this.db = null;
      });
    }
  }

  /**
   * Helper for tests: retrieve underlying DB instance
   */
  getRawDb(): any {
    return this.db;
  }
}
