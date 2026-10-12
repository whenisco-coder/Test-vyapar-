import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import {
  Customer,
  Product,
  BusinessSettings,
  ProductStockInfo,
  PaymentMode,
  Invoice,
} from '../../domain/types';
import { getAppService } from '../../domain/services';
import { paiseToRupeeString, roundToRupee, amountInWords } from '../../domain/money';
import { calcLineTax, isInterstate, validateGSTIN, STATE_CODES } from '../../domain/gst';
import { generateUUIDv7 } from '../../domain/uuid';
import { Plus, Trash2, Search, UserPlus, AlertCircle, ShoppingCart } from 'lucide-react';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  business: BusinessSettings;
  onInvoiceCreated: (invoice: Invoice) => void;
}

interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  unitPricePaise: number;
  availableStock: number;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  isOpen,
  onClose,
  business,
  onInvoiceCreated,
}) => {
  const service = getAppService();

  // Customers & Products State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockInfos, setStockInfos] = useState<ProductStockInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerMobile, setNewCustomerMobile] = useState('');
  const [newCustomerGstin, setNewCustomerGstin] = useState('');
  const [newCustomerState, setNewCustomerState] = useState(business.state_code);
  const [newCustomerAddress, setNewCustomerAddress] = useState('');

  const [invoiceMode, setInvoiceMode] = useState<'tax_invoice' | 'simple_bill'>('tax_invoice');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [notes, setNotes] = useState('');

  // Payment section
  const [paymentOption, setPaymentOption] = useState<'full' | 'later' | 'partial'>('full');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentRef, setPaymentRef] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const custList = await service.customers.getAll();
      const productStockList = await service.stock.getAllProductsStockInfo();
      setCustomers(custList);
      setStockInfos(productStockList);

      // Default to first customer or counter sale customer
      if (custList.length > 0) {
        setSelectedCustomer(custList[0]);
      } else {
        setIsNewCustomer(true);
        setNewCustomerName('Cash Sale / Walk-in Customer');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProductToCart = (pInfo: ProductStockInfo) => {
    const existingIdx = cart.findIndex((i) => i.productId === pInfo.product.id);
    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          productId: pInfo.product.id,
          product: pInfo.product,
          quantity: 1,
          unitPricePaise: pInfo.product.selling_price_paise,
          availableStock: pInfo.quantityOnHand,
        },
      ]);
    }
    setProductSearch('');
  };

  const updateCartItemQty = (idx: number, qty: number) => {
    if (qty <= 0) {
      removeCartItem(idx);
      return;
    }
    const updated = [...cart];
    updated[idx].quantity = qty;
    setCart(updated);
  };

  const updateCartItemRate = (idx: number, rupeesStr: string) => {
    const num = parseFloat(rupeesStr) || 0;
    const paise = Math.round(num * 100);
    const updated = [...cart];
    updated[idx].unitPricePaise = paise;
    setCart(updated);
  };

  const removeCartItem = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Calculations
  const buyerState = isNewCustomer
    ? newCustomerState
    : selectedCustomer?.state_code || business.state_code;
  const isInter = isInterstate(business.state_code, buyerState);

  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;

  for (const item of cart) {
    const lineTaxable = item.quantity * item.unitPricePaise;
    const lineTax = calcLineTax(lineTaxable, item.product.gst_rate_bp, isInter);

    totalTaxablePaise += lineTaxable;
    totalCgstPaise += lineTax.cgstPaise;
    totalSgstPaise += lineTax.sgstPaise;
    totalIgstPaise += lineTax.igstPaise;
    totalTaxPaise += lineTax.taxPaise;
  }

  const rawGrandTotalPaise = totalTaxablePaise + totalTaxPaise;
  const { roundedTotalPaise, roundOffPaise } = roundToRupee(rawGrandTotalPaise);

  // Submit invoice
  const handleFinalize = async () => {
    if (cart.length === 0) {
      setError('Please add at least one product item');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      let customer: Customer;
      if (isNewCustomer) {
        if (!newCustomerName.trim()) {
          setError('Customer name is required');
          setSubmitting(false);
          return;
        }

        if (newCustomerGstin) {
          const val = validateGSTIN(newCustomerGstin);
          if (!val.valid) {
            setError(`Invalid GSTIN: ${val.error}`);
            setSubmitting(false);
            return;
          }
        }

        const now = new Date().toISOString();
        const custId = generateUUIDv7();
        customer = {
          id: custId,
          name: newCustomerName.trim(),
          mobile: newCustomerMobile.trim() || undefined,
          gstin: newCustomerGstin.trim().toUpperCase() || undefined,
          party_kind: newCustomerGstin ? 'B2B' : 'B2C',
          type: 'customer',
          address_line1: newCustomerAddress.trim() || undefined,
          city: undefined,
          pincode: undefined,
          state_code: newCustomerState,
          device_id: business.device_id,
          user_id: 'owner',
          created_at: now,
          updated_at: now,
        };
        await service.customers.save(customer);
      } else {
        if (!selectedCustomer) {
          setError('Please select a customer');
          setSubmitting(false);
          return;
        }
        customer = selectedCustomer;
      }

      // Check stock levels if negative stock not allowed
      if (business.allow_negative_stock === 0) {
        for (const item of cart) {
          if (item.quantity > item.availableStock) {
            setError(
              `Insufficient stock for "${item.product.name}". Available: ${item.availableStock}, Requested: ${item.quantity}`
            );
            setSubmitting(false);
            return;
          }
        }
      }

      // Create Finalized Sale
      const invoice = await service.createFinalizedSale({
        customer,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPricePaise: i.unitPricePaise,
          location: 'Own',
        })),
        mode: invoiceMode,
        invoiceDate,
        notes: notes.trim() || undefined,
      });

      // Record immediate payment if requested
      if (paymentOption === 'full') {
        await service.recordPayment({
          customerId: customer.id,
          invoiceId: invoice.id,
          amountPaise: roundedTotalPaise,
          mode: paymentMode.toLowerCase() as any,
          reference: paymentRef.trim() || undefined,
          paidAt: invoiceDate,
        });
      }

      onInvoiceCreated(invoice);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to finalize invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = stockInfos.filter(
    (s) =>
      productSearch.trim() &&
      (s.product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (s.product.sku && s.product.sku.toLowerCase().includes(productSearch.toLowerCase())) ||
        (s.product.hsn && s.product.hsn.includes(productSearch)))
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Sales Invoice" maxWidth="4xl">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Header: Customer selection & invoice options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          {/* Customer Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 uppercase tracking-wide">
                Customer / Buyer
              </label>
              <button
                type="button"
                onClick={() => setIsNewCustomer(!isNewCustomer)}
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
              >
                {isNewCustomer ? 'Select Existing' : '+ New Customer'}
              </button>
            </div>

            {isNewCustomer ? (
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <input
                  type="text"
                  placeholder="Customer Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Mobile Number"
                    value={newCustomerMobile}
                    onChange={(e) => setNewCustomerMobile(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="GSTIN (Optional)"
                    value={newCustomerGstin}
                    onChange={(e) => setNewCustomerGstin(e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                    maxLength={15}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newCustomerState}
                    onChange={(e) => setNewCustomerState(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-800 focus:outline-none bg-white"
                  >
                    {(Object.entries(STATE_CODES) as [string, string][]).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Address (Optional)"
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                <select
                  value={selectedCustomer?.id || ''}
                  onChange={(e) => {
                    const c = customers.find((cust) => cust.id === e.target.value);
                    if (c) setSelectedCustomer(c);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-slate-800 focus:outline-none bg-white min-h-[44px]"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.gstin ? `[GSTIN: ${c.gstin}]` : ''}
                    </option>
                  ))}
                </select>
                {selectedCustomer && (
                  <div className="mt-1.5 text-slate-500 text-[11px] flex gap-3">
                    <span>
                      Place of Supply:{' '}
                      <strong className="text-slate-700">
                        {STATE_CODES[selectedCustomer.state_code] || selectedCustomer.state_code}
                      </strong>
                    </span>
                    {selectedCustomer.gstin && <span>GSTIN: {selectedCustomer.gstin}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice Settings */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-800 uppercase tracking-wide block mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:border-slate-800 min-h-[40px]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-800 uppercase tracking-wide block mb-1">
                  Invoice Mode
                </label>
                <select
                  value={invoiceMode}
                  onChange={(e) => setInvoiceMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:border-slate-800 min-h-[40px]"
                >
                  <option value="tax_invoice">Tax Invoice (GST)</option>
                  <option value="simple_bill">Bill of Supply</option>
                </select>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-600">
              Tax Regime:{' '}
              {isInter ? (
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Interstate Sale (IGST)
                </span>
              ) : (
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Intrastate Sale (CGST + SGST)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Product Search & Quick Add */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by Name, Tyre Size, SKU, or HSN to add to invoice..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[40px]"
            />
          </div>

          {filteredProducts.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-md divide-y divide-slate-100 z-10">
              {filteredProducts.map((pInfo) => (
                <div
                  key={pInfo.product.id}
                  onClick={() => handleAddProductToCart(pInfo)}
                  className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{pInfo.product.name}</span>
                    <span className="text-slate-400 text-[11px] ml-2">
                      HSN: {pInfo.product.hsn || '-'} | GST: {pInfo.product.gst_rate_bp / 100}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                        pInfo.quantityOnHand > 0
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-rose-50 text-rose-800'
                      }`}
                    >
                      Stock: {pInfo.quantityOnHand} {pInfo.product.unit}
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      ₹ {paiseToRupeeString(pInfo.product.selling_price_paise)}
                    </span>
                    <Button variant="outline" size="sm" className="min-h-[32px] py-1 px-2.5">
                      + Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Line Items Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Product Item</th>
                <th className="py-2.5 px-2 text-center">Qty</th>
                <th className="py-2.5 px-2 text-right">Rate (₹)</th>
                <th className="py-2.5 px-2 text-right">Taxable</th>
                <th className="py-2.5 px-2 text-right">Tax (GST)</th>
                <th className="py-2.5 px-3 text-right">Total (₹)</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <ShoppingCart className="h-6 w-6 mx-auto mb-1 opacity-40" />
                    No items added yet. Search above to add products.
                  </td>
                </tr>
              ) : (
                cart.map((item, idx) => {
                  const lineTaxable = item.quantity * item.unitPricePaise;
                  const lineTax = calcLineTax(lineTaxable, item.product.gst_rate_bp, isInter);
                  const lineTotal = lineTaxable + lineTax.taxPaise;
                  const isLow = item.quantity > item.availableStock;

                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">{item.product.name}</div>
                        <div className="text-[10px] text-slate-500">
                          Avail: {item.availableStock} {item.product.unit} | GST:{' '}
                          {item.product.gst_rate_bp / 100}%
                          {isLow && (
                            <span className="text-rose-600 font-semibold ml-2">
                              ⚠️ Exceeds stock
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center w-20">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateCartItemQty(idx, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-center font-medium border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2 text-right w-28">
                        <input
                          type="number"
                          step="0.01"
                          value={paiseToRupeeString(item.unitPricePaise)}
                          onChange={(e) => updateCartItemRate(idx, e.target.value)}
                          className="w-24 px-2 py-1 text-right font-mono border border-slate-300 rounded focus:border-slate-800 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-700">
                        ₹ {paiseToRupeeString(lineTaxable)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600 text-[11px]">
                        ₹ {paiseToRupeeString(lineTax.taxPaise)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        ₹ {paiseToRupeeString(lineTotal)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeCartItem(idx)}
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

        {/* Invoice Summary & Payment Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          {/* Payment & Notes */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-800 uppercase tracking-wide block mb-1">
                Payment Collection
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentOption('full')}
                  className={`flex-1 py-1.5 px-2 rounded-md font-medium border ${
                    paymentOption === 'full'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Paid in Full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('later')}
                  className={`flex-1 py-1.5 px-2 rounded-md font-medium border ${
                    paymentOption === 'later'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Pay Later / Credit
                </button>
              </div>
            </div>

            {paymentOption === 'full' && (
              <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Ref / UTR No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI Ref"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-800 uppercase tracking-wide block mb-1">
                Notes / Terms
              </label>
              <input
                type="text"
                placeholder="Optional notes printed on invoice..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              />
            </div>
          </div>

          {/* Mathematical Tax Calculation Breakdown */}
          <div className="space-y-1.5 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="flex justify-between text-slate-600">
              <span>Taxable Value:</span>
              <span className="font-mono">₹ {paiseToRupeeString(totalTaxablePaise)}</span>
            </div>
            {isInter ? (
              <div className="flex justify-between text-slate-600">
                <span>Integrated GST (IGST):</span>
                <span className="font-mono">₹ {paiseToRupeeString(totalIgstPaise)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Central GST (CGST):</span>
                  <span className="font-mono">₹ {paiseToRupeeString(totalCgstPaise)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>State GST (SGST):</span>
                  <span className="font-mono">₹ {paiseToRupeeString(totalSgstPaise)}</span>
                </div>
              </>
            )}
            {roundOffPaise !== 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Round Off:</span>
                <span className="font-mono">
                  {roundOffPaise > 0
                    ? `+₹ ${paiseToRupeeString(roundOffPaise)}`
                    : `₹ ${paiseToRupeeString(roundOffPaise)}`}
                </span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-sm text-slate-900">
              <span>Grand Total:</span>
              <span className="font-mono text-base">₹ {paiseToRupeeString(roundedTotalPaise)}</span>
            </div>
            <div className="text-[10px] text-slate-500 italic pt-0.5">
              {amountInWords(roundedTotalPaise)}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleFinalize}
            disabled={submitting || cart.length === 0}
          >
            {submitting ? 'Allocating FIFO Stock & Saving...' : 'Finalize & Issue Invoice'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
