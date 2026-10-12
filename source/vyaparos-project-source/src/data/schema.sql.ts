/**
 * Canonical current-schema SQL used by schema integrity tests and benchmarks.
 * This is intentionally not named SCHEMA_V1_SQL: the historical v1 snapshot
 * used for migration tests lives in tests/fixtures/schema-v1.sql.
 */
export { FULL_SCHEMA_SQL as SCHEMA_CURRENT_SQL } from './schema';
