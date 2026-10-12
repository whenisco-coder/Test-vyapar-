/**
 * Dedicated SQLite WASM & OPFS Web Worker
 *
 * Runs sqlite3InitModule and opfs-sahpool VFS.
 * Manages database file '/business-os.sqlite3'.
 * Handles request/response message broker with unique request IDs.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

interface WorkerRequest {
  id: string;
  type: 'INIT' | 'EXEC' | 'QUERY' | 'BEGIN' | 'COMMIT' | 'ROLLBACK' | 'EXPORT' | 'SAVE_BACKUP' | 'READ_BACKUP' | 'RESTORE_RAW' | 'CLOSE';
  sql?: string;
  params?: any[];
  bytes?: Uint8Array;
}

// Keep the worker global typed independently of Window when TypeScript's app config
// includes DOM but not the separate WebWorker library.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

let sqlite3: any = null;
let poolUtil: any = null;
let db: any = null;
const DB_NAME = '/business-os.sqlite3';

async function initEngine(): Promise<void> {
  if (db) return;

  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
    const error = new Error('OPFS is not supported in this browser or WebView. Open Vyapar OS in a supported secure-context browser.');
    (error as Error & { code?: string }).code = 'OPFS_NOT_SUPPORTED';
    throw error;
  }

  sqlite3 = await sqlite3InitModule();

  // Try to install opfs-sahpool VFS
  if (typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        name: 'opfs-sahpool',
      });
      db = new poolUtil.OpfsSAHPoolDb(DB_NAME);
    } catch (e: any) {
      const message = String(e?.message || e);
      const locked = /locked|busy|already open|lock conflict/i.test(message);
      const error = new Error(locked
        ? `SQLite database is already locked by another tab or process: ${message}`
        : `Could not initialize the OPFS SQLite database: ${message}`);
      (error as Error & { code?: string }).code = locked ? 'TAB_LOCKED' : 'OPFS_INIT_FAILED';
      throw error;
    }
  } else if ('opfs' in sqlite3 && sqlite3.oo1.OpfsDb) {
    db = new sqlite3.oo1.OpfsDb(DB_NAME);
  } else {
    // If neither is available, fail explicitly per Hard Rule 2
    const error = new Error('OPFS is not supported by this SQLite build or browser environment.');
    (error as Error & { code?: string }).code = 'OPFS_NOT_SUPPORTED';
    throw error;
  }

  db.exec('PRAGMA foreign_keys = ON;');
}

workerScope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, sql, params = [] } = e.data;

  try {
    switch (type) {
      case 'INIT': {
        await initEngine();
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'EXEC': {
        if (!db) await initEngine();
        db.exec({ sql, bind: params });
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'QUERY': {
        if (!db) await initEngine();
        const rows: any[] = [];
        db.exec({
          sql,
          bind: params,
          rowMode: 'object',
          callback: (row: any) => {
            rows.push({ ...row });
          },
        });
        workerScope.postMessage({ id, success: true, rows });
        break;
      }

      case 'BEGIN': {
        if (!db) await initEngine();
        db.exec('BEGIN IMMEDIATE;');
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'COMMIT': {
        if (!db) await initEngine();
        db.exec('COMMIT;');
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'ROLLBACK': {
        if (!db) await initEngine();
        try {
          db.exec('ROLLBACK;');
        } catch {
          // ignore if already aborted
        }
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'EXPORT': {
        if (!db) await initEngine();
        let bytes: Uint8Array;
        if (poolUtil && typeof poolUtil.exportFile === 'function') {
          bytes = poolUtil.exportFile(DB_NAME);
        } else {
          bytes = sqlite3.capi.sqlite3_js_db_export(db);
        }
        const transferableBytes = new Uint8Array(bytes);
        workerScope.postMessage({ id, success: true, bytes: transferableBytes }, [transferableBytes.buffer]);
        break;
      }

      case 'SAVE_BACKUP': {
        if (!db) await initEngine();
        if (!(e.data.bytes instanceof Uint8Array) || e.data.bytes.byteLength === 0) throw new Error('Safety backup payload is empty or invalid');
        const root = await navigator.storage.getDirectory();
        const backupDir = await root.getDirectoryHandle('vyapar-os-backups', { create: true });
        const fileName = `safety-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.sqlite3`;
        const handle = await backupDir.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        try { await writable.write(e.data.bytes); await writable.close(); }
        catch (error) { try { await writable.abort(); } catch { /* preserve original failure */ } throw error; }
        const stored = await handle.getFile();
        if (!stored.size) { await backupDir.removeEntry(fileName); throw new Error('Safety backup could not be verified: written file is empty'); }
        const storedBytes = new Uint8Array(await stored.arrayBuffer());
        if (storedBytes.byteLength !== e.data.bytes.byteLength) { await backupDir.removeEntry(fileName); throw new Error('Safety backup could not be verified: file size mismatch'); }
        const digestBytes = new Uint8Array(new ArrayBuffer(storedBytes.byteLength));
        digestBytes.set(storedBytes);
        const digest = await crypto.subtle.digest('SHA-256', digestBytes);
        const checksum = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        const files: Array<{ name: string; modified: number }> = [];
        for await (const [name, entry] of backupDir.entries()) {
          if (entry.kind !== 'file' || !/^safety-.*\.sqlite3$/.test(name)) continue;
          const file = await (entry as FileSystemFileHandle).getFile(); files.push({ name, modified: file.lastModified });
        }
        files.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
        const retained = new Set([fileName, ...files.filter(file => file.name !== fileName).slice(0, 2).map(file => file.name)]);
        for (const old of files) if (!retained.has(old.name)) await backupDir.removeEntry(old.name);
        workerScope.postMessage({ id, success: true, result: { fileName, checksum, sizeBytes: stored.size } });
        break;
      }

      case 'READ_BACKUP': {
        if (!db) await initEngine();
        const root = await navigator.storage.getDirectory();
        let backupDir: FileSystemDirectoryHandle;
        try { backupDir = await root.getDirectoryHandle('vyapar-os-backups', { create: false }); }
        catch { workerScope.postMessage({ id, success: true, result: null }); break; }
        const files: Array<{ name: string; modified: number }> = [];
        for await (const [name, entry] of backupDir.entries()) {
          if (entry.kind !== 'file' || !/^safety-.*\.sqlite3$/.test(name)) continue;
          const file = await (entry as FileSystemFileHandle).getFile(); if (file.size) files.push({ name, modified: file.lastModified });
        }
        files.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
        if (!files.length) { workerScope.postMessage({ id, success: true, result: null }); break; }
        const file = await (await backupDir.getFileHandle(files[0].name)).getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digestBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength));
        digestBytes.set(bytes);
        const digest = await crypto.subtle.digest('SHA-256', digestBytes);
        const checksum = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        workerScope.postMessage({ id, success: true, result: { fileName: files[0].name, checksum, sizeBytes: bytes.byteLength, bytes }, bytes: bytes.buffer }, [bytes.buffer]);
        break;
      }

      case 'RESTORE_RAW': {
        if (!db) await initEngine();
        if (!(e.data.bytes instanceof Uint8Array) || !e.data.bytes.byteLength) throw new Error('Safety backup is empty or invalid');
        if (!poolUtil || typeof poolUtil.importDb !== 'function') throw new Error('This SQLite storage engine cannot safely import a raw safety backup');
        db.close(); db = null;
        try {
          await poolUtil.importDb(DB_NAME, e.data.bytes);
          db = new poolUtil.OpfsSAHPoolDb(DB_NAME);
          db.exec('PRAGMA foreign_keys = ON;');
        } catch (error) {
          // Re-open the existing database connection if raw restore failed.
          db = new poolUtil.OpfsSAHPoolDb(DB_NAME);
          throw error;
        }
        workerScope.postMessage({ id, success: true });
        break;
      }

      case 'CLOSE': {
        if (db) {
          db.close();
          db = null;
        }
        workerScope.postMessage({ id, success: true });
        break;
      }

      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }
  } catch (err: any) {
    workerScope.postMessage({
      id,
      success: false,
      error: err?.message || String(err),
      errorCode: err?.code || (/OPFS is not supported/i.test(String(err?.message || err)) ? 'OPFS_NOT_SUPPORTED' : undefined),
    });
  }
};
