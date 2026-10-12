import React, { useState, useEffect } from 'react';
import {
  Product,
  ProductStockInfo,
  BusinessSettings,
  StockMovement,
  STANDARD_UNITS,
  AUTO_CATEGORIES,
  Artisan,
  ProductKind,
} from '../../domain/types';
import { getAppService } from '../../domain/services';
import { PRODUCT_CATEGORIES } from '../../domain/data/categories';
import { paiseToRupeeString } from '../../domain/money';
import { generateUUIDv7 } from '../../domain/uuid';
import { Button } from '../components/Button';
import { Card, Badge } from '../components/Card';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  History,
  Edit2,
  TrendingUp,
  Tag,
  Boxes,
} from 'lucide-react';

interface ProductsViewProps {
  business: BusinessSettings;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ business }) => {
  const service = getAppService();
  const [stockInfos, setStockInfos] = useState<ProductStockInfo[]>([]);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingStockInfo, setAdjustingStockInfo] = useState<ProductStockInfo | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Add / Edit Product Form State
  const [pName, setPName] = useState('');
  const [pSku, setPSku] = useState('');
  const [pHsn, setPHsn] = useState('');
  const [pCategory, setPCategory] = useState<string>(AUTO_CATEGORIES[0]);
  const [pUnit, setPUnit] = useState('NOS');
  const [pGstBp, setPGstBp] = useState(1800);
  const [pSellingPrice, setPSellingPrice] = useState('');
  const [pMrp, setPMrp] = useState('');
  const [pMinAlert, setPMinAlert] = useState('5');
  const [pOpeningQty, setPOpeningQty] = useState('');
  const [pOpeningCost, setPOpeningCost] = useState('');
  const [pProductKind, setPProductKind] = useState<ProductKind>('standard');
  const [pArtisanId, setPArtisanId] = useState('');
  const [pUniquePieceCode, setPUniquePieceCode] = useState('');
  const [pParentProductId, setPParentProductId] = useState('');
  const [pVariantAttributes, setPVariantAttributes] = useState('{"colour": "indigo", "size": "free"}');

  // Stock Adjustment Form State
  const [adjQty, setAdjQty] = useState('1');
  const [adjReason, setAdjReason] = useState<'opening' | 'adjustment' | 'purchase'>('adjustment');
  const [adjCost, setAdjCost] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const [list, artisanList] = await Promise.all([
        service.stock.getAllProductsStockInfo(),
        service.artisans.getAll(),
      ]);
      setStockInfos(list);
      setArtisans(artisanList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setPName('');
    setPSku('');
    setPHsn('');
    setPCategory(AUTO_CATEGORIES[0]);
    setPUnit('NOS');
    setPGstBp(1800);
    setPSellingPrice('');
    setPMrp('');
    setPMinAlert('5');
    setPOpeningQty('');
    setPOpeningCost('');
    setPProductKind('standard');
    setPArtisanId('');
    setPUniquePieceCode('');
    setPParentProductId('');
    setPVariantAttributes('{"colour": "indigo", "size": "free"}');
    setFormError('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setPName(p.name);
    setPSku(p.sku || '');
    setPHsn(p.hsn || '');
    setPCategory(p.category || AUTO_CATEGORIES[0]);
    setPUnit(p.unit || 'NOS');
    setPGstBp(p.gst_rate_bp);
    setPSellingPrice(paiseToRupeeString(p.selling_price_paise));
    setPMrp(paiseToRupeeString(p.mrp_paise));
    setPMinAlert(String(p.min_stock_alert ?? 5));
    setPProductKind(p.product_kind ?? 'standard');
    setPArtisanId(p.artisan_id ?? '');
    setPUniquePieceCode(p.unique_piece_code ?? '');
    setPParentProductId(p.parent_product_id ?? '');
    setPVariantAttributes(p.variant_attributes_json ?? '{"colour": "indigo", "size": "free"}');
    setFormError('');
  };

  const handleOpenHistory = async (p: Product) => {
    setHistoryProduct(p);
    const movs = await service.stock.getMovementsByProduct(p.id);
    setMovements(movs);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) {
      setFormError('Product name is required');
      return;
    }
    if (pProductKind === 'unique_piece' && !pUniquePieceCode.trim()) {
      setFormError('Unique pieces need a unique piece code.');
      return;
    }
    if (pProductKind === 'variant' && !pParentProductId) {
      setFormError('Choose the variant family this item belongs to.');
      return;
    }
    let variantJson: string | null = null;
    if (pProductKind === 'variant') {
      try {
        const parsed = JSON.parse(pVariantAttributes);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object');
        variantJson = JSON.stringify(parsed);
      } catch {
        setFormError('Variant attributes must be valid JSON, for example {"colour":"indigo","size":"free"}.');
        return;
      }
    }

    try {
      setSaving(true);
      setFormError('');

      const sellingPaise = Math.round((parseFloat(pSellingPrice) || 0) * 100);
      const mrpPaise = Math.round((parseFloat(pMrp) || 0) * 100);
      const minAlertNum = parseInt(pMinAlert) || 5;
      const openQty = pOpeningQty.trim() ? Number(pOpeningQty) : 0;
      const openingCostPaise = Math.round((Number(pOpeningCost) || 0) * 100);
      if (!editingProduct && pOpeningQty.trim() && (!Number.isSafeInteger(openQty) || openQty < 0)) {
        setFormError('Opening stock quantity must be a non-negative whole number.');
        return;
      }
      if (!editingProduct && openQty > 0 && (!Number.isSafeInteger(openingCostPaise) || openingCostPaise < 0)) {
        setFormError('Opening stock cost must be a valid non-negative amount.');
        return;
      }

      const now = new Date().toISOString();

      if (editingProduct) {
        const updated: Product = {
          ...editingProduct,
          name: pName.trim(),
          sku: pSku.trim() || undefined,
          hsn: pHsn.trim() || '',
          category: pCategory,
          unit: pUnit,
          gst_rate_bp: pGstBp,
          selling_price_paise: sellingPaise,
          mrp_paise: mrpPaise || sellingPaise,
          min_stock_alert: minAlertNum,
          updated_at: now,
          product_kind: pProductKind,
          parent_product_id: pProductKind === 'variant' ? pParentProductId : null,
          variant_attributes_json: variantJson,
          artisan_id: pArtisanId || null,
          unique_piece_code: pProductKind === 'unique_piece' ? pUniquePieceCode.trim() : null,
        };
        await service.products.save(updated);
        setEditingProduct(null);
      } else {
        const prodId = generateUUIDv7();
        const newProd: Product = {
          id: prodId,
          name: pName.trim(),
          sku: pSku.trim() || undefined,
          hsn: pHsn.trim() || '',
          category: pCategory,
          unit: pUnit,
          gst_rate_bp: pGstBp,
          selling_price_paise: sellingPaise,
          mrp_paise: mrpPaise || sellingPaise,
          price_includes_tax: 0,
          active: 1,
          min_stock_alert: minAlertNum,
          product_kind: pProductKind,
          parent_product_id: pProductKind === 'variant' ? pParentProductId : null,
          variant_attributes_json: variantJson,
          artisan_id: pArtisanId || null,
          unique_piece_code: pProductKind === 'unique_piece' ? pUniquePieceCode.trim() : null,
          device_id: business.device_id,
          user_id: 'owner',
          created_at: now,
          updated_at: now,
        };
        // Product, opening batch, ledger movement, and change records commit atomically.
        await service.products.save(
          newProd,
          openQty > 0 ? { quantity: openQty, unitCostPaise: openingCostPaise } : undefined,
        );

        setIsAddOpen(false);
      }

      await loadProducts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingStockInfo) return;

    try {
      setSaving(true);
      const qtyNum = parseFloat(adjQty) || 0;
      const costPaise = Math.round((parseFloat(adjCost) || 0) * 100);

      if (qtyNum > 0) {
        await service.addOpeningStock({
          productId: adjustingStockInfo.product.id,
          quantity: qtyNum,
          unitCostPaise: costPaise,
        });
      }

      setAdjustingStockInfo(null);
      await loadProducts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = stockInfos.filter((info) => {
    const matchesSearch =
      !search.trim() ||
      info.product.name.toLowerCase().includes(search.toLowerCase()) ||
      (info.product.sku && info.product.sku.toLowerCase().includes(search.toLowerCase())) ||
      (info.product.hsn && info.product.hsn.includes(search));

    const matchesCat =
      selectedCategory === 'all' || info.product.category === selectedCategory;

    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Products & Stock</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time stock derived from immutable movements ledger.
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
          Add Product
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Products
          </div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
            {stockInfos.length}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Low Stock Alerts
          </div>
          <div className="text-lg font-bold font-mono text-amber-600 mt-1">
            {
              stockInfos.filter(
                (s) =>
                  s.quantityOnHand > 0 &&
                  s.quantityOnHand <= (s.product.min_stock_alert ?? 5)
              ).length
            }
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Out of Stock
          </div>
          <div className="text-lg font-bold font-mono text-rose-600 mt-1">
            {stockInfos.filter((s) => s.quantityOnHand <= 0).length}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Valuation Method
          </div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1">
            {business.stock_method}
          </div>
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Tyre Size, Brand, SKU, HSN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[38px]"
          />
        </div>

        <div className="w-full md:w-auto flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 min-h-[36px]"
          >
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading catalog...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <Package className="h-8 w-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">No products found</p>
            <p className="text-slate-400">
              {search ? 'Try modifying your search or category filter' : 'Add your first product to build inventory.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Product Name</th>
                  <th className="py-3 px-2">Category</th>
                  <th className="py-3 px-2">HSN</th>
                  <th className="py-3 px-2">GST Rate</th>
                  <th className="py-3 px-2 text-right">Selling Price</th>
                  <th className="py-3 px-3 text-center">Stock on Hand</th>
                  <th className="py-3 px-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((info) => {
                  const p = info.product;
                  const qty = info.quantityOnHand;
                  const minAlert = p.min_stock_alert ?? 5;
                  const isOut = qty <= 0;
                  const isLow = qty > 0 && qty <= minAlert;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                        {p.product_kind === 'unique_piece' && p.unique_piece_code && <div className="text-[10px] text-indigo-700 font-mono">Piece: {p.unique_piece_code}</div>}
                        {p.product_kind === 'variant' && p.variant_attributes_json && <div className="text-[10px] text-slate-500">Variant: {p.variant_attributes_json}</div>}
                        {p.product_kind === 'variant_parent' && <div className="text-[10px] text-amber-700">Variant family</div>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{p.category || '-'}</td>
                      <td className="py-2.5 px-2 font-mono text-slate-600">{p.hsn || '-'}</td>
                      <td className="py-2.5 px-2 font-mono text-slate-700 font-medium">
                        {p.gst_rate_bp / 100}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                        ₹ {paiseToRupeeString(p.selling_price_paise)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded text-xs ${
                            isOut
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isLow
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {qty} {p.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustingStockInfo(info);
                              setAdjQty('1');
                              setAdjCost(paiseToRupeeString(p.selling_price_paise));
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="Add / Inward Stock"
                          >
                            <Boxes className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenHistory(p)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="Movement History Ledger"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="Edit Product"
                          >
                            <Edit2 className="h-4 w-4" />
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

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isAddOpen || !!editingProduct}
        onClose={() => {
          setIsAddOpen(false);
          setEditingProduct(null);
        }}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Input
              label="Product Name / Tyre Spec *"
              placeholder="e.g. Apollo Amazer 4G Life 165/80 R14"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Product type</label>
              <select value={pProductKind} onChange={(e) => setPProductKind(e.target.value as ProductKind)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[44px]">
                <option value="standard">Standard item</option>
                <option value="variant_parent">Variant family / parent</option>
                <option value="variant">Variant item (colour / size)</option>
                <option value="unique_piece">Unique one-of-one piece</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Artisan (optional)</label>
              <select value={pArtisanId} onChange={(e) => setPArtisanId(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[44px]">
                <option value="">Not assigned</option>
                {artisans.map((artisan) => <option key={artisan.id} value={artisan.id}>{artisan.name}{artisan.craft ? ` — ${artisan.craft}` : ''}</option>)}
              </select>
            </div>
          </div>

          {pProductKind === 'unique_piece' && <Input label="Unique piece code *" value={pUniquePieceCode} onChange={(e) => setPUniquePieceCode(e.target.value)} maxLength={80} placeholder="e.g. AJR-UNQ-0001" required />}

          {pProductKind === 'variant' && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Variant family *</label>
              <select value={pParentProductId} onChange={(e) => setPParentProductId(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[44px]" required>
                <option value="">Choose parent family</option>
                {stockInfos.filter((info) => info.product.product_kind === 'variant_parent' && info.product.id !== editingProduct?.id).map((info) => <option key={info.product.id} value={info.product.id}>{info.product.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Variant attributes (JSON)</label>
              <textarea value={pVariantAttributes} onChange={(e) => setPVariantAttributes(e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-800" placeholder={'{"colour":"indigo","size":"free"}'} />
              <p className="mt-1 text-[10px] text-slate-500">Use a JSON object for colour, size, material, or other attributes.</p>
            </div>
          </div>}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="SKU / Barcode"
              placeholder="e.g. AP-AMAZ-14"
              value={pSku}
              onChange={(e) => setPSku(e.target.value)}
            />
            <Input
              label="HSN Code"
              placeholder="e.g. 40111010"
              value={pHsn}
              onChange={(e) => setPHsn(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Category
              </label>
              <select
                value={pCategory}
                onChange={(e) => setPCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Unit of Measure
              </label>
              <select
                value={pUnit}
                onChange={(e) => setPUnit(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                {STANDARD_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                GST Rate
              </label>
              <select
                value={pGstBp}
                onChange={(e) => setPGstBp(parseInt(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                <option value={0}>0% (Exempt / Nil)</option>
                <option value={500}>5%</option>
                <option value={1200}>12%</option>
                <option value={1800}>18%</option>
                <option value={2800}>28%</option>
              </select>
            </div>

            <Input
              label="Min Stock Alert"
              type="number"
              value={pMinAlert}
              onChange={(e) => setPMinAlert(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Selling Price (₹) *"
              type="number"
              step="0.01"
              placeholder="3800.00"
              value={pSellingPrice}
              onChange={(e) => setPSellingPrice(e.target.value)}
              required
            />
            <Input
              label="MRP (₹)"
              type="number"
              step="0.01"
              placeholder="4200.00"
              value={pMrp}
              onChange={(e) => setPMrp(e.target.value)}
            />
          </div>

          {!editingProduct && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <span className="font-semibold text-slate-800 uppercase tracking-wide text-[10px] block">
                Initial Opening Stock (Optional)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Opening Quantity"
                  type="number"
                  placeholder="e.g. 10"
                  value={pOpeningQty}
                  onChange={(e) => setPOpeningQty(e.target.value)}
                />
                <Input
                  label="Cost Price per Unit (₹)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 3200.00"
                  value={pOpeningCost}
                  onChange={(e) => setPOpeningCost(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                setEditingProduct(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Inward / Adjustment Modal */}
      <Modal
        isOpen={!!adjustingStockInfo}
        onClose={() => setAdjustingStockInfo(null)}
        title={`Inward Stock: ${adjustingStockInfo?.product.name || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveStockAdjustment} className="space-y-4 text-xs">
          <p className="text-slate-500">
            Current stock on hand:{' '}
            <strong className="text-slate-800">
              {adjustingStockInfo?.quantityOnHand} {adjustingStockInfo?.product.unit}
            </strong>
          </p>

          <Input
            label="Quantity to Add *"
            type="number"
            min="1"
            value={adjQty}
            onChange={(e) => setAdjQty(e.target.value)}
            required
          />

          <Input
            label="Purchase Cost per Unit (₹) *"
            type="number"
            step="0.01"
            value={adjCost}
            onChange={(e) => setAdjCost(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdjustingStockInfo(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Adding Stock...' : 'Add Stock Batch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Movement Ledger History Modal */}
      <Modal
        isOpen={!!historyProduct}
        onClose={() => setHistoryProduct(null)}
        title={`Stock Movement History: ${historyProduct?.name || ''}`}
        maxWidth="2xl"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Immutable append-only ledger entries for this item:
          </p>
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-2">Reason</th>
                  <th className="py-2 px-2 text-right">Delta</th>
                  <th className="py-2 px-2 text-right">Cost (₹)</th>
                  <th className="py-2 px-3">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-slate-600">
                        {m.created_at.split('T')[0]}
                      </td>
                      <td className="py-2 px-2 font-semibold capitalize text-slate-800">
                        {m.reason}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold">
                        <span
                          className={m.qty_delta > 0 ? 'text-emerald-700' : 'text-rose-700'}
                        >
                          {m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600">
                        {m.cost_paise ? paiseToRupeeString(m.cost_paise) : '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{m.location}</td>
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
