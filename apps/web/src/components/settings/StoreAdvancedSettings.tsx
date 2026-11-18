import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ImagePlus, MapPin, Megaphone, Palette, Phone, Star, Truck, X } from 'lucide-react';
import { apiJson } from 'core';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../utils/file_utils';
import { useAuth } from '../../context/AuthContext';
import { ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { SellerReviews } from '../marketplace/SellerReviews';
import { LISTINGS_KEY } from '../marketplace/parts';
import { DEFAULT_THEME, cleanTheme } from '../marketplace/storeTheme';
import type { StoreTheme } from '../marketplace/storeTheme';

interface Loc { city: string; province: string; country: string; street: string; plotNumber: string }
interface Contact { phone: string; altPhone: string; email: string; website: string }

const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({ icon, title, hint, children }) => (
    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-[#1F1F1F]"><span className="text-[#0B57D0]">{icon}</span>{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-[#5F6368]">{hint}</p>}
        <div className="mt-4">{children}</div>
    </section>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 text-left">
        <span><span className="block text-sm font-bold text-[#1F1F1F]">{label}</span>{hint && <span className="block text-xs text-[#5F6368]">{hint}</span>}</span>
        <span className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#0B57D0]' : 'bg-[#C4C7C5]'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} /></span>
    </button>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; max?: number; inputMode?: 'tel' | 'email' | 'url' | 'decimal' }> = ({ label, value, onChange, placeholder, type = 'text', max, inputMode }) => (
    <div>
        <label className={labelClass}>{label}</label>
        <input className={fieldClass} type={type} value={value} maxLength={max} inputMode={inputMode} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
);

/**
 * The Advanced tab of Products & Services: how the store appears and works on the Marketplace. Cover photos for the store and for
 * auctions, whether the store delivers, where it is, how buyers can reach it, and replies to its reviews.
 */
export const StoreAdvancedSettings: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { organizationId } = useAuth();
    const orgId = organizationId ?? '';

    const { data: stored } = useQuery({ queryKey: ['marketplace', 'store', orgId], queryFn: () => apiJson<{ theme: StoreTheme }>(`/marketplace/stores/${orgId}`), enabled: !!orgId });
    const { data: storedLoc } = useQuery({ queryKey: ['marketplace', 'my-location'], queryFn: () => apiJson<Loc>('/marketplace/my-location') });
    const { data: storedContact } = useQuery({ queryKey: ['marketplace', 'my-contact'], queryFn: () => apiJson<Contact>('/marketplace/my-contact') });

    const [theme, setTheme] = useState<StoreTheme>(DEFAULT_THEME);
    const [loc, setLoc] = useState<Loc>({ city: '', province: '', country: 'Zambia', street: '', plotNumber: '' });
    const [contact, setContact] = useState<Contact>({ phone: '', altPhone: '', email: '', website: '' });
    const [uploading, setUploading] = useState<'cover' | 'auction' | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => { if (stored) setTheme(cleanTheme(stored.theme)); }, [stored]);
    useEffect(() => { if (storedLoc) setLoc({ ...storedLoc, country: storedLoc.country || 'Zambia' }); }, [storedLoc]);
    useEffect(() => { if (storedContact) setContact(storedContact); }, [storedContact]);
    const touch = () => { setSaved(false); setError(null); };

    const upload = async (files: FileList | null, kind: 'cover' | 'auction') => {
        if (!files || files.length === 0) return;
        setUploading(kind); setError(null);
        try {
            const room = kind === 'cover' ? 5 - theme.covers.length : 1;
            const urls: string[] = [];
            for (const [i, file] of Array.from(files).slice(0, Math.max(room, 1)).entries()) {
                const compressed = await compressImage(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1600, initialQuality: 0.75 });
                const path = `${orgId || 'shared'}/store-${kind}-${Date.now()}-${i}.jpg`;
                const { data, error: e } = await supabase.storage.from('product-images').upload(path, compressed, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
                if (e) throw e;
                urls.push(supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl);
            }
            touch();
            if (kind === 'cover') {
                if (room <= 0) { setError('A store can have up to 5 cover photos.'); return; }
                setTheme((t) => ({ ...t, covers: [...t.covers, ...urls].slice(0, 5) }));
            } else setTheme((t) => ({ ...t, auctionCoverUrl: urls[0] ?? null }));
        } catch (e: any) { setError(e?.message || 'Couldn’t upload the picture.'); }
        finally { setUploading(null); }
    };

    const save = async () => {
        if (theme.contact.show && !contact.phone.trim() && !contact.email.trim() && !theme.contact.whatsapp.trim()) { setError('Add a phone number, WhatsApp or email to show on your store, or turn that off.'); return; }
        setBusy(true); setError(null); setSaved(false);
        try {
            await apiJson('/marketplace/my-contact', { method: 'PUT', body: JSON.stringify(contact) });
            await apiJson('/marketplace/my-location', { method: 'PUT', body: JSON.stringify(loc) });
            await apiJson('/marketplace/my-store-theme', { method: 'PUT', body: JSON.stringify({ covers: theme.covers, auctionCoverUrl: theme.auctionCoverUrl, delivery: theme.delivery, contact: theme.contact }) });
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['marketplace', 'store', orgId] }), qc.invalidateQueries({ queryKey: ['marketplace', 'my-location'] }),
                qc.invalidateQueries({ queryKey: ['marketplace', 'my-contact'] }), qc.invalidateQueries({ queryKey: LISTINGS_KEY }),
            ]);
            setSaved(true);
        } catch (e: any) { setError(e?.message || 'Couldn’t save your settings.'); }
        finally { setBusy(false); }
    };

    const Thumbs = (
        <div className="flex flex-wrap gap-3">
            {theme.covers.map((u, i) => (
                <div key={u} className="relative">
                    <img src={u} alt={`Cover ${i + 1}`} className="h-24 w-40 rounded-xl object-cover" />
                    {i === 0 ? <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">Main</span>
                        : <button type="button" onClick={() => { touch(); setTheme((t) => ({ ...t, covers: [u, ...t.covers.filter((x) => x !== u)] })); }} className="absolute bottom-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-[#1F1F1F]">Make main</button>}
                    <button type="button" aria-label="Remove cover photo" onClick={() => { touch(); setTheme((t) => ({ ...t, covers: t.covers.filter((x) => x !== u) })); }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[#B31412] shadow"><X size={13} /></button>
                </div>
            ))}
            {theme.covers.length < 5 && (
                <label className="flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#9AA0A6] text-xs font-semibold text-[#5F6368] hover:bg-[#F1F3F4]">
                    <ImagePlus size={18} />{uploading === 'cover' ? 'Uploading…' : 'Add photos'}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={uploading !== null} onChange={(e) => { upload(e.target.files, 'cover'); e.target.value = ''; }} />
                </label>
            )}
        </div>
    );

    return (
        <div className="space-y-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-sm text-[#5F6368]">How your store looks and works on the Marketplace. Colours, layout and fonts are under <span className="font-semibold">Customise store</span> on your store page.</p>
                {orgId && <button type="button" onClick={() => navigate('/marketplace/ads')} className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]"><Megaphone size={15} /> Advertise</button>}
                {orgId && <button type="button" onClick={() => navigate(`/marketplace/store/${orgId}`)} className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]"><Palette size={15} /> Open my store <ExternalLink size={13} /></button>}
            </div>

            <Section icon={<ImagePlus size={18} />} title="Cover photos" hint="Shown across the top of your store. With more than one, they change every few seconds. Up to 5; the main one comes first.">
                {Thumbs}
                <div className="mt-5 border-t border-[rgba(116,119,117,0.16)] pt-4">
                    <p className="text-sm font-bold text-[#1F1F1F]">Auction cover</p>
                    <p className="mb-3 text-xs text-[#5F6368]">The header of your “Live auctions” section. It is also used for an auction item that has no picture of its own.</p>
                    <div className="flex items-center gap-3">
                        {theme.auctionCoverUrl ? (
                            <div className="relative"><img src={theme.auctionCoverUrl} alt="Auction cover" className="h-24 w-40 rounded-xl object-cover" /><button type="button" aria-label="Remove auction cover" onClick={() => { touch(); setTheme((t) => ({ ...t, auctionCoverUrl: null })); }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[#B31412] shadow"><X size={13} /></button></div>
                        ) : (
                            <label className="flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#9AA0A6] text-xs font-semibold text-[#5F6368] hover:bg-[#F1F3F4]">
                                <ImagePlus size={18} />{uploading === 'auction' ? 'Uploading…' : 'Add a photo'}
                                <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => { upload(e.target.files, 'auction'); e.target.value = ''; }} />
                            </label>
                        )}
                    </div>
                </div>
            </Section>

            <Section icon={<Truck size={18} />} title="Delivery" hint="Delivery works in Lusaka only for now. A product with its own delivery setting keeps it.">
                <Toggle on={theme.delivery.enabled} onChange={(v) => { touch(); setTheme((t) => ({ ...t, delivery: { ...t.delivery, enabled: v } })); }} label="We deliver" hint="Buyers in Lusaka can choose delivery at checkout." />
                {theme.delivery.enabled && (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Delivery charge (K)" value={theme.delivery.charge ? String(theme.delivery.charge) : ''} inputMode="decimal" placeholder="0.00" onChange={(v) => { touch(); setTheme((t) => ({ ...t, delivery: { ...t.delivery, charge: Number(v.replace(/[^0-9.]/g, '')) || 0 } })); }} />
                        <Field label="Note for buyers (optional)" value={theme.delivery.note} max={120} placeholder="e.g. Same-day before 4pm" onChange={(v) => { touch(); setTheme((t) => ({ ...t, delivery: { ...t.delivery, note: v } })); }} />
                    </div>
                )}
                {theme.delivery.enabled && !loc.city.trim() && <p className="mt-3 rounded-xl bg-[#FEF7E0] px-3 py-2 text-xs text-[#B06000]">Add your store location below. Delivery only shows for stores located in Lusaka.</p>}
            </Section>

            <Section icon={<MapPin size={18} />} title="Store location" hint="Shown on your store and listings so buyers know where you are. Include your area, like “Kabulonga, Lusaka”.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Area and city" value={loc.city} max={80} placeholder="e.g. Kabulonga, Lusaka" onChange={(v) => { touch(); setLoc({ ...loc, city: v }); }} />
                    <Field label="Province" value={loc.province} max={80} placeholder="e.g. Lusaka Province" onChange={(v) => { touch(); setLoc({ ...loc, province: v }); }} />
                    <Field label="Street" value={loc.street} max={80} placeholder="e.g. Nelson Mandela Road" onChange={(v) => { touch(); setLoc({ ...loc, street: v }); }} />
                    <Field label="Plot number" value={loc.plotNumber} max={80} placeholder="e.g. 7779" onChange={(v) => { touch(); setLoc({ ...loc, plotNumber: v }); }} />
                </div>
            </Section>

            <Section icon={<Phone size={18} />} title="Contact details" hint="How buyers can reach you. They only appear on your store when you turn that on.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Phone" type="tel" inputMode="tel" value={contact.phone} max={20} placeholder="0971234567" onChange={(v) => { touch(); setContact({ ...contact, phone: v }); }} />
                    <Field label="Second phone (optional)" type="tel" inputMode="tel" value={contact.altPhone} max={20} onChange={(v) => { touch(); setContact({ ...contact, altPhone: v }); }} />
                    <Field label="WhatsApp number (optional)" type="tel" inputMode="tel" value={theme.contact.whatsapp} max={20} placeholder="+260971234567" onChange={(v) => { touch(); setTheme((t) => ({ ...t, contact: { ...t.contact, whatsapp: v } })); }} />
                    <Field label="Email" type="email" inputMode="email" value={contact.email} max={120} onChange={(v) => { touch(); setContact({ ...contact, email: v }); }} />
                    <Field label="Website (optional)" type="url" inputMode="url" value={contact.website} max={200} placeholder="https://" onChange={(v) => { touch(); setContact({ ...contact, website: v }); }} />
                    <Field label="Opening hours (optional)" value={theme.contact.hours} max={80} placeholder="e.g. Mon to Sat, 8am to 6pm" onChange={(v) => { touch(); setTheme((t) => ({ ...t, contact: { ...t.contact, hours: v } })); }} />
                </div>
                <div className="mt-4 rounded-xl bg-[#F8FAFD] p-4">
                    <Toggle on={theme.contact.show} onChange={(v) => { touch(); setTheme((t) => ({ ...t, contact: { ...t.contact, show: v } })); }} label="Show contact details on my store" hint="Off keeps them private; buyers can still order and pay in the app." />
                </div>
            </Section>

            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-[rgba(116,119,117,0.22)] bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                <PrimaryButton onClick={save} busy={busy} className="h-11 px-8">Save settings</PrimaryButton>
                {saved && <span role="status" className="text-sm font-semibold text-[#137333]">Saved</span>}
                <div className="min-w-0 flex-1"><ErrorNote text={error} /></div>
            </div>

            <Section icon={<Star size={18} />} title="Reviews" hint="What buyers say about your store. Your reply shows under their review for everyone to see.">
                {orgId ? <SellerReviews sellerId={orgId} sellerName="your store" isMine /> : null}
            </Section>
        </div>
    );
};
