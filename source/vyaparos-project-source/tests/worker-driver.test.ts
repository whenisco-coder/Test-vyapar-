import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpfsNotSupportedError, TabLockedError } from '../src/data/driver';
import { WorkerDriver } from '../src/data/worker-driver';

afterEach(() => vi.unstubAllGlobals());

describe('WorkerDriver lock and startup errors', () => {
  it('uses ifAvailable without signal and releases the Web Lock after initialization failure', async () => {
    let lockCallbackSettled!: () => void;
    const lockCallbackFinished = new Promise<void>((resolve) => { lockCallbackSettled = resolve; });
    const lockRequest = vi.fn(async (_name: string, options: LockOptions, callback: (lock: object | null) => Promise<void>) => {
      expect(options).toEqual({ ifAvailable: true });
      await callback({});
      lockCallbackSettled();
    });
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });
    class FailedInitWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: { id: string; type: string }) {
        if (message.type === 'INIT') queueMicrotask(() => this.onmessage?.({ data: {
          id: message.id, success: false, error: 'OPFS is not supported', errorCode: 'OPFS_NOT_SUPPORTED',
        } } as MessageEvent));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FailedInitWorker);

    const driver = new WorkerDriver();
    await expect(driver.init()).rejects.toBeInstanceOf(OpfsNotSupportedError);
    await lockCallbackFinished;
    expect(lockRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps tab-lock conflicts distinct from OPFS support failures', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name: string, _options: LockOptions, callback: (lock: object | null) => Promise<void>) => callback(null)) } });
    vi.stubGlobal('Worker', class { terminate() {} });
    await expect(new WorkerDriver().init()).rejects.toBeInstanceOf(TabLockedError);
  });
});
