import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { A5InvoicePrint } from './A5InvoicePrint';
import { Invoice, BusinessSettings } from '../../domain/types';
import { downloadInvoicePdf } from '../../domain/pdf';
import { paiseToRupeeString } from '../../domain/money';
import { Printer, Download, Share2, Ban, AlertTriangle, Check } from 'lucide-react';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  business: BusinessSettings | null;
  onCancelInvoice: (invoiceId: string, reason: string) => Promise<void>;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
  business,
  onCancelInvoice,
}) => {
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!invoice || !business) return null;

  const isCancelled = invoice.status === 'cancelled' || invoice.status === 'CANCELLED';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    downloadInvoicePdf(invoice, business);
  };

  const handleShareSummary = () => {
    let customer: any = {};
    try {
      customer = JSON.parse(invoice.customer_snapshot_json || '{}');
    } catch {}

    const text = `Invoice: ${invoice.invoice_number || invoice.number}
Date: ${invoice.invoice_date || invoice.date}
Customer: ${customer.name || 'Counter Customer'}
Amount: ₹ ${paiseToRupeeString(invoice.grand_total_paise)}
From: ${business.business_name}
Thank you for your business!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const submitCancel = async () => {
    if (!cancelReason.trim()) return;
    try {
      setIsSubmittingCancel(true);
      await onCancelInvoice(invoice.id, cancelReason.trim());
      setCancelling(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Invoice ${invoice.invoice_number || invoice.number}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 no-print">
          <div className="flex items-center gap-2">
            {isCancelled ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                <Ban className="h-3.5 w-3.5" /> CANCELLED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                FINALIZED
              </span>
            )}
            <span className="text-xs text-slate-500 font-mono">
              Total: ₹ {paiseToRupeeString(invoice.grand_total_paise)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              onClick={handleShareSummary}
            >
              {copied ? 'Copied' : 'Share'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={handleDownloadPdf}
            >
              Vector PDF
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
            >
              Print A5
            </Button>
            {!isCancelled && !cancelling && (
              <Button
                variant="danger"
                size="sm"
                icon={<Ban className="h-4 w-4" />}
                onClick={() => setCancelling(true)}
              >
                Cancel Invoice
              </Button>
            )}
          </div>
        </div>

        {/* Cancel Confirmation Prompt */}
        {cancelling && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-3 no-print">
            <div className="flex items-start gap-2.5 text-rose-900 text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Are you sure you want to cancel this invoice?</p>
                <p className="text-slate-600 mt-0.5">
                  The invoice sequence number ({invoice.invoice_number || invoice.number}) will be retained as per GST rules, but all stock movements will be immediately reversed back to inventory.
                </p>
              </div>
            </div>
            <div>
              <input
                type="text"
                placeholder="Reason for cancellation (e.g., Customer return, data entry error)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-md border border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelling(false)}
                disabled={isSubmittingCancel}
              >
                Back
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={submitCancel}
                disabled={!cancelReason.trim() || isSubmittingCancel}
              >
                {isSubmittingCancel ? 'Cancelling & Reversing Stock...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        )}

        {/* Invoice Preview */}
        <div className="overflow-x-auto p-2 bg-slate-100 rounded-lg border border-slate-200 flex justify-center">
          <A5InvoicePrint invoice={invoice} business={business} />
        </div>
      </div>
    </Modal>
  );
};
