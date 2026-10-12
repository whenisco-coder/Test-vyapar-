import React, { useState, useEffect } from 'react';
import {
  Party,
  CustomerDueInfo,
  CustomerLedgerEntry,
  BusinessSettings,
  PaymentMode,
} from '../../domain/types';
import { getAppService } from '../../domain/services';
import { paiseToRupeeString } from '../../domain/money';
import { validateGSTIN, STATE_CODES } from '../../domain/gst';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Badge } from '../components/Card';
import {
  Users,
  Plus,
  Search,
  CreditCard,
  FileText,
  Phone,
  Building,
  AlertCircle,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface PartiesViewProps {
  business: BusinessSettings;
}

export const PartiesView: React.FC<PartiesViewProps> = ({ business }) => {
  const service = getAppService();
  const [parties, setParties] = useState<Party[]>([]);
  const [duesInfoMap, setDuesInfoMap] = useState<Record<string, CustomerDueInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [statementParty, setStatementParty] = useState<Party | null>(null);
  const [statementEntries, setStatementEntries] = useState<CustomerLedgerEntry[]>([]);
  const [paymentParty, setPaymentParty] = useState<Party | null>(null);

  // Add / Edit Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'customer' | 'supplier' | 'both'>('customer');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState('');
  const [stateCode, setStateCode] = useState(business.state_code);
  const [addressLine, setAddressLine] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [partyNotes, setPartyNotes] = useState('');

  // Payment Form State
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadParties();
  }, []);

  const loadParties = async () => {
    try {
      setLoading(true);
      const list = await service.customers.getAll();
      setParties(list);

      // Load dues info for each customer
      const duesMap: Record<string, CustomerDueInfo> = {};
      for (const p of list) {
        try {
          const due = await service.payments.getCustomerDues(p.id);
          duesMap[p.id] = due;
        } catch {}
      }
      setDuesInfoMap(duesMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setName('');
    setType('customer');
    setMobile('');
    setEmail('');
    setGstin('');
    setGstinError('');
    setStateCode(business.state_code);
    setAddressLine('');
    setAddressLine2('');
    setCity('');
    setPincode('');
    setPartyNotes('');
    setFormError('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (p: Party) => {
    setEditingParty(p);
    setName(p.name);
    setType(p.type.toLowerCase() as any);
    setMobile(p.mobile || '');
    setEmail(p.email || '');
    setGstin(p.gstin || '');
    setGstinError('');
    setStateCode(p.state_code || business.state_code);
    setAddressLine(p.address_line1 || '');
    setAddressLine2(p.address_line2 || '');
    setCity(p.city || '');
    setPincode(p.pincode || '');
    setPartyNotes(p.notes || '');
    setFormError('');
  };

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setGstin(upper);
    if (!upper) {
      setGstinError('');
      return;
    }
    if (upper.length === 15) {
      const res = validateGSTIN(upper);
      if (!res.valid) {
        setGstinError(res.error || 'Invalid GSTIN');
      } else {
        setGstinError('');
        if (res.stateCode) {
          setStateCode(res.stateCode);
        }
      }
    } else {
      setGstinError('GSTIN must be exactly 15 characters');
    }
  };

  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Party name is required');
      return;
    }

    if (gstin && gstinError) {
      setFormError('Please resolve GSTIN format error or leave empty');
      return;
    }
    const normalizedMobile = mobile.replace(/[\s()+-]/g, '');
    if (normalizedMobile && !/^(?:91)?[6-9]\d{9}$/.test(normalizedMobile)) {
      setFormError('Enter a valid 10-digit Indian mobile number, optionally with country code 91.');
      return;
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      setFormError('PIN code must contain exactly 6 digits.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Enter a valid email address or leave it empty.');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      const now = new Date().toISOString();

      const partyData: Party = {
        id: editingParty ? editingParty.id : '',
        name: name.trim(),
        type,
        party_kind: gstin ? 'B2B' : 'B2C',
        mobile: normalizedMobile ? normalizedMobile.slice(-10) : undefined,
        email: email.trim() || undefined,
        gstin: gstin.trim() || undefined,
        address_line1: addressLine.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        pincode: pincode.trim() || undefined,
        notes: partyNotes.trim() || undefined,
        state_code: stateCode,
        device_id: business.device_id,
        user_id: 'owner',
        created_at: editingParty ? editingParty.created_at : now,
        updated_at: now,
      };

      await service.customers.save(partyData);
      setIsAddOpen(false);
      setEditingParty(null);
      await loadParties();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save party');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenStatement = async (p: Party) => {
    setStatementParty(p);
    const ledger = await service.payments.getCustomerLedger(p.id);
    setStatementEntries(ledger);
  };

  const handleOpenPayment = (p: Party) => {
    setPaymentParty(p);
    const due = duesInfoMap[p.id]?.totalDuePaise || 0;
    setPayAmount(due > 0 ? paiseToRupeeString(due) : '');
    setPayMode('CASH');
    setPayRef('');
    setPayNotes('');
    setFormError('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentParty) return;

    const amtNum = parseFloat(payAmount) || 0;
    if (amtNum <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      const paise = Math.round(amtNum * 100);

      await service.recordPayment({
        customerId: paymentParty.id,
        amountPaise: paise,
        mode: payMode.toLowerCase() as any,
        reference: payRef.trim() || undefined,
        notes: payNotes.trim() || undefined,
      });

      setPaymentParty(null);
      await loadParties();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const filteredParties = parties.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.mobile && p.mobile.includes(search)) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase()));

    const pType = p.type.toLowerCase();
    const matchesType =
      typeFilter === 'all' ||
      pType === typeFilter ||
      pType === 'both';

    return matchesSearch && matchesType;
  });

  const totalOutstandingPaise = Object.values(duesInfoMap).reduce(
    (acc, d) => acc + (d.totalDuePaise > 0 ? d.totalDuePaise : 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Parties & Ledgers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer and supplier balances, GSTIN validation, and running payment ledgers.
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
          Add Party
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Outstanding Dues
          </div>
          <div className="text-lg font-bold font-mono text-rose-700 mt-1">
            ₹ {paiseToRupeeString(totalOutstandingPaise)}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Customers & Suppliers
          </div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
            {parties.length}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            GST Registered (B2B)
          </div>
          <div className="text-lg font-bold font-mono text-indigo-700 mt-1">
            {parties.filter((p) => !!p.gstin).length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by party name, mobile, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['all', 'customer', 'supplier'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setTypeFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors min-h-[36px] ${
                typeFilter === filter
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter === 'all' ? 'All Parties' : `${filter}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Parties Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading party ledger...</div>
        ) : filteredParties.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <Users className="h-8 w-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">No parties found</p>
            <p className="text-slate-400">Add customers or suppliers to track invoices and ledger dues.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Party Name</th>
                  <th className="py-3 px-2">Type</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">GSTIN</th>
                  <th className="py-3 px-3 text-right">Total Invoiced</th>
                  <th className="py-3 px-3 text-right">Total Paid</th>
                  <th className="py-3 px-3.5 text-right font-bold">Outstanding Due (₹)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParties.map((p) => {
                  const dueInfo = duesInfoMap[p.id];
                  const totalInvoiced = dueInfo?.totalInvoicedPaise || 0;
                  const totalPaid = dueInfo?.totalPaidPaise || 0;
                  const netDue = dueInfo?.totalDuePaise || 0;
                  const hasDue = netDue > 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        {p.city && <div className="text-[10px] text-slate-400">{p.city}</div>}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 capitalize">
                          {p.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {p.mobile || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                        {p.gstin || 'Unregistered'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ₹ {paiseToRupeeString(totalInvoiced)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        ₹ {paiseToRupeeString(totalPaid)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                        <span className={hasDue ? 'text-rose-700' : 'text-slate-700'}>
                          ₹ {paiseToRupeeString(netDue)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(p)}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                            title="Collect Payment"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenStatement(p)}
                            className="p-1.5 text-sky-700 hover:bg-sky-50 rounded"
                            title="View Running Ledger Statement"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                            title="Edit Details"
                          >
                            <Building className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Party Modal */}
      <Modal
        isOpen={isAddOpen || !!editingParty}
        onClose={() => {
          setIsAddOpen(false);
          setEditingParty(null);
        }}
        title={editingParty ? 'Edit Party' : 'Add Customer / Supplier'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveParty} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Input
              label="Party / Business Name *"
              placeholder="e.g. Modern Tyre Service or Ramesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Party Role
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                <option value="customer">Customer (Buyer)</option>
                <option value="supplier">Supplier (Vendor)</option>
                <option value="both">Both</option>
              </select>
            </div>

            <Input
              label="Mobile Number"
              placeholder="9822012345"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>

          <Input
            label="Email (optional)"
            placeholder="accounts@example.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputType="email"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="GSTIN (15 Digits)"
                placeholder="27AAPFU0939F1ZV"
                value={gstin}
                onChange={(e) => handleGstinChange(e.target.value)}
                error={gstinError}
                maxLength={15}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                State (Place of Supply)
              </label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                {(Object.entries(STATE_CODES) as [string, string][]).map(([code, sName]) => (
                  <option key={code} value={code}>
                    {code} - {sName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Address"
            placeholder="Shop / House Address"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
          />

          <Input
            label="Address line 2 (optional)"
            placeholder="Area, landmark, building"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City"
              placeholder="e.g. Pune"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              label="PIN Code"
              placeholder="411018"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              maxLength={6}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Notes (optional)
            </label>
            <textarea
              value={partyNotes}
              onChange={(e) => setPartyNotes(e.target.value)}
              placeholder="Delivery instructions, preferred contact time, etc."
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                setEditingParty(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Party'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal
        isOpen={!!paymentParty}
        onClose={() => setPaymentParty(null)}
        title={`Record Payment: ${paymentParty?.name || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500">Current Outstanding Due:</span>
            <div className="text-base font-bold font-mono text-rose-700 mt-0.5">
              ₹ {paiseToRupeeString(duesInfoMap[paymentParty?.id || '']?.totalDuePaise || 0)}
            </div>
          </div>

          <Input
            label="Amount Received (₹) *"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Payment Mode
              </label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <Input
              label="Ref / UTR / Cheque No."
              placeholder="Optional reference"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />
          </div>

          <Input
            label="Notes / Remarks"
            placeholder="e.g. Settled bill INV/2627/0001"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentParty(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Recording Payment...' : 'Record Payment in Ledger'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Party Running Ledger Statement Modal */}
      <Modal
        isOpen={!!statementParty}
        onClose={() => setStatementParty(null)}
        title={`Ledger Statement: ${statementParty?.name || ''}`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                Party Details
              </span>
              <span className="font-bold text-slate-900">{statementParty?.name}</span>
              {statementParty?.mobile && (
                <span className="text-slate-500 ml-2">Mob: {statementParty.mobile}</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                Net Outstanding
              </span>
              <span className="text-base font-bold font-mono text-rose-700">
                ₹{' '}
                {paiseToRupeeString(
                  duesInfoMap[statementParty?.id || '']?.totalDuePaise || 0
                )}
              </span>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-2">Type</th>
                  <th className="py-2.5 px-2">Ref / Inv No</th>
                  <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                  <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                  <th className="py-2.5 px-3.5 text-right font-bold">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No transactions recorded for this party.
                    </td>
                  </tr>
                ) : (
                  statementEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-slate-600">{e.date}</td>
                      <td className="py-2 px-2">
                        {e.type === 'INVOICE' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-800">
                            <ArrowUpRight className="h-3 w-3 text-slate-500" /> SALE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <ArrowDownLeft className="h-3 w-3 text-emerald-600" /> PAID
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700 font-medium">
                        {e.refNumber}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900">
                        {e.debitPaise > 0 ? `₹ ${paiseToRupeeString(e.debitPaise)}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700">
                        {e.creditPaise > 0 ? `₹ ${paiseToRupeeString(e.creditPaise)}` : '-'}
                      </td>
                      <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-950">
                        ₹ {paiseToRupeeString(e.runningBalancePaise)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
};
