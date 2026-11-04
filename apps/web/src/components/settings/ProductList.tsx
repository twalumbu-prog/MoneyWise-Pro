import React, { useEffect, useRef, useState } from 'react';
import { Download, Edit2, Gavel, Loader2, MoreHorizontal, Package, Search, Share2, Store, Trash2 } from 'lucide-react';
import { formatKwacha } from 'core';
import { PRODUCT_TYPE_OPTIONS } from '../../services/product.service';
import type { Product } from '../../services/product.service';
import { resized } from '../../lib/images';
import { TimeLeftText } from '../marketplace/parts';

/** The live auction on an item, taken from the Marketplace. */
export interface AuctionInfo { id: string; status: 'OPEN' | 'SOLD'; endsAt: string; serverNow?: string; bidCount: number; currentBid: number | null; startPrice: number }

interface Props {
    products: Product[];
    isAdmin: boolean;
    /** Items that show on the Marketplace right now (active and listed). */
    onMarketplace: Set<string>;
    auctions: Map<string, AuctionInfo>;
    downloadingId: string | null;
    onEdit: (p: Product) => void;
    onShare: (p: Product) => void;
    onDelete: (p: Product) => void;
    onDownload: (p: Product) => void;
    onAuction: (p: Product) => void;
    onToggleActive: (p: Product, active: boolean) => Promise<void> | void;
    onAdd: () => void;
}

const typeLabel = (t: string | undefined) => PRODUCT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t ?? 'Item';
/** Only products and fixed-price services can be sold by auction: the rest are donations, quotes, bookings or downloads. */
export const canAuction = (p: Pick<Product, 'product_type'>) => p.product_type === 'PRODUCT' || p.product_type === 'SERVICE_FIXED';

const Thumb: React.FC<{ product: Product }> = ({ product }) => {
    const [broken, setBroken] = useState(false);
    return (
        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#E8F0FE] text-[#0B57D0]">
            {product.image_url && !broken
                ? <img src={resized(product.image_url, 120, { square: true })} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
                : <Package size={22} strokeWidth={1.7} />}
        </span>
    );
};

const Switch: React.FC<{ on: boolean; busy?: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }> = ({ on, busy, disabled, label, onChange }) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled || busy} onClick={() => onChange(!on)} className={`relative h-6 w-11 min-w-[2.75rem] flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#0B57D0]' : 'bg-[#C4C7C5]'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

/**
 * The list of products and services: one row each with the picture, what it is, where it is sold, its price, an Active switch and the
 * actions you need most (Edit, Auction, Share) in plain sight. The rest is under the three dots.
 */
export const ProductList: React.FC<Props> = ({ products, isAdmin, onMarketplace, auctions, downloadingId, onEdit, onShare, onDelete, onDownload, onAuction, onToggleActive, onAdd }) => {
    const [query, setQuery] = useState('');
    const [menu, setMenu] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menu) return;
        const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(null); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menu]);

    const q = query.trim().toLowerCase();
    const shown = products.filter((p) => !q || `${p.name} ${p.category ?? ''} ${p.description ?? ''}`.toLowerCase().includes(q));
    const active = products.filter((p) => p.is_active).length;
    const live = [...auctions.values()].filter((a) => a.status === 'OPEN').length;

    const toggle = async (p: Product, v: boolean) => { setBusyId(p.id); try { await onToggleActive(p, v); } finally { setBusyId(null); } };
    const stat = (n: number, label: string) => <span className="rounded-full bg-[#F1F3F4] px-3 py-1 text-xs text-[#3C4043]"><span className="font-bold text-[#1F1F1F]">{n}</span> {label}</span>;

    return (
        <div className="flex flex-col gap-4 p-1">
            <div className="flex flex-wrap items-center gap-2">
                {stat(products.length, products.length === 1 ? 'item' : 'items')}{stat(active, 'active')}{stat(onMarketplace.size, 'on the Marketplace')}{live > 0 && stat(live, live === 1 ? 'auction live' : 'auctions live')}
                <div className="relative ml-auto w-full sm:w-64">
                    <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#80868B]" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your items" aria-label="Search your items" className="h-10 w-full rounded-full bg-[#F1F3F4] pl-9 pr-4 text-sm placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                </div>
            </div>

            {shown.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Package size={24} /></span>
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{q ? 'Nothing matches that' : 'Nothing here yet'}</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">{q ? 'Try another word.' : isAdmin ? 'Add a product or service to start selling.' : 'No products or services have been set up.'}</p>
                    {isAdmin && !q && <button type="button" onClick={onAdd} className="mt-4 h-11 rounded-full bg-[#0B57D0] px-6 text-sm font-bold text-white hover:bg-[#0842A0]">Add your first item</button>}
                </div>
            ) : (
                <ul className="flex flex-col gap-2.5">
                    {shown.map((p) => {
                        const a = auctions.get(p.id);
                        const liveAuction = a?.status === 'OPEN';
                        const listed = onMarketplace.has(p.id);
                        return (
                            <li key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border bg-white p-3.5 transition hover:shadow-sm ${p.is_active ? 'border-[rgba(116,119,117,0.22)]' : 'border-dashed border-[rgba(116,119,117,0.3)] bg-[#FAFAFA]'}`}>
                                <Thumb product={p} />
                                <div className="min-w-0 flex-1 basis-[220px]">
                                    <p className="truncate text-base font-bold text-[#1F1F1F]">{p.name}</p>
                                    <p className="truncate text-xs text-[#5F6368]">{p.category ? `${p.category} · ` : ''}{p.description || 'No description'}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[11px] font-semibold text-[#1967D2]">{typeLabel(p.product_type)}</span>
                                        {liveAuction
                                            ? <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF7E0] px-2.5 py-0.5 text-[11px] font-bold text-[#B06000]"><Gavel size={11} /> Auction · <TimeLeftText endsAt={a!.endsAt} serverNow={a!.serverNow} /> · {a!.bidCount} {a!.bidCount === 1 ? 'bid' : 'bids'}</span>
                                            : a?.status === 'SOLD'
                                                ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]"><Gavel size={11} /> Auction won · {formatKwacha(a.currentBid ?? 0)}</span>
                                                : listed
                                                    ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#137333]"><Store size={11} /> On the Marketplace</span>
                                                    : <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-medium text-[#5F6368]">Not on the Marketplace</span>}
                                        {(() => {
                                            const sp = p as any;
                                            if (!sp.track_stock) return null;
                                            const vs: { stock?: number }[] = Array.isArray(sp.variants) ? sp.variants : [];
                                            const n = vs.length ? vs.reduce((t, v) => t + (Number(v.stock) || 0), 0) : Number(sp.stock_quantity) || 0;
                                            const low = n <= Number(sp.low_stock_threshold ?? 5);
                                            return n <= 0
                                                ? <span className="rounded-full bg-[#FCE8E6] px-2.5 py-0.5 text-[11px] font-bold text-[#C5221F]">Sold out</span>
                                                : low
                                                    ? <span className="rounded-full bg-[#FEF7E0] px-2.5 py-0.5 text-[11px] font-bold text-[#B06000]">Only {n} left</span>
                                                    : <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-medium text-[#5F6368]">{n} in stock</span>;
                                        })()}
                                    </div>
                                </div>

                                <div className="w-24 text-right">
                                    <p className="text-base font-bold tabular-nums text-[#1F1F1F]">{p.price != null && !(p.product_type === 'DONATION') ? formatKwacha(Number(p.price)) : <span className="text-xs font-medium text-[#80868B]">{p.product_type === 'DONATION' ? 'Any amount' : 'Variable'}</span>}</p>
                                    {liveAuction && a!.currentBid != null && <p className="text-[11px] text-[#B06000]">Top bid {formatKwacha(a!.currentBid)}</p>}
                                </div>

                                <div className="flex flex-shrink-0 items-center gap-2" title={p.is_active ? 'Visible to customers' : 'Hidden from customers'}>
                                    <Switch on={p.is_active} busy={busyId === p.id} disabled={!isAdmin} label={`${p.name} is ${p.is_active ? 'active' : 'inactive'}`} onChange={(v) => toggle(p, v)} />
                                    <span className={`w-[3.25rem] flex-shrink-0 text-xs font-semibold ${p.is_active ? 'text-[#137333]' : 'text-[#80868B]'}`}>{p.is_active ? 'Active' : 'Hidden'}</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {isAdmin && <button type="button" onClick={() => onEdit(p)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#D3E3FD] px-4 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FB]"><Edit2 size={14} /> Edit</button>}
                                    {isAdmin && canAuction(p) && !liveAuction && a?.status !== 'SOLD' && (
                                        <button type="button" onClick={() => onAuction(p)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]"><Gavel size={14} /> Auction</button>
                                    )}
                                    <button type="button" onClick={() => onShare(p)} aria-label="Share payment link" title="Share payment link" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5F6368] hover:bg-[#F1F3F4]"><Share2 size={16} /></button>
                                    <div className="relative" ref={menu === p.id ? box : null}>
                                        <button type="button" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label="More actions" aria-expanded={menu === p.id} className="flex h-9 w-9 items-center justify-center rounded-full text-[#5F6368] hover:bg-[#F1F3F4]"><MoreHorizontal size={18} /></button>
                                        {menu === p.id && (
                                            <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-52 overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white py-1 shadow-xl">
                                                <button type="button" onClick={() => { onShare(p); setMenu(null); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[#1F1F1F] hover:bg-[#F8FAFD]"><Share2 size={15} className="text-[#0B57D0]" /> Share payment link</button>
                                                {isAdmin && (
                                                    <>
                                                        <button type="button" disabled={downloadingId === p.id} onClick={() => { onDownload(p); setMenu(null); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[#1F1F1F] hover:bg-[#F8FAFD] disabled:opacity-50">{downloadingId === p.id ? <Loader2 size={15} className="animate-spin text-[#0B57D0]" /> : <Download size={15} className="text-[#0B57D0]" />} Download sales CSV</button>
                                                        <button type="button" onClick={() => { onDelete(p); setMenu(null); }} className="flex w-full items-center gap-2.5 border-t border-[rgba(116,119,117,0.16)] px-4 py-2.5 text-left text-sm text-[#B31412] hover:bg-[#FCE8E6]"><Trash2 size={15} /> Delete</button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
