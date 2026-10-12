# Assumptions & Implementation Decisions

The following architectural and domain choices were selected as the simplest robust solutions:

1. **Storage Engine Architecture (SQLite WASM & Fallback)**
   - In environments where Web Workers or Origin Private File System (`OPFS`) access is restricted (e.g. strict sandboxed iframes without `cross-origin-isolated`), the system detects this at startup and provides an in-app fallback storage mode with IndexedDB synchronization or displays the clear diagnostic notification rather than crashing.

2. **Web Crypto Key Derivation for Backups**
   - For encrypted backups, PBKDF2 with SHA-256 (100,000 iterations) and 256-bit AES-GCM is used directly via native `window.crypto.subtle`. This requires zero external dependencies and is supported across modern browsers.

3. **Tax-Inclusive Price Reversal Math**
   - When a product is marked `price_includes_tax: 1`, the unit selling price contains tax. The taxable unit value is computed as:
     `taxable_paise = round((inclusive_paise * 10000) / (10000 + gst_rate_bp))`
     The tax is `inclusive_paise - taxable_paise`. Total line amounts are then multiplied by quantity.

4. **Tally Prime Sales Voucher Format**
   - Tally Prime import XML format uses the `<VOUCHER VCHTYPE="Sales" ACTION="Create">` structure. Party ledger is debited (`ISDEEMEDPOSITIVE = Yes`), while Sales Account and Tax ledgers are credited (`ISDEEMEDPOSITIVE = No`). Dates are formatted strictly as `YYYYMMDD`. Cancelled invoices are omitted by default or can be tagged.

5. **Indian Currency Number Formatting**
   - Currency display strictly implements the Indian numbering system (Lakhs and Crores grouping, e.g. `₹12,34,567.89`). Amount in words converts integers up to 99 Crores into formal English ("Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Eighty-Nine Paise Only").

6. **GSTIN checksum is never bypassed for sample values.** A legacy exception accepted `29ABCDE1234F1Z5` even though its check character does not match the Mod-36 calculation. Validation now applies the same checksum rule to all structurally valid GSTINs; sample/test values must themselves be checksum-valid. This is format validation only, not verification against the GST portal.

7. **Business profile scope remains dual-purpose pending owner confirmation.** The base application and settled D22 describe tyre/auto-spares retail, while the supplemental Ajrakhika brief describes handicrafts and clothing. Existing tyre starter products remain optional and are not silently replaced. Future category/seed work should support an Ajrakhika handicrafts pack without breaking the existing pack.
