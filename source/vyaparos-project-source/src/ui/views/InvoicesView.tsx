import React, { useState, useEffect } from 'react';
import { Invoice, BusinessSettings } from '../../domain/types';
import { getAppService } from '../../domain/services';
import { paiseToRupeeString } from '../../domain/money';
import { Button } from '../components/Button';
import { Card, Badge } from '../components/Card';
import { CreateInvoiceModal } from '../components/CreateInvoiceModal';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Calendar,
  User,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

interface InvoicesViewProps {
  business: BusinessSettings;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ business }) => {
  const service = getAppService();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'finalized' | 'cancelled'>('all');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const list = await service.invoices.getAll();
      setInvoices(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvoice = async (invoiceId: string, reason: string) => {
    await service.cancelSale(invoiceId, reason);
    await loadInvoices();
    if (selectedInvoice && selectedInvoice.id === invoiceId) {
      const updated = await service.invoices.getById(invoiceId);
      setSelectedInvoice(updated);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const invNo = inv.invoice_number || inv.number || '';
    let custName = '';
    try {
      const snap = JSON.parse(inv.customer_snapshot_json || '{}');
      custName = snap.name || '';
    } catch {}

    const matchesSearch =
      !search.trim() ||
      invNo.toLowerCase().includes(search.toLowerCase()) ||
      custName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.invoice_date || inv.date || '').includes(search);

    const matchesStatus =
      statusFilter === 'all' ||
      inv.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const totalSalesPaise = invoices
    .filter((inv) => inv.status === 'finalized' || inv.status === 'FINALIZED')
    .reduce((sum, inv) => sum + inv.grand_total_paise, 0);

  const finalizedCount = invoices.filter(
    (inv) => inv.status === 'finalized' || inv.status === 'FINALIZED'
  ).length;

  return (
    <div className="space-y-4">
      {/* View Header with Key Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sales Invoices</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sequential gapless numbering, GST tax computation, and FIFO batch valuation.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setIsCreateOpen(true)}
        >
          New Sale Invoice
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Sales
          </div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
            ₹ {paiseToRupeeString(totalSalesPaise)}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Finalized Invoices
          </div>
          <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
            {finalizedCount}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Series Prefix / FY
          </div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1 truncate">
            {business.invoice_prefix} / FY
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by invoice number, customer name, date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(['all', 'finalized', 'cancelled'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors min-h-[36px] ${
                statusFilter === filter
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices List / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading invoices...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <FileText className="h-8 w-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">No invoices found</p>
            <p className="text-slate-400">
              {search ? 'Try modifying your search query' : 'Create your first invoice to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Invoice No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-2 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">Tax</th>
                  <th className="py-3 px-3.5 text-right font-bold">Grand Total (₹)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  let customerName = 'Counter Customer';
                  try {
                    const snap = JSON.parse(inv.customer_snapshot_json || '{}');
                    if (snap.name) customerName = snap.name;
                  } catch {}

                  const isCancelled =
                    inv.status === 'cancelled' || inv.status === 'CANCELLED';

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                        {inv.invoice_number || inv.number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {inv.invoice_date || inv.date}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {customerName}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {isCancelled ? (
                          <Badge variant="rose">Cancelled</Badge>
                        ) : (
                          <Badge variant="emerald">Finalized</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ₹ {paiseToRupeeString(inv.taxable_total_paise ?? inv.taxable_paise ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ₹ {paiseToRupeeString(inv.tax_total_paise ?? inv.total_tax_paise ?? 0)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-950">
                        ₹ {paiseToRupeeString(inv.grand_total_paise)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<Eye className="h-3.5 w-3.5" />}
                          className="min-h-[32px] py-1 px-2.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoice(inv);
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        business={business}
        onInvoiceCreated={(newInv) => {
          loadInvoices();
          setSelectedInvoice(newInv);
        }}
      />

      <InvoiceDetailModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
        business={business}
        onCancelInvoice={handleCancelInvoice}
      />
    </div>
  );
};
