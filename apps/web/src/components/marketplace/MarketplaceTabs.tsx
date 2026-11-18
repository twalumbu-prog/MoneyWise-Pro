import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsSuperAdmin } from './MarketplaceMobileNav';
import { Briefcase, CalendarClock, Check, ChevronDown, Compass, Globe, Megaphone, MoreHorizontal, ClipboardList, Package, PackageCheck, Scale, ShoppingBasket, Store, UtensilsCrossed } from 'lucide-react';

export type MarketplaceTab = 'plan' | 'requests' | 'price-desk' | 'compare' | 'import-desk' | 'browse' | 'stores' | 'services' | 'food' | 'imported' | 'import-orders' | 'orders' | 'pay-later' | 'ads';

interface Tab { id: MarketplaceTab; label: string; to: string; icon: React.ComponentType<any>; hint?: string }

/** The sections you browse with, always in view. */
const MAIN: Tab[] = [
    { id: 'browse', label: 'Browse', to: '/marketplace', icon: Compass },
    { id: 'stores', label: 'Stores', to: '/marketplace/stores', icon: Store },
    { id: 'services', label: 'Services', to: '/marketplace/services', icon: Briefcase },
    { id: 'food', label: 'Food', to: '/marketplace/food', icon: UtensilsCrossed },
    { id: 'compare', label: 'Compare', to: '/marketplace/compare', icon: Scale },
];
/** The sections about your own buying and selling, kept under "More". */
const MORE: (Tab & { adminOnly?: boolean })[] = [
    { id: 'plan', label: 'Plan a purchase', to: '/marketplace/plan', icon: ShoppingBasket, hint: 'Find the cheapest place to buy everything you need' },
    { id: 'requests', label: 'Requests for quote', to: '/marketplace/requests', icon: ClipboardList, hint: 'Ask suppliers for a price, or quote a request' },
    { id: 'orders', label: 'Orders', to: '/marketplace/orders', icon: Package, hint: 'What you bought and sold' },
    { id: 'imported', label: 'Order from overseas', to: '/marketplace/imported', icon: Globe, hint: 'Ask for something to be brought in, or paste a link' },
    { id: 'import-orders', label: 'Import orders', to: '/marketplace/imported/orders', icon: PackageCheck, hint: 'Follow what you ordered from overseas' },
    { id: 'import-desk', label: 'Import desk', to: '/marketplace/import-desk', icon: PackageCheck, hint: 'Orders to buy, catalogue and prices (team only)', adminOnly: true },
    { id: 'price-desk', label: 'Price desk', to: '/marketplace/price-desk', icon: Scale, hint: 'Enter prices from suppliers and shops (team only)', adminOnly: true },
    { id: 'pay-later', label: 'Pay in 4', to: '/marketplace/pay-later', icon: CalendarClock, hint: 'Split a purchase into four payments' },
    { id: 'ads', label: 'Advertise', to: '/marketplace/ads', icon: Megaphone, hint: 'Get your items and store seen first' },
];

const tabClass = (on: boolean) => `-mb-px flex flex-shrink-0 items-center gap-2 border-b-[3px] px-5 py-3 text-sm transition-colors ${on ? 'border-[#0B57D0] font-bold text-[#0B57D0]' : 'border-transparent font-medium text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#1F1F1F]'}`;

/**
 * The sections of the Marketplace, as one set of tabs shared by every page in it: Browse, Stores and Services, then a "More" menu holding
 * Orders, Pay in 4 and Advertise. Each section keeps its own address. A plain click always moves within this tab (it is handled here, and
 * the link says so); only a deliberate Ctrl, Cmd or middle click opens the page in a new tab.
 */
export const MarketplaceTabs: React.FC<{ active: MarketplaceTab }> = ({ active }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const isAdmin = useIsSuperAdmin();
    const inMore = MORE.find((m) => m.id === active);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
    }, [open]);

    const go = (e: React.MouseEvent, to: string, on: boolean) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        setOpen(false);
        if (!on) navigate(to);
    };

    return (
        <nav className="mb-6 hidden items-center gap-1 border-b md:flex border-[rgba(116,119,117,0.22)]" aria-label="Marketplace sections" role="tablist">
            {MAIN.map(({ id, label, to, icon: Icon }) => (
                <a key={id} href={to} target="_self" role="tab" aria-selected={id === active} aria-current={id === active ? 'page' : undefined} onClick={(e) => go(e, to, id === active)} className={tabClass(id === active)}>
                    <Icon size={16} />{label}
                </a>
            ))}

            <div ref={box} className="relative">
                <button type="button" role="tab" aria-selected={!!inMore} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={tabClass(!!inMore)}>
                    {inMore ? <inMore.icon size={16} /> : <MoreHorizontal size={16} />}
                    {inMore ? inMore.label : 'More'}
                    <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                    <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white py-1.5 shadow-xl">
                        {MORE.filter((m) => !m.adminOnly || isAdmin).map(({ id, label, to, icon: Icon, hint }) => (
                            <a key={id} href={to} target="_self" role="menuitem" onClick={(e) => go(e, to, id === active)} className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[#F8FAFD] ${id === active ? 'bg-[#F0F6FF]' : ''}`}>
                                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Icon size={16} /></span>
                                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1F1F1F]">{label}</span>{hint && <span className="block text-xs text-[#5F6368]">{hint}</span>}</span>
                                {id === active && <Check size={16} className="mt-1 flex-shrink-0 text-[#0B57D0]" />}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </nav>
    );
};
