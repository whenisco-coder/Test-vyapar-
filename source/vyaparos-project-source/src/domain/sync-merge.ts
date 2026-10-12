import { compareHLC, parseHLC } from './hlc';

export interface SyncChange {
  id: string;
  table_name: string;
  row_id: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE' | 'insert' | 'update' | 'delete';
  payload?: string;
  payload_json?: string;
  timestamp: string;
  device_id: string;
  origin_device_id?: string;
  hlc: string;
  user_id?: string | null;
}

/** Deterministic ordering for changes to the same row. HLC establishes logical order;
 * change ID is a stable tie-breaker for malformed/imported duplicate-clock records.
 */
export function compareChangeVersion(a: SyncChange, b: SyncChange): number {
  const byClock = compareHLC(a.hlc, b.hlc);
  if (byClock !== 0) return byClock;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Pick the deterministically latest observed change for each row.
 * This is a convergence primitive, not a transport or full conflict-resolution policy.
 */
export function mergeLatestChanges(changes: readonly SyncChange[]): SyncChange[] {
  const latest = new Map<string, SyncChange>();
  for (const change of changes) {
    // Validate clock before allowing untrusted sync data into the merge result.
    parseHLC(change.hlc);
    const key = `${change.table_name}\u0000${change.row_id}`;
    const current = latest.get(key);
    if (!current || compareChangeVersion(change, current) > 0) latest.set(key, change);
  }
  return [...latest.values()].sort((a, b) =>
    a.table_name.localeCompare(b.table_name) ||
    a.row_id.localeCompare(b.row_id)
  );
}
