# Design System Specification

## 1. Principles
- **Dense & High-Utility**: Optimized for fast shopfloor operations on mobile phones and desktop checkout counters.
- **Indian Locale First**: Clear Lakh/Crore formatted amounts (`₹ 1,25,000.00`), prominent GST tax breakdowns, quick HSN entry.
- **Strict Anti-AI Slop**: No generic marketing cards, no excessive padding, high-contrast crisp text, tactile inputs.
- **Touch-First Accessibility**: Min 44px tap targets on mobile, high contrast, clean typography.

## 2. Color Palette
- **Primary / Brand**: Slate 900 (`#0f172a`) with Deep Sky 600 (`#0284c7`) accents for active states and actions.
- **Surface & Backgrounds**:
  - App Background: Slate 50 (`#f8fafc`)
  - Card & Container Surface: White (`#ffffff`)
  - Border Subdued: Slate 200 (`#e2e8f0`)
  - Border Focus: Sky 500 (`#0ea5e9`)
- **Semantic Feedback**:
  - Success / Paid / In-Stock: Emerald 700 (`#047857`) / Emerald 50 (`#ecfdf5`)
  - Warning / Partial Due: Amber 700 (`#b45309`) / Amber 50 (`#fffbeb`)
  - Destructive / Overdue / Cancelled: Rose 700 (`#be123c`) / Rose 50 (`#fff1f2`)
  - Info / Draft: Slate 600 (`#475569`) / Slate 100 (`#f1f5f9`)

## 3. Type Scale
- Base Font: Inter / System UI sans-serif. Monospace font for Numbers, Amounts, Invoice Codes, GSTIN.
- Headings:
  - H1: 20px (1.25rem), font-semibold, tracking-tight
  - H2: 16px (1.0rem), font-semibold
  - Body: 14px (0.875rem), font-normal
  - Small / Caption: 12px (0.75rem), font-medium
  - Monospace Numbers: 14px tabular-nums

## 4. Spacing & Layout
- Grid: 4px base increments (`gap-2`, `gap-3`, `gap-4`).
- Density: Mobile lists use 48px row heights; tables use compact padding (`py-2 px-3`).
- Navigation:
  - Mobile (< 768px): Fixed bottom navigation bar with 5 primary sections: Sale, Stock, Ledger, Dues, More.
  - Desktop (>= 768px): Left sidebar (220px width) with quick access to all modules and system diagnostics.

## 5. The 6 Core Components
1. **Button**:
   - `Primary`: Solid Sky 600 / Slate 900, white text, active:scale-[0.98].
   - `Secondary`: Slate 100 with Slate 700 text, slate-200 border.
   - `Danger`: Rose 600, white text.
2. **Input / Form Field**:
   - Explicit label above or inside floating, bordered with Slate 300, focus:ring-2 focus:ring-sky-500, tabular-nums for numeric fields.
3. **List / Table**:
   - Sticky header, alternating subtle rows, right-aligned monetary values, zero-state message.
4. **Card**:
   - Clean white background, single 1px Slate 200 border, no heavy drop shadows (`shadow-sm`).
5. **Modal / Bottom Sheet**:
   - Mobile: Slides up from bottom with swipe dismiss or close header. Desktop: Centered dialog with backdrop blur.
6. **Tab Bar**:
   - Compact tabs with icons and badge indicators for pending/overdue records.

## 6. Invoice Template (Tally-Style A5)
- Dimensions: 148mm x 210mm (A5 portrait).
- Header: Seller Name, GSTIN, Address, Contact, Invoice Title ("TAX INVOICE" or "BILL OF SUPPLY").
- Metadata Grid: Invoice No, Date, FY, State Code, Place of Supply, Buyer Name, Buyer GSTIN, Buyer Address.
- Items Table: S.No, Description of Goods, HSN/SAC, Qty, Unit, Rate, Taxable Value, CGST, SGST (or IGST), Total.
- Summaries: HSN Summary block, Tax break-up, Round Off (paise), Total in Numbers, Total in Words (Rupees ... Only).
- Footer: Bank Details & UPI ID, Terms & Conditions, Authorized Signatory.
