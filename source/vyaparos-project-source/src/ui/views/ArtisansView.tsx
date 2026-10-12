import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Artisan, BusinessSettings } from '../../domain/types';
import { getAppService } from '../../domain/services';
import { generateUUIDv7 } from '../../domain/uuid';
import { Button } from '../components/Button';
import { Card, Badge } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Handshake, Plus, Search, MapPin, Phone, Pencil, Trash2, Palette, Users } from 'lucide-react';

interface ArtisansViewProps {
  business: BusinessSettings;
}

type ArtisanForm = {
  name: string;
  village: string;
  craft: string;
  mobile: string;
  upi_or_bank_text: string;
  notes: string;
};

const EMPTY_FORM: ArtisanForm = {
  name: '', village: '', craft: '', mobile: '', upi_or_bank_text: '', notes: '',
};

export const ArtisansView: React.FC<ArtisansViewProps> = ({ business }) => {
  const service = getAppService();
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Artisan | null>(null);
  const [form, setForm] = useState<ArtisanForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setArtisans(await service.artisans.getAll());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load artisans');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return artisans;
    return artisans.filter((a) => [a.name, a.village, a.craft, a.mobile]
      .some((value) => value?.toLocaleLowerCase().includes(q)));
  }, [artisans, search]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setIsOpen(true);
  };

  const openEdit = (artisan: Artisan) => {
    setEditing(artisan);
    setForm({
      name: artisan.name,
      village: artisan.village ?? '',
      craft: artisan.craft ?? '',
      mobile: artisan.mobile ?? '',
      upi_or_bank_text: artisan.upi_or_bank_text ?? '',
      notes: artisan.notes ?? '',
    });
    setError('');
    setIsOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) { setError('Artisan name is required.'); return; }
    const mobile = form.mobile.trim();
    if (mobile && !/^[+\d()\-\s]{7,20}$/.test(mobile)) {
      setError('Enter a valid contact number, or leave it blank.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const artisan: Artisan = {
        id: editing?.id ?? generateUUIDv7(),
        name,
        village: form.village.trim() || null,
        craft: form.craft.trim() || null,
        mobile: mobile || null,
        upi_or_bank_text: form.upi_or_bank_text.trim() || null,
        notes: form.notes.trim() || null,
        photo_blob_key: editing?.photo_blob_key ?? null,
        device_id: editing?.device_id ?? business.device_id,
        user_id: editing?.user_id ?? 'owner',
        created_at: editing?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
      };
      await service.artisans.save(artisan);
      setIsOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save artisan');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (artisan: Artisan) => {
    const confirmed = typeof window !== 'undefined' && window.confirm(`Archive ${artisan.name}? Their historical records will be retained.`);
    if (!confirmed) return;
    try {
      await service.artisans.softDelete(artisan.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive artisan');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <Handshake className="h-4 w-4" /> Ajrakhika master data
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Artisans</h1>
          <p className="mt-1 text-sm text-slate-600">Keep artisan contacts and craft details together. Payouts and payable ledgers will be connected in a later milestone.</p>
        </div>
        <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Add artisan</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Active artisans</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{artisans.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Crafts represented</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{new Set(artisans.map((a) => a.craft?.trim()).filter(Boolean)).size}</p>
        </Card>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input aria-label="Search artisans" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, village, craft or phone…" className="pl-9" />
      </div>

      {error && !isOpen && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading artisans…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Users className="h-6 w-6" /></div>
          <h2 className="mt-3 text-base font-semibold">{search ? 'No matching artisans' : 'No artisans added yet'}</h2>
          <p className="mt-1 text-sm text-slate-500">{search ? 'Try a different name, village, craft or phone number.' : 'Add the people and craft partners behind your products.'}</p>
          {!search && <div className="mt-4"><Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Add first artisan</Button></div>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((artisan) => (
            <Card key={artisan.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800 font-semibold">{artisan.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h2 className="font-semibold text-slate-900 truncate">{artisan.name}</h2><p className="mt-0.5 text-xs text-slate-500">{artisan.craft || 'Craft not specified'}</p></div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEdit(artisan)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Edit ${artisan.name}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => void remove(artisan)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Archive ${artisan.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                    {artisan.village && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{artisan.village}</span>}
                    {artisan.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{artisan.mobile}</span>}
                    {artisan.craft && <Badge><Palette className="mr-1 inline h-3 w-3" />{artisan.craft}</Badge>}
                  </div>
                  {artisan.upi_or_bank_text && <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500 break-words">Payment details: {artisan.upi_or_bank_text}</p>}
                  {artisan.notes && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{artisan.notes}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editing ? 'Edit artisan' : 'Add artisan'} maxWidth="xl">
        <form onSubmit={save} className="space-y-4">
          <Input label="Artisan name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required maxLength={120} placeholder="Full name" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Village / town" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} maxLength={100} placeholder="e.g. Ajrakhpur" />
            <Input label="Craft / specialty" value={form.craft} onChange={(e) => setForm({ ...form, craft: e.target.value })} maxLength={100} placeholder="e.g. Ajrakh block printing" />
          </div>
          <Input label="Mobile number" type="tel" inputMode="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} maxLength={20} placeholder="Contact number" />
          <Input label="UPI or bank details (optional)" value={form.upi_or_bank_text} onChange={(e) => setForm({ ...form, upi_or_bank_text: e.target.value })} maxLength={240} placeholder="UPI ID or payment note" />
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={2000} className="block min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800" placeholder="Materials, lead times, or other useful notes" /></div>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save artisan'}</Button></div>
        </form>
      </Modal>
    </div>
  );
};
