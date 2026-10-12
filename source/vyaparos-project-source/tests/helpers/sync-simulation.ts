import { resetDatabaseClientForTesting, IDatabaseClient } from '../../src/data/sqliteClient';
import { AppService } from '../../src/domain/services';
import { tickHLC } from '../../src/domain/hlc';
import { ChangeRecord } from '../../src/domain/types';

export interface SyncEnvelope {
  id: string;
  from: string;
  to: string;
  change: ChangeRecord;
  delayTicks: number;
}

export class VirtualDevice {
  readonly db: IDatabaseClient;
  readonly service: AppService;
  private lastHlc: string | null = null;
  private logicalTime: number;
  private seen = new Set<string>();

  constructor(readonly id: string, initialClockMs: number) {
    this.logicalTime = initialClockMs;
    this.db = resetDatabaseClientForTesting();
    this.service = new AppService(this.db);
  }

  async init(): Promise<void> {
    await this.service.init();
  }

  async createChange(tableName: string, rowId: string, payload: unknown, op: ChangeRecord['op'] = 'INSERT'): Promise<ChangeRecord> {
    this.lastHlc = tickHLC(this.lastHlc, this.logicalTime, this.id);
    this.logicalTime += 1;
    const change: ChangeRecord = {
      id: `${this.id}-${this.seen.size + 1}-${rowId}`,
      device_id: this.id,
      origin_device_id: this.id,
      hlc: this.lastHlc,
      table_name: tableName,
      row_id: rowId,
      op,
      payload: JSON.stringify(payload),
      timestamp: new Date(Number(this.lastHlc.split(':')[0])).toISOString(),
      user_id: 'simulation-user',
    };
    await this.service.changes.appendChange(change);
    this.seen.add(change.id);
    return change;
  }

  async receive(change: ChangeRecord): Promise<boolean> {
    if (this.seen.has(change.id)) return false;
    await this.service.changes.appendChange(change);
    this.seen.add(change.id);
    const millis = Number(change.hlc?.split(':')[0] ?? 0);
    this.logicalTime = Math.max(this.logicalTime, millis + 1);
    this.lastHlc = tickHLC(this.lastHlc, this.logicalTime, this.id, change.hlc);
    return true;
  }

  async getChanges(): Promise<ChangeRecord[]> {
    return this.service.changes.getAll(10000);
  }
}

/** Deterministic fake network. Tests can drop, duplicate, reorder, or delay envelopes. */
export class FakeNetwork {
  private queue: SyncEnvelope[] = [];
  private tick = 0;

  send(from: VirtualDevice, to: VirtualDevice, change: ChangeRecord, delayTicks = 0): SyncEnvelope {
    const envelope = { id: `${from.id}->${to.id}:${change.id}`, from: from.id, to: to.id, change, delayTicks };
    this.queue.push(envelope);
    return envelope;
  }

  drop(envelopeId: string): void {
    this.queue = this.queue.filter((item) => item.id !== envelopeId);
  }

  duplicate(envelopeId: string): void {
    const envelope = this.queue.find((item) => item.id === envelopeId);
    if (envelope) this.queue.push({ ...envelope });
  }

  reorder(envelopeIds: string[]): void {
    const rank = new Map(envelopeIds.map((id, index) => [id, index]));
    this.queue.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }

  async deliverReady(devices: Map<string, VirtualDevice>): Promise<number> {
    this.tick += 1;
    const ready = this.queue.filter((item) => item.delayTicks < this.tick);
    this.queue = this.queue.filter((item) => item.delayTicks >= this.tick);
    let delivered = 0;
    for (const envelope of ready) {
      const target = devices.get(envelope.to);
      if (target && await target.receive(envelope.change)) delivered += 1;
    }
    return delivered;
  }

  pendingCount(): number {
    return this.queue.length;
  }
}
