import { describe, expect, it } from 'vitest';
import { compareChangeVersion, mergeLatestChanges, SyncChange } from '../src/domain/sync-merge';
import { FakeNetwork, VirtualDevice } from './helpers/sync-simulation';

const change = (id: string, row_id: string, hlc: string, payload: string): SyncChange => {
  const wallClock = Number(hlc.split(':')[0]);
  const timestamp = Number.isFinite(wallClock) ? new Date(wallClock).toISOString() : new Date(0).toISOString();
  return {
  id, table_name: 'products', row_id, hlc, payload, timestamp,
  device_id: hlc.split(':')[2], origin_device_id: hlc.split(':')[2], op: 'UPDATE',
  };
};

describe('sync primitives and fault-injection harness', () => {
  it('chooses the same latest row change regardless of delivery order', () => {
    const changes = [
      change('a1', 'p1', '100:0:device-a', '{"name":"old"}'),
      change('b1', 'p1', '90:9:device-b', '{"name":"older wall clock"}'),
      change('a2', 'p1', '100:1:device-a', '{"name":"new"}'),
      change('a3', 'p2', '100:0:device-a', '{"name":"other"}'),
    ];
    expect(mergeLatestChanges(changes)).toEqual(mergeLatestChanges([...changes].reverse()));
    expect(mergeLatestChanges(changes).find((item) => item.row_id === 'p1')?.id).toBe('a2');
    expect(compareChangeVersion(changes[0], changes[1])).toBeGreaterThan(0);
  });

  it('rejects malformed HLC data in incoming changes', () => {
    expect(() => mergeLatestChanges([change('bad', 'p1', 'nope', '{}')])).toThrow('Invalid HLC');
  });

  it('simulates skewed clocks, delayed, duplicated, dropped, and reordered messages across in-memory devices', async () => {
    const a = new VirtualDevice('device-a', 500);
    const b = new VirtualDevice('device-b', 100);
    const c = new VirtualDevice('device-c', 900);
    await Promise.all([a.init(), b.init(), c.init()]);
    const devices = new Map([[a.id, a], [b.id, b], [c.id, c]]);
    const network = new FakeNetwork();

    const first = await a.createChange('products', 'p1', { name: 'Ajrakh scarf' });
    const second = await c.createChange('products', 'p2', { name: 'Block print dupatta' });
    const dropped = network.send(a, b, first);
    network.drop(dropped.id);
    const delayed = network.send(c, b, second, 2);
    network.duplicate(delayed.id);
    network.reorder([delayed.id]);

    expect(await network.deliverReady(devices)).toBe(0);
    expect(network.pendingCount()).toBe(2);
    expect(await network.deliverReady(devices)).toBe(0);
    expect(await network.deliverReady(devices)).toBe(1); // duplicate is idempotently ignored
    expect(network.pendingCount()).toBe(0);
    const received = await b.getChanges();
    expect(received.some((item) => item.id === first.id)).toBe(false);
    expect(received.some((item) => item.id === second.id)).toBe(true);
    expect(new Set(received.map((item) => item.id)).size).toBe(received.length);
  });
});
