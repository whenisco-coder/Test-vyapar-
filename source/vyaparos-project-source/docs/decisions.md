# Architectural & Product Decisions (Settled)

| ID | Decision | Details |
|---|---|---|
| D1 | Offline-first Architecture | All data lives directly on the user's device (phone/desktop). It is not a cloud SaaS, not a Tally replacement, not a native app. |
| D2 | 3-Layer Structure | UI -> Domain -> Data. UI never imports data/DB modules. Domain contains repos, domain services, money/GST logic, tally, crypto. |
| D3 | SQLite WASM in Web Worker with OPFS | Dedicated Web Worker with `@sqlite.org/sqlite-wasm` and `opfs-sahpool` (or robust OPFS/IDB fallback). No COOP/COEP required. |
| D4 | Repository Abstraction | Clean repository interfaces allow swapping the underlying storage engine without touching Domain or UI layers. |
| D5 | Data Types & Change Tracking | UUIDv7 IDs (no autoincrement keys). Integer paise for money. Basis points (bp) for GST. Soft deletes (`deleted_at`). Audit fields (`created_at`, `updated_at`, `device_id`, `user_id`). Every write appends to `changes`. |
| D6 | Append-Only Stock Movements | Stock quantity is derived on the fly from `stock_movements`. Locations supported: Own, Damaged, Returns, Amazon FBA. |
| D7 | FIFO Stock Valuation | Stock consumed oldest first (by purchase_date, then created_at). Weighted average supported as setting. Never LIFO. |
| D10 | Invoice Numbering | One series per device (e.g. `A/2627/0001`), max 16 chars, consecutive, no gaps, resets every Financial Year (1 April - 31 March). Cancelled invoices retain their number. |
| D11 | Tally Integration | File-based Tally Prime import XML for Sales vouchers only in v0.1. Data-driven ledger mappings. |
| D14 | Encrypted Backups | Backups are encrypted on device using WebCrypto AES-GCM (PBKDF2 key derivation). Export via Share sheet with download fallback. |
| D15 | Deployment & Static Hosting | Static build deployable to Cloudflare Pages. Workbox PWA service worker precaches application shell and static assets. |
| D16 | Android First UI | Mobile navigation via bottom tab bar; desktop sidebar. Dense, accessible, tap target >= 44px. |
| D17 | Native / Vector PDF | Never use html2canvas. Use vector PDF (jsPDF) and native print stylesheet for clean, sharp A5 prints. |
| D19 | Zero Budget | 100% free and open-source dependencies. No telemetry, third-party analytics, or paid API keys. |
| D20 | Automated Vitest Coverage | Vitest covers Money paise math, GST splitting, FIFO batch consumption, Tally XML golden output, Backup crypto, Invoice numbering. |
| D22 | Clean Start | App starts empty with an optional Tyre & Auto Spares starter pack. |
| D23 | Tech Stack | React 19, TypeScript strict, Vite, Tailwind CSS, Lucide icons, Vitest, vite-plugin-pwa. |
| D25 | Tax & Invoice Rounding | Tax calculated per line rounded half-up to paise; invoice grand total rounded to nearest whole rupee with a distinct round-off line. |
| D26 | Negative Stock Policy | Block negative stock by default. Setting available to permit with warning (leaving lines uncosted until purchase is added). |
| D27 | Test Mode / Safety | Test data only until backup system is verified. Safety backup created before any database migration or backup restore. |
| D28 | Deployment Pipeline | Cloudflare Pages static deploy from repository. Zero secrets needed. |
