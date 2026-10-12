export type SnapshotKind = 'scheduled' | 'before_migration';

export interface SnapshotDescriptor {
  id: string;
  created_at: string;
  kind: SnapshotKind;
}

/** UTC calendar day used so retention does not depend on the device timezone. */
function utcDay(iso: string): string {
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) throw new Error(`Invalid snapshot timestamp: ${iso}`);
  return new Date(millis).toISOString().slice(0, 10);
}

/** ISO week key (week starts Monday), independent of local timezone. */
function utcWeek(iso: string): string {
  const date = new Date(`${utcDay(iso)}T00:00:00.000Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday determines ISO week year.
  const weekYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/** Retain all pre-migration safety snapshots, the newest snapshot for each of the
 * 7 most recent UTC days, and the newest snapshot for each of the 4 most recent
 * UTC weeks. Results are stable regardless of input ordering.
 */
export function selectSnapshotsForRetention(snapshots: readonly SnapshotDescriptor[]): Set<string> {
  const ordered = [...snapshots].sort((a, b) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id)
  );
  for (const item of ordered) {
    if (!Number.isFinite(Date.parse(item.created_at))) {
      throw new Error(`Invalid snapshot timestamp: ${item.created_at}`);
    }
  }

  const keep = new Set(ordered.filter((item) => item.kind === 'before_migration').map((item) => item.id));
  const newestByDay = new Map<string, SnapshotDescriptor>();
  for (const item of ordered) {
    if (item.kind !== 'scheduled') continue;
    const day = utcDay(item.created_at);
    if (!newestByDay.has(day)) newestByDay.set(day, item);
  }
  [...newestByDay.values()].slice(0, 7).forEach((item) => keep.add(item.id));

  const newestByWeek = new Map<string, SnapshotDescriptor>();
  for (const item of ordered) {
    if (item.kind !== 'scheduled') continue;
    const week = utcWeek(item.created_at);
    if (!newestByWeek.has(week)) newestByWeek.set(week, item);
  }
  [...newestByWeek.values()].slice(0, 4).forEach((item) => keep.add(item.id));
  return keep;
}
