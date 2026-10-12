# Vyapar OS / Ajrakhika Business OS v0.1

An offline-first, single-device Progressive Web App (PWA) an offline-first billing and inventory foundation for small Indian businesses. The current starter pack is for tyre retail and auto spares; Ajrakhika handicrafts/clothing support is a documented follow-on scope and should be added as a separate optional pack. Handles stock inward, GST sales invoicing, customer payments, dues tracking, encrypted backups, and Tally Prime XML export.

---

## Features
- **Offline-First Storage**: Dedicated Web Worker with SQLite in OPFS (`opfs-sahpool` VFS) and safe local persistence.
- **Accurate Money & GST Math**: 100% integer paise math (no floats). Exact CGST/SGST odd-paise splitting. HSN summary grouping.
- **Sequential Invoicing**: Financial-year reset (`A/2627/0001`), gapless numbers, cancellation retention.
- **A5 Tally-Style Invoice**: Print and vector PDF export with standard seller/buyer blocks and amount in words.
- **FIFO Inventory**: Purchase batch cost tracking, stock movement ledger, negative stock guard.
- **Customer Dues & Ledgers**: Running balances, payment vouchers, reversing entries.
- **Encrypted Local Backup**: WebCrypto AES-GCM encrypted file export via share sheet or download.
- **Tally Prime Sales Export**: Data-driven XML export with customizable ledger mappings.

---

## Running Locally

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev

# Run test suite
npm test

# Type check
npm run lint

# Build for production
npm run build
```

---

## Deployment to Cloudflare Pages

Business OS is completely static and can be deployed directly to Cloudflare Pages:

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Root Directory**: `/` (or leave default)
- **Environment Variables**: None required! Zero secrets or external APIs.

---

## Documentation Index
- [`AGENTS.md`](./AGENTS.md) - Architectural guidelines and coding rules
- [`docs/decisions.md`](./docs/decisions.md) - Architectural and product decisions (D1 - D28)
- [`docs/architecture.md`](./docs/architecture.md) - Three-layer architecture specifications
- [`docs/schema.md`](./docs/schema.md) - Database schema v1 & fields
- [`docs/design-system.md`](./docs/design-system.md) - Colors, typography, and 6 core components
- [`docs/assumptions.md`](./docs/assumptions.md) - Key assumptions made
- [`docs/t0-storage-notes.md`](./docs/t0-storage-notes.md) - Storage spike analysis & 8-step phone verification checklist
- [`docs/tally-notes.md`](./docs/tally-notes.md) - Tally Prime XML schema, debit/credit rules, and golden sample
