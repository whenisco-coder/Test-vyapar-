# Vyapar OS SQLite worker review status

## Changes in this review

- Web Locks now use `ifAvailable` without `signal`; a held-lock release gate is resolved by `close()` and every worker startup/init failure path.
- Added distinct `OpfsNotSupportedError` and `TabLockedError` propagation. OPFS capability failures are not converted into “open in another tab” errors.
- Same-version migration launches return immediately without exporting the database. Existing database upgrades require a raw SQLite image and persistent backup write before migration.
- Safety backups are stored in a separate OPFS `vyapar-os-backups/` directory and retention removes older files beyond the newest three.
- `AppService` and `DbClient` retain the `runMigrations` result; `AppService.init()` exposes a small migration summary without returning the database bytes to UI callers.
- Added a historical v1 SQL fixture and real `node:sqlite` integration tests for migrations, backup retention, ledger triggers, foreign keys, and derived stock/dues views.
- Renamed the current schema test export to `SCHEMA_CURRENT_SQL` so it is not misrepresented as the historical v1 snapshot.
- Vite excludes `@sqlite.org/sqlite-wasm` from dependency optimization, uses ES-format workers, precaches `.wasm` patterns, and the build script now asserts that emitted WASM assets appear in the service-worker precache.

## Checks actually run in this workspace

- **Real SQLite migration smoke (Node `node:sqlite`): PASS** — fresh migration, same-version no-op without export, downgrade refusal, historical v1-to-v2 upgrade, and persistent pre-migration backup.
- **Real SQLite constraint/view smoke (Node `node:sqlite`): PASS** — stock ledger UPDATE/DELETE rejected, payment ledger UPDATE/DELETE rejected, foreign-key violation rejected, `stock_on_hand` returns 5, and `customer_dues` returns 11,800 invoiced / 4,000 paid / 7,800 balance.
- **Python SQLite smoke: PASS** — schema DDL, v1-to-v2 DDL path, append-only triggers, foreign keys, stock view, and dues view.
- **TypeScript syntax/transpile scan: PASS** — 10 changed TypeScript/config files have no syntax/transpile diagnostics. This is not a full typecheck.
- **Typecheck (`tsc --noEmit`): NOT PASSED / BLOCKED** — `TS2688: Cannot find type definition file for 'vite/client'` because dependencies were unavailable.
- **Vitest (`npm test -- --run`): NOT RUN** — `vitest: not found`; dependency installation timed out.
- **Production build (`npm run build`): NOT RUN** — `vite: not found`; WASM emission and PWA precache assertion therefore remain unverified.
- **CI: NOT RUN** — no workflow run was available in this workspace.
- **Browser, Android WebView, and phone checks: NOT RUN** — no claims of device/browser testing are made.
- **APK: NOT BUILT** in this workspace.

## Skipped / out of scope

No changes were made to artisans, Capacitor, `@google/genai`, Express, or jsPDF. These remain outside this review task.

## Open question

The existing `@google/genai` and Express dependencies may conflict with the project’s offline/no-network direction, but they were left untouched per the task boundary. Please decide in a separate task whether they conflict with D21/D24 or the no-network rule.

## Owner phone checks (after CI/build succeeds)

1. Install the debug APK or PWA, launch once online, then relaunch in airplane mode.
2. Create a test customer, product, stock movement, invoice, and payment; force-stop/reopen and confirm the stock and dues still match.
3. Open a second tab to verify the lock message; verify an unsupported OPFS environment shows a storage-support message instead. Test backup/restore with dummy data only.
