/**
 * Tally Prime Export Service
 */

import { getDbClient, DbClient } from '../../data/client.ts';
import { InvoiceRepo } from '../repos/invoice-repo.ts';
import { SettingsRepo } from '../repos/settings-repo.ts';
import { PartyRepo } from '../repos/party-repo.ts';
import { generateTallySalesXml, TallyInvoiceInput, TallyLedgerMapping } from '../tally.ts';

export class TallyService {
  private invoiceRepo: InvoiceRepo;
  private settingsRepo: SettingsRepo;
  private partyRepo: PartyRepo;

  constructor(private client: DbClient = getDbClient()) {
    this.invoiceRepo = new InvoiceRepo(client);
    this.settingsRepo = new SettingsRepo(client);
    this.partyRepo = new PartyRepo(client);
  }

  async exportSalesXml(startDate?: string, endDate?: string): Promise<{
    xmlContent: string;
    filename: string;
    count: number;
  }> {
    const allInvoices = await this.invoiceRepo.list();
    const settings = await this.settingsRepo.get();

    const mapping: TallyLedgerMapping = {
      salesLedger: settings?.tally_sales_ledger || 'Sales Account',
      cgstLedger: settings?.tally_cgst_ledger || 'Output CGST',
      sgstLedger: settings?.tally_sgst_ledger || 'Output SGST',
      igstLedger: settings?.tally_igst_ledger || 'Output IGST',
      roundOffLedger: settings?.tally_round_off_ledger || 'Round Off',
    };

    // Filter date range and status FINALIZED
    const filtered = allInvoices.filter((inv) => {
      const isFinal = inv.status.toLowerCase() === 'finalized';
      if (!isFinal) return false;
      const d = inv.date || inv.invoice_date || '';
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    const tallyInputs: TallyInvoiceInput[] = [];

    for (const inv of filtered) {
      let customerName = 'Cash Customer';
      let customerGstin = '';
      let customerStateCode = '27';

      try {
        const snap = JSON.parse(inv.customer_snapshot_json);
        customerName = snap.name || customerName;
        customerGstin = snap.gstin || '';
        customerStateCode = snap.state_code || '27';
      } catch {
        // Fallback to customer table
        const party = await this.partyRepo.getById(inv.customer_id);
        if (party) {
          customerName = party.name;
          customerGstin = party.gstin || '';
          customerStateCode = party.state_code;
        }
      }

      tallyInputs.push({
        invoiceNumber: inv.number || inv.invoice_number || '',
        date: inv.date || inv.invoice_date || '',
        customerName,
        customerGstin,
        customerStateCode,
        status: inv.status,
        taxablePaise: inv.taxable_paise ?? inv.taxable_total_paise ?? 0,
        cgstPaise: inv.cgst_paise ?? inv.cgst_total_paise ?? 0,
        sgstPaise: inv.sgst_paise ?? inv.sgst_total_paise ?? 0,
        igstPaise: inv.igst_paise ?? inv.igst_total_paise ?? 0,
        roundOffPaise: inv.round_off_paise,
        grandTotalPaise: inv.grand_total_paise,
        notes: inv.notes || undefined,
      });
    }

    const xmlContent = generateTallySalesXml(tallyInputs, mapping);

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `tally_sales_${todayStr}.xml`;

    return {
      xmlContent,
      filename,
      count: tallyInputs.length,
    };
  }
}
