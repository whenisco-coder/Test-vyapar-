# Owner's runbook (running Ajrakhika Business OS day to day)

Plain steps for the owner and trusted staff. Screen names may change as the app is built.

## Every day
- Open the app on each phone; check the sync status shows "up to date" (or "offline, will sync").
- At closing: confirm today's invoices, record cash and UPI payments, check "Money to receive" for follow-ups.

## Every week
- Make an encrypted backup and save it to a safe place outside the phone (Drive or another device). Keep your passphrase written down somewhere safe.
- Check the Health screen: storage, last backup, last sync, pending changes, integrity result.
- Pay artisans from "Money to pay artisans"; record each payout.

## Every month
- Run the integrity check; open the reconciliation reports (sales vs payments, stock vs movements, invoice number gaps, GST by rate).
- Export Sales to Tally for the month; import into Tally; compare totals.
- Review the audit log for unusual cancels, adjustments and price overrides.

## Every year (financial year end)
- Create the year-end checkpoint and verify it.
- Confirm the new invoice series starts at 000001 for the new year.
- Archive old audit rows (the app does this and keeps them in backups).
- Take a full backup and keep it for the legal retention period (confirm the period with your CA).

## Every quarter: restore drill
- Restore the latest backup on a spare device (or in the sandbox once supported) and check totals. A backup you have never restored is not a backup.

## Common situations
| Situation | Steps |
|---|---|
| Add a staff phone | Admin, Devices, Invite. Scan the QR on the new phone. Match the 6-digit code on both screens. Approve. |
| Staff leaves | Disable the user. Revoke their device. Rotate the key if they used their own phone. |
| Phone lost | Revoke the device and rotate the key. Install on a new phone, join by invite, sync restores data from the relay snapshot. |
| Numbers do not match | Run the integrity check. Use Explain on the number. Use Trace on the record. Do not edit; correct with a reversal. |
| Wrong invoice issued | Cancel it (reason required); it keeps its number; issue a new one. |
| Phone storage low | Check the Health screen; archive old years; clear photos you no longer need after a backup. |
| App update available | Finish syncing, tap Update when prompted, check the Health screen after. A safety snapshot is taken automatically. |
| Internet down | Keep working. Sync happens when internet or shop WiFi returns. Same-WiFi sync is best effort. |
| Sync stuck | Check the last error on the Health screen; try file sync as a fallback. |
| Forgot backup passphrase | Make a new backup now with a new passphrase. Old backups cannot be opened. |

## Before the first real day
- Test data lives only in the sandbox. Delete the sandbox, then enter real data.
- Take a first backup and complete one restore drill.
- Turn on two-factor authentication for GitHub, Cloudflare and your email.
