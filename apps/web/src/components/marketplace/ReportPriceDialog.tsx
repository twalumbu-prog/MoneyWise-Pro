import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { apiJson } from 'core';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/file_utils';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { CatalogPicker } from './CatalogPicker';
import type { CatalogItem } from './compareTypes';
import { unitText } from './compareTypes';

interface Result { status: string; points: number; confirmed: boolean; message: string }
const today = () => new Date().toISOString().slice(0, 10);
const twoWeeksAgo = () => new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

/** Report a price you saw at a shop or depot. A photo of the tag or receipt earns extra points; two shoppers reporting the same price confirm it. */
export const ReportPriceDialog: React.FC<{ item?: CatalogItem | null; onClose: () => void; onDone?: () => void }> = ({ item: preset, onClose, onDone }) => {
    const { organizationId } = useAuth();
    const [itemId, setItemId] = useState(preset?.id ?? '');
    const [item, setItem] = useState<CatalogItem | null>(preset ?? null);
    const [place, setPlace] = useState(''); const [town, setTown] = useState(''); const [price, setPrice] = useState(''); const [seen, setSeen] = useState(today());
    const [photo, setPhoto] = useState<string | null>(null); const [uploading, setUploading] = useState(false);
    const [places, setPlaces] = useState<{ placeName: string; town: string | null }[]>([]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [result, setResult] = useState<Result | null>(null);

    useEffect(() => { apiJson<{ places: { placeName: string; town: string | null }[] }>(`/marketplace/price-reports/places${itemId ? `?item=${itemId}` : ''}`).then((r) => setPlaces(r.places)).catch(() => setPlaces([])); }, [itemId]);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true); setErr(null);
        try {
            const compressed = await compressImage(file, { maxSizeMB: 0.3, maxWidthOrHeight: 1000, initialQuality: 0.72 });
            const path = `${organizationId || 'shared'}/price-${Date.now()}.jpg`;
            const { data, error } = await supabase.storage.from('product-images').upload(path, compressed, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
            if (error) throw error;
            setPhoto(supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl);
        } catch (e: any) { setErr(e?.message || 'Could not upload the photo. You can still send the price without it.'); } finally { setUploading(false); }
    };

    const send = async () => {
        setBusy(true); setErr(null);
        try {
            setResult(await apiJson<Result>('/marketplace/price-reports', { method: 'POST', body: JSON.stringify({ catalogItemId: itemId, placeName: place, town, price: Number(price), observedOn: seen, evidenceUrl: photo ?? undefined }) }));
            onDone?.();
        } catch (e: any) { setErr(e?.message || 'Could not send your report.'); } finally { setBusy(false); }
    };

    if (result) {
        return (
            <Dialog open size="sm" title="Thank you" onClose={onClose}>
                <p className="text-sm text-[#3C4043]">{result.message}</p>
                <PrimaryButton onClick={onClose} className="mt-5 w-full">Done</PrimaryButton>
            </Dialog>
        );
    }
    return (
        <Dialog open size="md" title="Report a price" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div><label className={labelClass}>Product</label><CatalogPicker value={itemId} onChange={(id, i) => { setItemId(id); setItem(i ?? null); }} placeholder="Search, e.g. cement or sugar" /></div>
                <div>
                    <label className={labelClass}>Where did you see it?</label>
                    <input className={fieldClass} list="rp-places" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. ShopRite Garden City" maxLength={120} />
                    <datalist id="rp-places">{places.map((p, i) => <option key={i} value={p.placeName}>{p.town ?? ''}</option>)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Town</label><input className={fieldClass} value={town} onChange={(e) => setTown(e.target.value)} placeholder="Lusaka" /></div>
                    <div><label className={labelClass}>Price{item ? ` per ${unitText(item)}` : ''} (K)</label><input className={fieldClass} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                    <div className="col-span-2"><label className={labelClass}>Date you saw it</label><input type="date" className={fieldClass} min={twoWeeksAgo()} max={today()} value={seen} onChange={(e) => setSeen(e.target.value)} /></div>
                </div>
                <div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#C4C7C5] p-3 text-sm text-[#3C4043] hover:bg-[#F8FAFD]">
                        <Camera size={18} className="text-[#0B57D0]" />
                        <span className="flex-1">{uploading ? 'Uploading…' : photo ? 'Photo added. Tap to change.' : 'Add a photo of the price tag or receipt (+5 points)'}</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
                    </label>
                    {photo && <img src={photo} alt="Your photo" className="mt-2 h-24 rounded-xl object-cover" />}
                </div>
                <PrimaryButton busy={busy} onClick={send} disabled={!itemId || place.trim().length < 2 || !(Number(price) > 0) || uploading} className="w-full">Send price</PrimaryButton>
                <p className="text-[11px] text-[#5F6368]">You earn 10 points for a price (15 with a photo), and 20 more when another shopper reports about the same price at the same place. Report only what you really saw in the last two weeks.</p>
            </div>
        </Dialog>
    );
};
