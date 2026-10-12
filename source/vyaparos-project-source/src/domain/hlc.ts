/** Pure hybrid logical clock helpers for deterministic cross-device ordering.
 * Wire format: `<physicalMillis>:<logicalCounter>:<deviceId>`.
 */
export interface HLC {
  physicalMs: number;
  logical: number;
  deviceId: string;
}

export function parseHLC(value: string): HLC {
  const match = /^(\d+):(\d+):([A-Za-z0-9._-]+)$/.exec(value);
  if (!match) throw new Error(`Invalid HLC value: ${value}`);
  const physicalMs = Number(match[1]);
  const logical = Number(match[2]);
  if (!Number.isSafeInteger(physicalMs) || !Number.isSafeInteger(logical)) {
    throw new Error(`Invalid HLC numeric component: ${value}`);
  }
  return { physicalMs, logical, deviceId: match[3] };
}

export function formatHLC(value: HLC): string {
  if (!Number.isSafeInteger(value.physicalMs) || value.physicalMs < 0 ||
      !Number.isSafeInteger(value.logical) || value.logical < 0 ||
      !/^[A-Za-z0-9._-]+$/.test(value.deviceId)) {
    throw new Error('Invalid HLC components');
  }
  return `${value.physicalMs}:${value.logical}:${value.deviceId}`;
}

/** Compare by physical time, then logical counter, then device ID for a total order. */
export function compareHLC(a: string, b: string): number {
  const left = parseHLC(a);
  const right = parseHLC(b);
  if (left.physicalMs !== right.physicalMs) return left.physicalMs < right.physicalMs ? -1 : 1;
  if (left.logical !== right.logical) return left.logical < right.logical ? -1 : 1;
  return left.deviceId.localeCompare(right.deviceId);
}

/** Create the next local timestamp, optionally observing a remote timestamp first. */
export function tickHLC(
  previous: string | null | undefined,
  wallClockMs: number,
  deviceId: string,
  observedRemote?: string | null,
): string {
  if (!Number.isSafeInteger(wallClockMs) || wallClockMs < 0) throw new Error('Invalid wall clock');
  const local = previous ? parseHLC(previous) : { physicalMs: 0, logical: 0, deviceId };
  const remote = observedRemote ? parseHLC(observedRemote) : null;
  const physicalMs = Math.max(wallClockMs, local.physicalMs, remote?.physicalMs ?? 0);
  let logical: number;
  if (physicalMs === local.physicalMs && remote && physicalMs === remote.physicalMs) {
    logical = Math.max(local.logical, remote.logical) + 1;
  } else if (physicalMs === local.physicalMs) {
    logical = local.logical + 1;
  } else if (remote && physicalMs === remote.physicalMs) {
    logical = remote.logical + 1;
  } else {
    logical = 0;
  }
  return formatHLC({ physicalMs, logical, deviceId });
}
