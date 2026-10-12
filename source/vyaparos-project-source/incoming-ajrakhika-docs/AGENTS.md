# AGENTS.md: rules for every AI agent

You build one task at a time for the owner of Ajrakhika, a small business trading local Kutchi handicrafts and clothing. The owner has no budget. Stay inside the task.

## Read first, in this order
1. docs/decisions.md (what is settled)
2. docs/architecture.md and docs/schema.md (how it fits)
3. docs/security.md (security rules you must follow)
4. Your task brief in docs/tasks/

## Scope lock
- Only do what your brief lists. Anything else goes in your report as a suggestion, not in the code.
- v0.1 scope is fixed (decision D21). Do not start v0.2 items or anything in D24.
- Do not reopen a DECIDED item. Do not guess on an OPEN item: stop and ask the owner.
- Only the owner changes decisions.md.

## Architecture rules
- 3 layers: Data, Domain, UI. UI never imports database code. Database code never touches UI.
- Money is integer paise. No floats in money math. IDs are UUIDv7. Stock is derived from movements. Every write goes to the changes table in the same transaction.
- GST rules, units, categories, state codes and translations are data files, never constants in logic.
- Build from scratch. Do not read or copy old app code (D22).

## Data safety
- Never delete or overwrite user data without a backup taken first.
- Migrations take a safety backup, and refuse to downgrade.
- Test data only until the backup/restore task is accepted (D27). After that, all dummy data and stress tests run only in the Admin Lab sandbox, never in the real database (D48).
- Every user action carries one action id on every row it writes, and writes an audit_log row (D50). Never write rows without it.
- No network calls except to the app's own host and to paired devices. No analytics, no third-party scripts.

## Secrets and resources
- Agents never receive or ask for Cloudflare tokens, API keys or passwords. Never commit secrets.
- Deployment: the owner connects the private GitHub repo to Cloudflare Pages once. Agents only push code and docs.
- Anything needing a dashboard action (creating the D1 database, binding it, setting variables) is written as numbered owner steps in README.md.
- No paid services or new accounts without owner approval (D19).

## Security
- Follow docs/security.md. Security tests listed there are part of the definition of done for T6 to T10.
- Never log PII, keys, PINs or passphrases. Never add third-party scripts, fonts or CDNs.

## Dependencies
- Prefer none. Any new dependency must be free, open source, actively maintained and small. List it in your report with the reason.

## Honesty rule
- Never claim something was tested on a phone, on WiFi, on Cloudflare or in Tally unless it was. List it under "Not verified".

## Definition of done
- Acceptance checks in the brief pass.
- Tests pass (Vitest for money, GST, FIFO, Tally XML, sync merge).
- Works on the owner's Android phone, including offline.
- Docs updated if you changed behavior (decisions.md only with owner approval).

## Report format (end of every task)
- Changed: files and what.
- Skipped: what and why.
- Not verified: what needs a real phone, WiFi, Cloudflare or Tally.
- Open questions: list.
- Owner to check on the phone: 3 steps or fewer.

## Style
- Small commits, one purpose each. Plain names. No refactors of unrelated code.
- Dense and clear on desktop, bottom tab bar on phone.
- Follow docs/design-system.md: warm, calm, photo-first, plain language, 48px tap targets, WCAG AA contrast.
