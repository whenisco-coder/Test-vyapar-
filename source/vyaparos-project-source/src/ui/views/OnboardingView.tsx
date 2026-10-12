import React, { useState } from 'react';
import { Button } from '../components/Button.tsx';
import { Input } from '../components/Input.tsx';
import { Card } from '../components/Card.tsx';
import { validateGSTIN, STATE_CODES } from '../../domain/gst.ts';
import { getStateCodeFromPincode } from '../../domain/seed/pincodes.ts';
import { ShieldCheck, CheckCircle2, AlertCircle, Sparkles, Building2 } from 'lucide-react';

interface OnboardingViewProps {
  onComplete: (data: {
    businessName: string;
    tradeName?: string;
    gstin?: string;
    stateCode: string;
    addressLine1?: string;
    city?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    invoicePrefix?: string;
    loadStarterPack: boolean;
  }) => Promise<void>;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState('');
  const [stateCode, setStateCode] = useState('27'); // Default Maharashtra
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [loadStarterPack, setLoadStarterPack] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().trim();
    setGstin(val);
    if (!val) {
      setGstinError('');
      return;
    }
    if (val.length === 15) {
      const res = validateGSTIN(val);
      if (!res.valid) {
        setGstinError(res.error || 'Invalid GSTIN');
      } else {
        setGstinError('');
        if (res.stateCode) {
          setStateCode(res.stateCode);
        }
      }
    } else {
      setGstinError('GSTIN must be 15 characters');
    }
  };

  const handlePincodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setPincode(val);
    if (val.length >= 2 && !gstin) {
      const derivedState = getStateCodeFromPincode(val);
      if (derivedState) {
        setStateCode(derivedState);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (gstin && gstinError) {
      setError('Please provide a valid 15-character GSTIN or leave blank for unregistered');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onComplete({
        businessName: businessName.trim(),
        tradeName: tradeName.trim() || undefined,
        gstin: gstin.trim() || undefined,
        stateCode,
        addressLine1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        pincode: pincode.trim() || undefined,
        phone: phone.trim() || undefined,
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'INV',
        loadStarterPack,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 py-8 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-2xl shadow-md">
            B
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Welcome to Business OS</h2>
          <p className="text-sm text-slate-400">
            Offline-first GST Billing & Inventory. Data stays strictly on your device.
          </p>
        </div>

        <Card className="shadow-xl border-slate-700 bg-white">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <Input
                label="Legal Business Name *"
                placeholder="e.g. Apex Auto & Tyre Services"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Trade Name (Optional)"
                placeholder="e.g. Apex Tyres"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
              />
              <Input
                label="Phone Number"
                placeholder="e.g. 9822012345"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Input
                  label="GSTIN (15 Digits)"
                  placeholder="27AAPFU0939F1ZV"
                  value={gstin}
                  onChange={handleGstinChange}
                  error={gstinError}
                  hint={gstin && !gstinError ? 'Valid GSTIN verified' : 'Leave empty if unregistered'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1">
                  Home State (Place of Supply) *
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[44px]"
                >
                  {(Object.entries(STATE_CODES) as [string, string][]).map(([code, name]) => (
                    <option key={code} value={code}>
                      {code} - {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Input
                label="Address Line 1"
                placeholder="Shop No. 4, Station Road"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="City"
                placeholder="e.g. Pune"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <Input
                label="PIN Code (6 digits)"
                placeholder="e.g. 411018"
                value={pincode}
                onChange={handlePincodeChange}
                maxLength={6}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <Input
                label="Invoice Series Prefix"
                placeholder="INV"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                maxLength={5}
                hint="Numbers will look like: INV/2627/0001"
              />

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 select-none">
                  <input
                    type="checkbox"
                    checked={loadStarterPack}
                    onChange={(e) => setLoadStarterPack(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Install Tyre & Auto Spares starter pack</span>
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-indigo-50/70 border border-indigo-100 p-3 flex items-start gap-2.5 text-xs text-indigo-900">
              <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Persistent Offline Storage:</strong> We will request persistent storage in your browser so your invoices and stock data are never erased by the operating system.
              </span>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                {loading ? 'Initializing Database...' : 'Complete Setup & Launch Business OS'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
