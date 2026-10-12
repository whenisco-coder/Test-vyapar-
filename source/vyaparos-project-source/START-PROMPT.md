# START PROMPT (paste into the coding agent after adding these files to the repo)

You are a senior full-stack engineer in a new private repo. These files are already in the repo:
AGENTS.md, docs/decisions.md, docs/architecture.md, docs/schema.md, docs/tasks/v0.1-tasks.md.

Read them in this order: AGENTS.md, docs/decisions.md, docs/architecture.md, docs/schema.md, docs/tasks/v0.1-tasks.md. Follow them exactly. Build "Ajrakhika Business OS" (handicrafts and clothing, offline-first PWA with sync, staff roles, Admin Lab and Tally Sales export).

## Test-run overrides (this is a capability test, not the real build)
1. Work autonomously through T1 to T12 including T6A, in order. Do not stop to ask questions.
2. Where a brief says "stop for review" (schema, design system), write your review note or document, record the assumption in docs/assumptions.md, and continue.
3. You have no Android phone. Replace T0 with docs/t0-storage-notes.md: use official @sqlite.org/sqlite-wasm with opfs-sahpool in a Worker behind the repo interfaces, explain the choice, list what could not be verified, and write the 8-step manual phone checklist plus camera-scan and same-WiFi checks.
4. OPEN decisions D33 (counter mode), D34 (barcode/QR) and D44 (Google Drive backup) are NOT decided: do not build them. Record them under "Open questions".
5. Everything in D24 stays out of scope, including e-invoicing. The reserved [R] tables in docs/schema.md are not created.
6. No Cloudflare tokens, keys or accounts. Write the owner steps for GitHub, Cloudflare Pages and the D1 database in README.md.
7. Never claim anything was tested on a phone, WiFi, Cloudflare or real Tally. Use the "Not verified" section.
8. Commit after each task. Run tests, type check and build after each task and fix failures before moving on.

## Final report (exact format from AGENTS.md)
Changed (by task), Skipped, Not verified, Dependencies added, Open questions, Test results, Owner to check on the phone (3 steps or fewer), Suggestions.

Begin now.

---

## Grading checklist (for the tester, not part of the prompt)
1. Layer rule enforced by a failing test or lint.
2. No floats in money; quantities in thousandths; CGST/SGST odd-paise split exact.
3. Price-slab GST from data, labelled "verify with CA".
4. Variants and unique pieces work; oversold piece flagged.
5. Consignment payable only on sale; artisan ledger derived and append-only.
6. FIFO cost by replay from the latest checkpoint; two-device test identical in either sync order.
7. Invoice numbers: six digits, per-device series, no gaps, FY reset, cancel keeps number.
8. One action id on every row; audit_log row per action; changes carry before values.
9. Sandbox is a separate database; generator refuses the real DB; no demo rows in real DB (tests).
10. Same seed gives identical dummy data; integrity check passes at 1,000 and 100,000 invoices.
11. Trace and Explain views work and are fast; audit explorer exports CSV with BOM.
12. Storage guard (meter, estimate, 60% refusal, year-by-year with checkpoint and archive).
13. Sync simulation harness exists from T1; fault suite passes in T9.
14. Payloads encrypted before leaving device; honest security notes.
15. Backup wrong-passphrase and tamper tests; rolling snapshots; Health screen.
16. Tally XML chunked, escaped, golden-file test (synthetic, labelled).
17. Honest "Not verified" section; stayed out of scope.
