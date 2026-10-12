# Security and privacy

Scope: Ajrakhika Business OS v0.1. Honest, practical security for a small business with no budget. This is a baseline, not a certification. Items marked **Limit** are known weaknesses we accept and state openly.

## 1. What we protect

| Asset | Why it matters |
|---|---|
| Sales, purchase, payment, stock and artisan data | The business record; GST records must be kept and trustworthy |
| Customer personal data (name, mobile, address, GSTIN) | Privacy; likely covered by India's data protection law (confirm with a lawyer or CA) |
| Cost prices, margins, artisan rates and payables | Commercial secrets; staff should not see them by default |
| Artisan bank or UPI text | Sensitive personal data |
| Workspace key, device keys, PIN hashes | Anyone with the key can read synced data |
| Backup files and the backup passphrase | A leaked backup is a full copy of the business |
| The source repo and the Cloudflare account | Whoever controls them controls the app everyone runs |

## 2. Who and what we defend against

| Threat | Example | Main defenses |
|---|---|---|
| Lost or stolen phone | Staff phone left in a rickshaw | PIN lock and auto-lock; owner revokes the device and rotates the key; phone screen lock and OS encryption (**Limit**: app data is not separately encrypted at rest in v0.1) |
| Curious or dishonest staff | Staff views costs, edits an invoice, cancels a sale | Permissions per user; finalized invoices immutable; reasons required; audit trail with hash chain; owner approval later (reserved tables) |
| Ex-staff with an old phone | Left the job, still has the app | Revoke device; rotate workspace key; they keep only what was already on their phone (**Limit**: cannot remote-wipe a browser app) |
| Relay compromise | Cloudflare account or D1 breach | Everything on the relay is end-to-end encrypted; the relay sees only ciphertext and metadata |
| Network attacker | Café WiFi | HTTPS only; encrypted payloads; device-signed requests |
| Rogue device joins | Someone photographs the invite QR | Invite is single use and expires in 10 minutes; owner must approve the new device by matching a 6-digit code on both screens |
| Replayed or forged sync messages | Old batch resent | Idempotent apply by change id; per-device sequence numbers; signatures; AAD binds workspace, device and batch |
| Malicious dependency | Compromised npm package | Few dependencies; lockfile; pinned versions; review each new one; no install scripts where possible; free GitHub security alerts |
| Cross-site scripting | Pasted address with script | React escaping; no raw HTML rendering; strict CSP; XML and PDF built from data, not HTML strings |
| Accidental loss | Deleted data, bad update, cleared browser storage | Soft delete; snapshots before risky actions; persistent storage request; encrypted backups; relay snapshot |
| Lost backup passphrase | Owner forgets it | Not recoverable by design; the app warns clearly and suggests a written copy kept safely |
| Tampering with the local database | Someone edits SQLite via browser tools | Hash-chained audit log and integrity check detect casual edits (**Limit**: a skilled attacker with full device access can rewrite the chain) |

Out of scope for v0.1: nation-state attackers, hardware attacks, strong anti-tamper on rooted devices.

## 3. Security rules for the build (agents must follow)

**Data and storage**
- No secrets, keys or tokens in the repo, logs or error messages. No PII in logs.
- All SQL is parameterized. Only the Data layer touches SQL.
- Never store the PIN, passphrase or workspace key in plain text. Keep the workspace key in storage that is not exported in normal backups unless the backup is encrypted.

**PIN**
- Stored as a salted PBKDF2-SHA256 hash via WebCrypto, with iterations calibrated on the device (at least 600,000, and at least 300 ms per attempt).
- 5 wrong attempts adds growing delays; 10 locks the user until the owner resets.
- Auto-lock after inactivity (default 2 minutes, configurable). A PIN is a lock, not strong security.

**Crypto (WebCrypto only, no hand-rolled crypto)**
- AES-256-GCM, random 96-bit nonce per message, never reused with a key.
- Sync: random 256-bit workspace key. Each device also has its own ECDSA P-256 key pair for signing pushes. Associated data binds workspace id, device id and batch id.
- Backups: key from a passphrase with PBKDF2-SHA256 (at least 600,000 iterations) and a random salt; file includes version, salt, nonce and checksum. Passphrase minimum 12 characters or generated words.
- Pairing: invite carries a one-time secret; the owner approves by matching a 6-digit code on both screens. After pairing the invite is dead.
- Key rotation: owner creates a new workspace key, re-encrypts the relay snapshot, and re-pairs remaining devices. Revoked devices stop syncing.

**Relay (Cloudflare Pages Functions plus D1)**
- No accounts or passwords. Requests are signed by registered device keys; the relay checks the signature and the workspace.
- Stores ciphertext, sizes, timestamps and device ids only. Rate limits and size limits on every endpoint. Reject unknown workspaces and revoked devices.
- No logging of payloads. Metadata the relay can see: workspace id, device ids, timing, size, IP address (**Limit**).

**Web hardening**
- HTTPS only. Headers via a `_headers` file: strict Content-Security-Policy (default-src 'self'; no inline scripts; no third-party origins; connect-src limited to the app host), X-Content-Type-Options nosniff, Referrer-Policy no-referrer, frame-ancestors 'none', Permissions-Policy allowing camera only for the app itself.
- No analytics, ads, CDNs, remote fonts or third-party scripts. All assets are bundled so the app works offline and leaks nothing.
- Service worker caches only the app's own files; versioned releases with an update prompt.
- No `dangerouslySetInnerHTML`, no `eval`, no dynamic script loading. Escape all values placed in XML (Tally) and in PDFs.

**Supply chain and accounts**
- Lockfile committed; exact versions; each new dependency justified in the report. Run `npm audit` before each release and turn on free GitHub Dependabot alerts.
- The owner turns on two-factor authentication for GitHub, Cloudflare and the email used for them. Branch protection on main (pull requests, no force push).
- Agents never receive tokens (D28).

**Audit and integrity**
- Every action has an action id and an audit_log row (D50). Audit rows are hash-chained per device (D55): each row stores the hash of the previous row and of itself. The integrity check verifies the chain and reports breaks.
- Finalized invoices and ledgers are never edited; corrections are reversals.

## 4. Roles and permissions (defaults)

| Action | Owner | Staff (default) |
|---|---|---|
| Create sale, record customer payment | Yes | Yes |
| View stock and prices | Yes | Yes |
| View costs, margins, profit | Yes | No |
| Sell below the minimum price | Yes | No (needs approval later) |
| Cancel a finalized invoice | Yes | No |
| Stock adjustments | Yes | No |
| View artisan payables, pay artisans | Yes | No |
| Edit products, prices, parties | Yes | Configurable |
| Backup, restore, invite or revoke devices | Yes | No |
| Settings, users, Admin Lab | Yes | No |
Permissions live on each user record (`users.permissions`) and are enforced in the Domain layer, not only by hiding buttons. **Limit:** enforcement is client-side; a person with a modified device and the workspace key could bypass it.

## 5. Privacy

- Collect only what the business needs: name, mobile, address, GSTIN for invoices. No contact lists, no location, no tracking.
- Data stays on devices and, encrypted, on the relay. Nothing is sent to third parties.
- Invoice records must be retained for the legal period (as far as I know several years under GST rules; confirm with the CA), so customers with invoices cannot be fully erased. Allow removing or masking optional fields (alt mobile, notes) and keep the minimum on invoices.
- Photos of products are business data. Do not capture customer faces; no photos of ID documents.
- Show a short privacy note in Settings explaining what is stored and where.

## 6. Incident playbooks (owner)

| Situation | Do this |
|---|---|
| Phone lost or stolen | Revoke the device in Admin; rotate the workspace key; change any PIN reused elsewhere; check the audit log for recent activity |
| Staff leaves | Disable the user; revoke their device; rotate the key if they had their own phone |
| Suspect tampering | Run the integrity check; open the audit explorer for the period; restore from the last good encrypted backup into a spare device to compare |
| Backup passphrase lost | Old backups cannot be opened; make a new backup immediately with a passphrase you write down and store safely |
| Relay or Cloudflare compromised | Rotate the workspace key; revoke the relay workspace; sync by file or direct WiFi until a new relay is set up |
| Repo or GitHub account compromised | Rotate credentials; review recent commits; redeploy from a known good commit |

## 7. Security tests (required)

- PIN hashing, lockout and delays; permission checks in the Domain layer for every restricted action.
- Encryption round trips; wrong key or tampered ciphertext fails; nonce never repeats; replayed batch is ignored; signature failure rejected.
- Invite expiry and single use; unapproved device cannot join; revoked device rejected after rotation.
- Backup: wrong passphrase, tampered file, truncated file all fail without changing data.
- Hash chain: edited or deleted audit row is detected.
- CSP and headers present in the build output; no external URLs in the built app (scripted check).
- XML and PDF escaping tests with hostile strings.
- Dependency list reviewed; `npm audit` clean or exceptions documented.

## 8. Known limits (stated to the owner)

1. App data is not separately encrypted at rest on the phone; it relies on the phone's own lock and encryption. Optional at-rest encryption is a later item.
2. Client-side permissions can be bypassed by a skilled attacker with a modified device.
3. A revoked device keeps whatever data it already held.
4. The relay can see metadata even though it cannot read content.
5. A 4 to 6 digit PIN is weak against someone with unlimited attempts on a copied database.
