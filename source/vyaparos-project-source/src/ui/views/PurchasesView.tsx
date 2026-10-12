import React, { useState, useEffect } from 'react';
import { Purchase, PurchaseItem, Party, Product, BusinessSettings } from '../../domain/types';
import { getAppService } from '../../domain/services';
import { paiseToRupeeString, roundToRupee } from '../../domain/money';
import { calcLineTax, isInterstate } from '../../domain/gst';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import {
  ShoppingCart,
  Plus,
  Search,
  Truck,
  Trash2,
  Calendar,
  AlertCircle,
  PackagePlus,
} from 'lucide-react';

interface PurchasesViewProps {
  business: BusinessSettings;
}

interface PurchaseLine {
  productId: string;
  quantity: number;
  unitCostPaise: number;
  gstRateBp: number;
  dotBatchNote: string;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ business }) => {
  const service = getAppService();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // New Purchase Modal State
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('Own');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [notes, setNotes] = useState('');

  // Quick product add line
  const [selectedProdId, setSelectedProdId] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineCost, setLineCost] = useState('');
  const [lineDot, setLineDot] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pList, sList, prodList] = await Promise.all([
        service.purchases.getAll(),
        service.customers.getAll(),
        service.products.getAll(),
      ]);
      setPurchases(pList);
      // Filter parties that are suppliers or both
      const supps = sList.filter(
        (p) =>
          p.type.toLowerCase() === 'supplier' ||
          p.type.toLowerCase() === 'both' ||
          p.type === 'SUPPLIER' ||
          p.type === 'BOTH'
      );
      setSuppliers(supps.length > 0 ? supps : sList);
      setProducts(prodList);

      if (supps.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supps[0].id);
      } else if (sList.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sList[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = () => {
    if (!selectedProdId) return;
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;

    const qty = parseInt(lineQty) || 1;
    const costNum = parseFloat(lineCost) || 0;
    const costPaise = Math.round(costNum * 100);

    setLines([
      ...lines,
      {
        productId: prod.id,
        quantity: qty,
        unitCostPaise: costPaise,
        gstRateBp: prod.gst_rate_bp,
        dotBatchNote: lineDot.trim(),
      },
    ]);

    setSelectedProdId('');
    setLineQty('1');
    setLineCost('');
    setLineDot('');
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  // Computations
  let totalTaxablePaise = 0;
  let totalTaxPaise = 0;

  for (const l of lines) {
    const lTaxable = l.quantity * l.unitCostPaise;
    const tax = calcLineTax(lTaxable, l.gstRateBp, false);
    totalTaxablePaise += lTaxable;
    totalTaxPaise += tax.taxPaise;
  }
  const grandTotalPaise = totalTaxablePaise + totalTaxPaise;

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Please add at least one line item to inward purchase');
      return;
    }
    if (!selectedSupplierId) {
      setError('Please select a supplier');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const purchaseItems: PurchaseItem[] = lines.map((l) => {
        const lTaxable = l.quantity * l.unitCostPaise;
        const tax = calcLineTax(lTaxable, l.gstRateBp, false);
        return {
          id: '',
          purchase_id: '',
          product_id: l.productId,
          quantity: l.quantity,
          unit_cost_paise: l.unitCostPaise,
          cost_paise: l.unitCostPaise,
          gst_rate_bp: l.gstRateBp,
          taxable_paise: lTaxable,
          tax_paise: tax.taxPaise,
          total_paise: lTaxable + tax.taxPaise,
          batch_attributes_json: l.dotBatchNote ? JSON.stringify({ dot: l.dotBatchNote }) : null,
          device_id: business.device_id,
          user_id: 'owner',
          created_at: new Date().toISOString(),
        };
      });

      const purchaseRecord: Purchase = {
        id: '',
        supplier_id: selectedSupplierId,
        supplier_invoice_no: supplierInvNo.trim() || undefined,
        purchase_date: purchaseDate,
        status: 'posted',
        subtotal_paise: totalTaxablePaise,
        total_taxable_paise: totalTaxablePaise,
        tax_paise: totalTaxPaise,
        total_tax_paise: totalTaxPaise,
        total_amount_paise: grandTotalPaise,
        total_paise: grandTotalPaise,
        notes: notes.trim() || undefined,
        device_id: business.device_id,
        user_id: 'owner',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await service.purchases.createPurchase(purchaseRecord, purchaseItems);
      setIsNewOpen(false);
      setLines([]);
      setSupplierInvNo('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to record purchase');
    } finally {
      setSaving(false);
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    const invNo = p.supplier_invoice_no || p.invoice_number || '';
    const supp = suppliers.find((s) => s.id === p.supplier_id);
    const suppName = supp?.name || '';
    return (
      !search.trim() ||
      invNo.toLowerCase().includes(search.toLowerCase()) ||
      suppName.toLowerCase().includes(search.toLowerCase()) ||
      p.purchase_date.includes(search)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Purchases & Inward Stock</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log supplier bills and create inventory batches with Tyre DOT / Batch codes.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setError('');
            setIsNewOpen(true);
          }}
        >
          Record Purchase
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Inward Value
          </div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
            ₹{' '}
            {paiseToRupeeString(
              purchases.reduce((s, p) => s + (p.total_amount_paise ?? p.total_paise ?? 0), 0)
            )}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Purchases Recorded
          </div>
          <div className="text-lg font-bold font-mono text-slate-800 mt-1">
            {purchases.length}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Registered Suppliers
          </div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1">
            {suppliers.length}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by supplier bill no, supplier name, date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[38px]"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading inward records...</div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <Truck className="h-8 w-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">No purchases recorded</p>
            <p className="text-slate-400">
              Record your first inward supplier bill to replenish stock batches.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Bill / Challan Ref</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Supplier Name</th>
                  <th className="py-3 px-2 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3.5 text-right font-bold">Total Cost (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((p) => {
                  const supp = suppliers.find((s) => s.id === p.supplier_id);
                  const tot = p.total_amount_paise ?? p.total_paise ?? 0;
                  const taxb = p.total_taxable_paise ?? p.subtotal_paise ?? 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                        {p.supplier_invoice_no || p.invoice_number || 'Direct Inward'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {p.purchase_date}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {supp?.name || 'Unknown Supplier'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          POSTED
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ₹ {paiseToRupeeString(taxb)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-950">
                        ₹ {paiseToRupeeString(tot)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Purchase Modal */}
      <Modal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        title="Record Inward Purchase Bill"
        maxWidth="4xl"
      >
        <form onSubmit={handleSavePurchase} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Supplier *
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white min-h-[38px]"
                required
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.mobile ? `(${s.mobile})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Supplier Invoice / Bill No *"
              placeholder="e.g. AP/2026/894"
              value={supplierInvNo}
              onChange={(e) => setSupplierInvNo(e.target.value)}
              required
            />

            <div>
              <label className="block text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white min-h-[38px]"
              />
            </div>
          </div>

          {/* Quick Line Item Builder */}
          <div className="p-3 border border-slate-200 rounded-lg bg-white space-y-2">
            <span className="font-semibold text-slate-800 uppercase tracking-wide text-[10px] block">
              + Add Item to Inward Batch
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Product</label>
                <select
                  value={selectedProdId}
                  onChange={(e) => {
                    setSelectedProdId(e.target.value);
                    const prod = products.find((p) => p.id === e.target.value);
                    if (prod && !lineCost) {
                      setLineCost(paiseToRupeeString(prod.selling_price_paise));
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white min-h-[36px]"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={lineQty}
                  onChange={(e) => setLineQty(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded min-h-[36px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Unit Cost (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="3200.00"
                  value={lineCost}
                  onChange={(e) => setLineCost(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded min-h-[36px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Tyre DOT / Batch</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. 2423"
                    value={lineDot}
                    onChange={(e) => setLineDot(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded min-h-[36px]"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="min-h-[36px] py-1 px-3"
                    onClick={handleAddLine}
                    disabled={!selectedProdId || !lineCost}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Lines Table */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Product Name</th>
                  <th className="py-2 px-2 text-center">Qty</th>
                  <th className="py-2 px-2 text-right">Unit Cost</th>
                  <th className="py-2 px-2 text-center">DOT / Batch</th>
                  <th className="py-2 px-3 text-right">Subtotal (₹)</th>
                  <th className="py-2 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      No line items added yet. Use the builder above.
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    const prod = products.find((p) => p.id === l.productId);
                    const lSubtotal = l.quantity * l.unitCostPaise;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{prod?.name}</td>
                        <td className="py-2 px-2 text-center font-bold">
                          {l.quantity} {prod?.unit}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          ₹ {paiseToRupeeString(l.unitCostPaise)}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600">
                          {l.dotBatchNote || '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹ {paiseToRupeeString(lSubtotal)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Grand Summary */}
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-semibold text-slate-700">Total Inward Purchase Cost:</span>
            <span className="font-mono text-base font-bold text-slate-950">
              ₹ {paiseToRupeeString(grandTotalPaise)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || lines.length === 0}>
              {saving ? 'Creating Stock Batches...' : 'Post Purchase & Update Inventory'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
