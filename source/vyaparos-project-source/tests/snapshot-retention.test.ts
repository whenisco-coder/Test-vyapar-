import { describe, expect, it } from 'vitest';
import { selectSnapshotsForRetention, SnapshotDescriptor } from '../src/domain/snapshot-retention';

const snapshots: SnapshotDescriptor[] = Array.from({ length: 35 }, (_, index): SnapshotDescriptor => ({
  id: `daily-${index}`,
  created_at: new Date(Date.UTC(2026, 0, 1 + index, 9)).toISOString(),
  kind: 'scheduled',
})).concat([{
  id: 'pre-migration',
  created_at: '2025-12-01T00:00:00.000Z',
  kind: 'before_migration',
}]);

describe('rolling snapshot retention policy', () => {
  it('keeps the newest snapshot for 7 distinct days and 4 distinct weeks', () => {
    const retained = selectSnapshotsForRetention(snapshots);
    expect(retained.has('pre-migration')).toBe(true);
    expect(retained.has('daily-34')).toBe(true);
    expect(retained.has('daily-0')).toBe(false);
    expect(retained.size).toBeGreaterThanOrEqual(8);
    expect(retained.size).toBeLessThanOrEqual(11); // overlap between daily and weekly windows is intentional
  });

  it('is independent of input ordering and rejects invalid timestamps', () => {
    expect([...selectSnapshotsForRetention(snapshots)].sort())
      .toEqual([...selectSnapshotsForRetention([...snapshots].reverse())].sort());
    expect(() => selectSnapshotsForRetention([{ id: 'bad', created_at: 'yesterday-ish', kind: 'scheduled' }]))
      .toThrow('Invalid snapshot timestamp');
  });
});
