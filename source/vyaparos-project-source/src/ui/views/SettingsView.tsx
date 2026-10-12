import React, { useState } from 'react';
import { BusinessSettings } from '../../domain/types';
import { getAppService } from '../../domain/services';
import { validateGSTIN, STATE_CODES } from '../../domain/gst';
import { generateCsvWithBom } from '../../domain/tally';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import {
  Building2,
  FileCode,
  Shield,
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Share2,
  Sparkles,
} from 'lucide-react';

interface SettingsViewProps {
  business: BusinessSettings;
  onBusinessUpdated: (updated: BusinessSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  business,
  onBusinessUpdated,
}) => {
  const service = getAppService();

  // Business Profile Form
  const [bName, setBName] = useState(business.business_name);
  const [tradeName, setTradeName] = useState(business.trade_name || '');
  const [gstin, setGstin] = useState(business.gstin || '');
  const [gstinError, setGstinError] = useState('');
  const [stateCode, setStateCode] = useState(business.state_code);
  const [phone, setPhone] = useState(business.phone || '');
  const [email, setEmail] = useState(business.email || '');
  const [addressLine1, setAddressLine1] = useState(business.address_line1 || '');
  const [city, setCity] = useState(business.city || '');
  const [pincode, setPincode] = useState(business.pincode || '');
  const [invoicePrefix, setInvoicePrefix] = useState(business.invoice_prefix || 'INV');
  const [allowNegativeStock, setAllowNegativeStock] = useState(business.allow_negative_stock === 1);
  const [stockMethod, setStockMethod] = useState(business.stock_method || 'FIFO');

  // Bank Info
  const [bankName, setBankName] = useState(business.bank_name || '');
  const [bankAccount, setBankAccount] = useState(business.bank_account_no || '');
  const [bankIfsc, setBankIfsc] = useState(business.bank_ifsc || '');
  const [upiId, setUpiId] = useState(business.upi_id || '');

  // Tally Prime Export
  const [tallyStartDate, setTallyStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [tallyEndDate, setTallyEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [salesLedger, setSalesLedger] = useState(business.tally_sales_ledger || 'Sales Account');
  const [cgstLedger, setCgstLedger] = useState(business.tally_cgst_ledger || 'Output CGST');
  const [sgstLedger, setSgstLedger] = useState(business.tally_sgst_ledger || 'Output SGST');
  const [igstLedger, setIgstLedger] = useState(business.tally_igst_ledger || 'Output IGST');
  const [roundOffLedger, setRoundOffLedger] = useState(business.tally_round_off_ledger || 'Round Off');
  const [exportingTally, setExportingTally] = useState(false);

  // Backup & Restore
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Status Feedback
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');

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
      setGstinError('GSTIN must be 15 characters');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim()) {
      setProfileError('Business name is required');
      return;
    }

    try {
      setProfileError('');
      setProfileMessage('');

      const updated: BusinessSettings = {
        ...business,
        business_name: bName.trim(),
        trade_name: tradeName.trim() || null,
        gstin: gstin.trim() || '',
        state_code: stateCode,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address_line1: addressLine1.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        invoice_prefix: invoicePrefix.trim().toUpperCase() || 'INV',
        allow_negative_stock: allowNegativeStock ? 1 : 0,
        stock_method: stockMethod as any,
        bank_name: bankName.trim() || null,
        bank_account_no: bankAccount.trim() || null,
        bank_ifsc: bankIfsc.trim().toUpperCase() || null,
        upi_id: upiId.trim() || null,
        tally_sales_ledger: salesLedger.trim(),
        tally_cgst_ledger: cgstLedger.trim(),
        tally_sgst_ledger: sgstLedger.trim(),
        tally_igst_ledger: igstLedger.trim(),
        tally_round_off_ledger: roundOffLedger.trim(),
        updated_at: new Date().toISOString(),
      };

      await service.settings.save(updated);
      onBusinessUpdated(updated);
      setProfileMessage('Business settings saved successfully');
      setTimeout(() => setProfileMessage(''), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to save settings');
    }
  };

  const handleExportTallyXml = async () => {
    try {
      setExportingTally(true);
      const xml = await service.exportTallyXml(tallyStartDate, tallyEndDate, {
        salesVoucherType: 'Sales',
        defaultSalesLedger: salesLedger,
        outputCgstLedger: cgstLedger,
        outputSgstLedger: sgstLedger,
        outputIgstLedger: igstLedger,
        roundOffLedger: roundOffLedger,
      });

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tally_Sales_${tallyStartDate}_to_${tallyEndDate}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export Tally XML: ${err.message}`);
    } finally {
      setExportingTally(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const invoices = await service.invoices.getByDateRange(tallyStartDate, tallyEndDate);
      const csv = generateCsvWithBom(invoices);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoices_Export_${tallyStartDate}_to_${tallyEndDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export CSV: ${err.message}`);
    }
  };

  const handleCreateEncryptedBackup = async () => {
    if (!backupPassphrase || backupPassphrase.length < 6) {
      setBackupError('Passphrase must be at least 6 characters');
      return;
    }

    try {
      setBackupLoading(true);
      setBackupError('');
      setBackupMessage('');

      const encryptedJson = await service.createEncryptedBackup(backupPassphrase);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `business-os-backup-${dateStr}.bosbak`;

      // Check if Web Share API is available with file sharing
      const file = new File([encryptedJson], filename, {
        type: 'application/json',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Business OS Encrypted Backup',
          text: `Encrypted database backup (${dateStr})`,
        });
      } else {
        // Fallback: Trigger standard download
        const blob = new Blob([encryptedJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      setBackupMessage('Encrypted backup created & downloaded successfully.');
      setBackupPassphrase('');
    } catch (err: any) {
      setBackupError(err.message || 'Failed to create encrypted backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreSafetyBackup = async () => {
    if (!confirm('Restore the latest automatic safety snapshot? Current records will be replaced with the snapshot contents.')) return;
    try {
      setRestoreLoading(true);
      setBackupError('');
      setBackupMessage('');
      await service.restoreLatestSafetyBackup();
      setBackupMessage('Safety snapshot restored. Refreshing data...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setBackupError(`Safety restore failed: ${err.message || 'No valid safety snapshot is available'}`);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) {
      setBackupError('Please select a .bosbak backup file');
      return;
    }
    if (!restorePassphrase) {
      setBackupError('Please enter the encryption passphrase');
      return;
    }

    if (
      !confirm(
        'Restoring a backup will replace current records. An automatic safety snapshot of existing data will be created first. Proceed?'
      )
    ) {
      return;
    }

    try {
      setRestoreLoading(true);
      setBackupError('');
      setBackupMessage('');

      const text = await restoreFile.text();
      await service.restoreFromEncryptedBackup(text, restorePassphrase);

      setBackupMessage('Backup restored successfully! Refreshing data...');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setBackupError(`Restore failed: ${err.message || 'Incorrect passphrase or corrupted file'}`);
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings & Integrations</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure business details, GSTIN, Tally Prime XML export, and encrypted backups.
        </p>
      </div>

      {/* Business Profile */}
      <Card
        title="Business Profile & GST"
        subtitle="Appears on Tax Invoices, cash memos, and Tally export."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          {profileMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{profileMessage}</span>
            </div>
          )}
          {profileError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Legal Business Name *"
              value={bName}
              onChange={(e) => setBName(e.target.value)}
              required
            />
            <Input
              label="Trade Name (Optional)"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="GSTIN (15 Digits)"
              value={gstin}
              onChange={(e) => handleGstinChange(e.target.value)}
              error={gstinError}
              maxLength={15}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Home State (Place of Supply)
              </label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[44px]"
              >
                {(Object.entries(STATE_CODES) as [string, string][]).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} - {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Input
            label="Address Line 1"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input
              label="PIN Code"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              maxLength={6}
            />
          </div>

          <div className="border-t border-slate-200 pt-3">
            <span className="font-semibold text-slate-800 uppercase tracking-wider text-[11px] block mb-2">
              Bank Details (Printed on A5 Tax Invoice)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Bank Name"
                placeholder="e.g. State Bank of India"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <Input
                label="Account Number"
                placeholder="e.g. 1234567890"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
              <Input
                label="IFSC Code"
                placeholder="e.g. SBIN0001234"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              />
              <Input
                label="UPI ID"
                placeholder="e.g. apex.tyres@upi"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <span className="font-semibold text-slate-800 uppercase tracking-wider text-[11px] block mb-2">
              Invoicing & Stock Policy
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <Input
                label="Invoice Prefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                maxLength={5}
                hint="e.g. INV/2627/0001"
              />

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={allowNegativeStock}
                    onChange={(e) => setAllowNegativeStock(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  <span>Allow sales with zero/negative stock</span>
                </label>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  When enabled, billing can proceed before purchase bills are entered.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary">
              Save Settings
            </Button>
          </div>
        </form>
      </Card>

      {/* Tally Prime XML Export */}
      <Card
        title="Tally Prime XML Export"
        subtitle="Export Sales Vouchers directly into Tally Prime via XML import."
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={tallyStartDate}
                onChange={(e) => setTallyStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                End Date
              </label>
              <input
                type="date"
                value={tallyEndDate}
                onChange={(e) => setTallyEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] block">
              Tally Ledger Name Mappings (Match Exactly in Tally)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                label="Sales Ledger"
                value={salesLedger}
                onChange={(e) => setSalesLedger(e.target.value)}
              />
              <Input
                label="CGST Output"
                value={cgstLedger}
                onChange={(e) => setCgstLedger(e.target.value)}
              />
              <Input
                label="SGST Output"
                value={sgstLedger}
                onChange={(e) => setSgstLedger(e.target.value)}
              />
              <Input
                label="IGST Output"
                value={igstLedger}
                onChange={(e) => setIgstLedger(e.target.value)}
              />
              <Input
                label="Round Off Ledger"
                value={roundOffLedger}
                onChange={(e) => setRoundOffLedger(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={handleExportTallyXml}
              disabled={exportingTally}
            >
              {exportingTally ? 'Generating Tally XML...' : 'Download Tally Prime XML'}
            </Button>
            <Button
              variant="outline"
              icon={<FileCode className="h-4 w-4" />}
              onClick={handleExportCsv}
            >
              Download Invoices CSV (with UTF-8 BOM)
            </Button>
          </div>
        </div>
      </Card>

      {/* Encrypted Backup & Restore */}
      <Card
        title="Encrypted Local Backup & Restore"
        subtitle="AES-GCM WebCrypto encryption. Fully offline data safety."
      >
        <div className="space-y-4 text-xs">
          {backupMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{backupMessage}</span>
            </div>
          )}
          {backupError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          {/* Export Backup */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <Shield className="h-4 w-4 text-indigo-600" />
              <span>Create Encrypted Backup</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Derives a 256-bit AES-GCM key from your passphrase using PBKDF2 (100,000 rounds).
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Encryption Passphrase"
                  type="password"
                  placeholder="Min 6 characters..."
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleCreateEncryptedBackup}
                disabled={backupLoading || !backupPassphrase}
              >
                {backupLoading ? 'Encrypting...' : 'Export Encrypted Backup'}
              </Button>
            </div>
          </div>

          {/* Restore latest automatic safety snapshot */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <div className="font-semibold text-slate-800">Recover from Automatic Safety Snapshot</div>
            <p className="text-slate-600 text-[11px]">Restores the newest verified raw SQLite snapshot saved before an encrypted restore. This replaces the current database.</p>
            <div className="flex justify-end">
              <Button variant="danger" onClick={handleRestoreSafetyBackup} disabled={restoreLoading}>
                {restoreLoading ? 'Restoring Snapshot...' : 'Restore Latest Safety Snapshot'}
              </Button>
            </div>
          </div>

          {/* Restore Backup */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-semibold">
              <Upload className="h-4 w-4 text-slate-700" />
              <span>Restore from Encrypted Backup</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Takes an automatic safety snapshot before restore. Verifies SHA-256 payload integrity.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 uppercase mb-1">
                  Select .bosbak File
                </label>
                <input
                  type="file"
                  accept=".bosbak,.json"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300"
                />
              </div>
              <Input
                label="Backup Passphrase"
                type="password"
                placeholder="Enter passphrase..."
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="danger"
                onClick={handleRestoreBackup}
                disabled={restoreLoading || !restoreFile || !restorePassphrase}
              >
                {restoreLoading ? 'Verifying & Restoring...' : 'Restore Database'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Storage Diagnostics */}
      <Card title="Storage Diagnostics & System Engine">
        <div className="text-xs space-y-2 text-slate-600">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Storage Engine:</span>
            <span className="font-semibold text-slate-900 font-mono">SQLite OPFS / WASM</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Device ID (UUIDv7):</span>
            <span className="font-mono text-slate-800">{business.device_id}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Application Mode:</span>
            <span className="font-semibold text-emerald-700">100% Offline-First PWA</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Privacy Standard:</span>
            <span className="text-slate-800">Zero telemetry, zero cloud trackers</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
