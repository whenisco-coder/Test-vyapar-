/**
 * Browser SQLite Driver over Dedicated Web Worker
 *
 * Implements SqlDriver interface.
 * Connects to Web Worker running @sqlite.org/sqlite-wasm with opfs-sahpool VFS.
 * Enforces single-tab exclusivity with navigator.locks.
 * Uses mutex queue for transaction atomicity and statement ordering.
 */

import { SqlDriver, SqlRow, SqlValue, OpfsNotSupportedError, StorageUnavailableError, TabLockedError } from './driver';

export class WorkerDriver implements SqlDriver {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private mutexChain: Promise<any> = Promise.resolve();
  private lockAcquired = false;
  private releaseHeldLock: (() => void) | null = null;
  private isInitialized = false;

  constructor() {}

  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      throw new StorageUnavailableError('Web Workers are not supported in this environment');
    }

    // Step 1: enforce single-tab access. Web Locks rejects combining ifAvailable and signal.
    // Keep the lock request pending until close()/init-failure resolves the held-lock gate.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      let acquisitionSettled = false;
      let resolveAcquisition!: (value: boolean) => void;
      let rejectAcquisition!: (error: unknown) => void;
      const acquired = new Promise<boolean>((resolve, reject) => {
        resolveAcquisition = resolve;
        rejectAcquisition = reject;
      });

      void navigator.locks.request('business_os_sahpool_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          acquisitionSettled = true;
          resolveAcquisition(false);
          return;
        }
        this.lockAcquired = true;
        acquisitionSettled = true;
        resolveAcquisition(true);
        await new Promise<void>((release) => { this.releaseHeldLock = release; });
        this.releaseHeldLock = null;
        this.lockAcquired = false;
      }).catch((error: unknown) => {
        if (!acquisitionSettled) rejectAcquisition(error);
      });

      let gotLock: boolean;
      try {
        gotLock = await acquired;
      } catch (error) {
        throw new StorageUnavailableError(`Could not acquire the browser tab lock: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!gotLock) throw new TabLockedError();
    }

    // Step 2: Spawn dedicated worker
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err: any) {
      this.releaseHeldLock?.();
      this.releaseHeldLock = null;
      this.lockAcquired = false;
      throw new StorageUnavailableError(`Failed to spawn SQLite Web Worker: ${err?.message || err}`);
    }

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, success, rows, bytes, result, error, errorCode } = e.data;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        if (success) {
          pending.resolve(result ?? rows ?? bytes ?? null);
        } else {
          if (errorCode === 'TAB_LOCKED') pending.reject(new TabLockedError());
          else if (errorCode === 'OPFS_NOT_SUPPORTED') pending.reject(new OpfsNotSupportedError(error || undefined));
          else pending.reject(new Error(error || 'Unknown SQLite worker error'));
        }
      }
    };

    this.worker.onerror = (e: ErrorEvent) => {
      const failure = new StorageUnavailableError(`SQLite worker failed: ${e.message || 'unknown worker error'}`);
      for (const pending of this.pendingRequests.values()) pending.reject(failure);
      this.pendingRequests.clear();
      this.worker?.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.releaseHeldLock?.();
      this.releaseHeldLock = null;
      this.lockAcquired = false;
    };

    // Step 3: Initialize worker engine. Do not leave a held tab lock after failure.
    try {
      await this.sendRequest('INIT');
      this.isInitialized = true;
    } catch (error) {
      this.worker?.terminate();
      this.worker = null;
      this.releaseHeldLock?.();
      this.releaseHeldLock = null;
      this.lockAcquired = false;
      if (error instanceof TabLockedError || error instanceof OpfsNotSupportedError || error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError(`SQLite initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private sendRequest(type: string, payload: { sql?: string; params?: any[]; bytes?: Uint8Array } = {}): Promise<any> {
    if (!this.worker) {
      return Promise.reject(new StorageUnavailableError('Worker is not running'));
    }

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, type, ...payload });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(new StorageUnavailableError(`Could not send request to SQLite worker: ${String(error)}`));
      }
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutexChain.then(fn, fn);
    this.mutexChain = next.then(() => {}, () => {});
    return next;
  }

  async exec(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.init();
    return this.enqueue(async () => {
      await this.sendRequest('EXEC', { sql, params });
    });
  }

  async query<T = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    await this.init();
    return this.enqueue(async () => {
      const rows = await this.sendRequest('QUERY', { sql, params });
      return (rows || []) as T[];
    });
  }

  async queryOne<T = SqlRow>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    await this.init();
    return this.enqueue(async () => {
      await this.sendRequest('BEGIN');
      try {
        const txDriver: SqlDriver = {
          exec: async (sql: string, params: SqlValue[] = []) => {
            await this.sendRequest('EXEC', { sql, params });
          },
          query: async <R = SqlRow>(sql: string, params: SqlValue[] = []) => {
            const rows = await this.sendRequest('QUERY', { sql, params });
            return (rows || []) as R[];
          },
          queryOne: async <R = SqlRow>(sql: string, params: SqlValue[] = []) => {
            const rows = await txDriver.query<R>(sql, params);
            return rows.length > 0 ? rows[0] : null;
          },
          transaction: async () => {
            throw new Error('Nested transactions not supported');
          },
          exportDatabase: async () => {
            return this.sendRequest('EXPORT');
          },
          close: async () => {},
        };

        const result = await fn(txDriver);
        await this.sendRequest('COMMIT');
        return result;
      } catch (err) {
        try {
          await this.sendRequest('ROLLBACK');
        } catch {
          // ignore rollback failure
        }
        throw err;
      }
    });
  }

  async exportDatabase(): Promise<Uint8Array> {
    await this.init();
    return this.enqueue(async () => {
      const bytes = await this.sendRequest('EXPORT');
      return bytes as Uint8Array;
    });
  }

  async persistSafetyBackup(bytes: Uint8Array): Promise<{ fileName: string; checksum: string; sizeBytes: number }> {
    await this.init();
    return this.enqueue(async () => this.sendRequest('SAVE_BACKUP', { bytes }));
  }

  async readLatestSafetyBackup(): Promise<{ fileName: string; checksum: string; sizeBytes: number; bytes: Uint8Array } | null> {
    await this.init();
    return this.enqueue(async () => this.sendRequest('READ_BACKUP'));
  }

  async restoreDatabaseBytes(bytes: Uint8Array): Promise<void> {
    await this.init();
    await this.enqueue(async () => { await this.sendRequest('RESTORE_RAW', { bytes }); });
  }

  async close(): Promise<void> {
    try {
      if (this.worker) {
        await this.enqueue(async () => {
          try {
            await this.sendRequest('CLOSE');
          } finally {
            this.worker?.terminate();
            this.worker = null;
            this.isInitialized = false;
          }
        });
      }
    } finally {
      this.releaseHeldLock?.();
      this.releaseHeldLock = null;
      this.lockAcquired = false;
    }
  }
}
