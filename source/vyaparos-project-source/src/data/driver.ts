export type SqlValue = string | number | null | bigint | Uint8Array;

export interface SqlRow {
  [column: string]: any;
}

export class StorageUnavailableError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Storage is unavailable: ${reason}`);
    this.name = 'StorageUnavailableError';
    this.reason = reason;
  }
}

export class OpfsNotSupportedError extends StorageUnavailableError {
  constructor(message = 'OPFS is not supported in this browser or webview. Use a supported browser with persistent storage.') {
    super(message);
    this.name = 'OpfsNotSupportedError';
  }
}

export class TabLockedError extends Error {
  constructor(message = 'Business OS is open in another tab. Close it and reload.') {
    super(message);
    this.name = 'TabLockedError';
  }
}

export class DowngradeNotAllowedError extends Error {
  constructor(currentVersion: number, targetVersion: number) {
    super(`Database downgrade refused: current version is ${currentVersion}, target is ${targetVersion}`);
    this.name = 'DowngradeNotAllowedError';
  }
}

export interface SqlDriver {
  /**
   * Execute non-query SQL (DDL, INSERT, UPDATE, DELETE).
   */
  exec(sql: string, params?: SqlValue[]): Promise<void>;

  /**
   * Execute a query returning an array of objects.
   */
  query<T = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]>;

  /**
   * Execute a query returning a single row or null.
   */
  queryOne<T = SqlRow>(sql: string, params?: SqlValue[]): Promise<T | null>;

  /**
   * Execute a transactional block under a client-side serialization mutex.
   * Inside SQLite, issues BEGIN IMMEDIATE ... COMMIT, and ROLLBACK on error.
   */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;

  /**
   * Export raw database bytes (for safety backups and encrypted exports).
   */
  exportDatabase(): Promise<Uint8Array>;

  /** Persist an unencrypted pre-migration SQLite image outside application tables/state. */
  persistSafetyBackup?(bytes: Uint8Array): Promise<{ fileName: string; checksum: string; sizeBytes: number }> ;
  readLatestSafetyBackup?(): Promise<{ fileName: string; checksum: string; sizeBytes: number; bytes: Uint8Array } | null>;
  restoreDatabaseBytes?(bytes: Uint8Array): Promise<void>;

  /**
   * Close the database connection.
   */
  close(): Promise<void>;
}
