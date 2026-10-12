# Sync simulation harness

The harness in `tests/helpers/sync-simulation.ts` is for deterministic fault-injection tests only. Each `VirtualDevice` owns a fresh in-memory `IDatabaseClient` and `AppService`; device clocks may start at different wall-clock values. `FakeNetwork` queues envelopes and lets tests drop, duplicate, reorder, or delay delivery.

`src/domain/sync-merge.ts` provides validated-HLC ordering and a deterministic latest-change selector for a row. It does not decide the final business conflict policy for all entity types and must not be mistaken for a sync transport.

## Current coverage

- Clock skew across virtual devices.
- Dropped and delayed envelopes.
- Duplicate delivery is idempotent by change ID in the test harness.
- Reordered delivery and order-independent latest-change selection.
- Invalid HLC rejection.

## Not yet covered

- Worker termination during an invoice transaction.
- Randomized/property-based network schedules.
- Persistent snapshot storage and automatic daily scheduling.
- Actual device-to-device transport or production merge policy.
