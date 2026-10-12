# Questions for the CA (before real use)

Seeded values in the app are samples marked "verify with your CA". Bring these to your CA and write the answers into docs/decisions.md.

1. GST scheme: is Ajrakhika a regular dealer, a composition dealer, or unregistered? (Changes invoice type and tax display.)
2. Annual turnover and GST e-invoicing: is e-invoicing applicable now or soon? (Not in this phase; schema has empty hook fields.)
3. Rates for clothing and handicrafts: HSN codes and current rates, including price-slab rules for clothing. Confirm every seeded rule.
4. Purchases from artisans: any tax treatment, reverse charge, exemption or documentation needed for artisans who are unregistered or exempt?
5. Consignment from artisans: how should consignment stock and payouts be treated for GST and accounts?
6. Invoice series: confirm the format `A/2627/000001`, one series per device, financial-year reset, 16-character limit, no gaps, cancelled numbers kept.
7. Credit notes and returns: rules, time limits and numbering (needed later).
8. Retention: how long must invoices, ledgers and backups be kept?
9. Valuation: confirm FIFO is acceptable; any need for weighted average?
10. Tally: ledger names and groups to use; sales ledgers by rate; round-off ledger; whether Tally stock items are tracked.
11. Round-off and rounding rules on invoices (per-line tax rounding, total to nearest rupee).
12. Customer data: any consent or notice needed for storing mobile numbers and addresses and for WhatsApp messages?
13. Cash receipts and limits: any rules affecting cash sales or payments to artisans that the app should warn about?
