# Vyapar OS PWA and Android build

## PWA build

Requirements: Node.js 22+ and npm with registry access.

```sh
npm install
npm run lint
npm test
npm run build
npm run preview
```

Deploy the contents of `dist/` to an HTTPS static host. The Vite PWA plugin emits a web app manifest and a precache service worker. Open the deployed URL once online, install it from the browser, then test in airplane mode. Confirm the app shell opens and existing local data is still present after closing/reopening the app. Browser storage can still be cleared by the user or reclaimed by the OS; use Settings → backup/export regularly.

## Android APK

Requirements: Node.js 22+, Android Studio, Android SDK/platform tools, and a JDK supported by the installed Android Gradle Plugin.

```sh
npm install
npm run build
npx cap add android       # only the first time; creates android/
npx cap sync android
npx cap open android
```

In Android Studio, let Gradle sync, select a device/emulator, and run the app. To produce a debug APK, use **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Android Studio shows the resulting APK location. For a release APK, configure signing securely in Android Studio; never commit signing keys or passwords.

## Offline/data safety gate

- Test first-run setup with airplane mode enabled after the first install/load.
- Create a customer, product, stock movement, and invoice; force-close and reopen; verify the records remain.
- Export a backup, restore it into a test workspace, and verify totals.
- Test on the oldest supported Android WebView/device before production use.
- Keep sync disabled or explicitly marked unavailable until the relay endpoint is configured.

**Implementation note:** browser sessions now select `SqliteWorkerDatabaseClient`, which runs `@sqlite.org/sqlite-wasm` in `src/data/worker.ts` through `WorkerDriver`; both domain services and repository APIs share this same client. The table-shaped adapter is retained for Node unit tests only. This wiring is not yet a verified production database: run the full tests and validate OPFS behavior in the target browser and Android WebView before using it as the sole source of business records.

## One-click cloud build (GitHub Actions)

The repository includes `.github/workflows/build-test.yml`. Push this source to the repository's `main` or `master` branch, or open **GitHub → Actions → Vyapar OS build and test → Run workflow**. The workflow runs type checking and tests, then creates two artifacts when their respective jobs succeed:

- `vyapar-os-pwa-dist`: compiled PWA files from `dist/`.
- `vyapar-os-android-debug-apk`: `app-debug.apk` for installing on a test Android device.

Open the workflow run and download the artifacts from its **Artifacts** section. If a job fails, open its log and fix that error before treating the build as ready. These artifacts are temporary CI downloads, not a published release.


## Local data safety status

The browser application now routes SQL through the SQLite-WASM worker backed by OPFS when supported; unsupported OPFS initialization is reported as an error instead of silently switching to a table-shaped fallback. Do not enter the only copy of real invoices or stock records until the build and tests pass. Before production use, test create/edit/reversal flows, reload, force-stop/reopen, airplane mode, storage quota/errors, export/restore (including immutable invoices and ledgers), and upgrades from an existing data snapshot.
