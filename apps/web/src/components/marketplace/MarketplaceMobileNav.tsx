import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from 'core';
import { Briefcase, CalendarClock, Compass, Globe, Megaphone, MapPin, MoreHorizontal, Package, PackageCheck, Store, UtensilsCrossed } from 'lucide-react';

/**
 * The Marketplace on a phone. Its sections live in the app's bottom bar (replacing the usual four icons while you are in the Marketplace),
 * and what is left (Orders, Pay in 4, Advertise) sits behind a "more" button in the top bar next to the back arrow.
 */
/** True only for platform super admins: the API answers 403 to everyone else. */
export const useIsSuperAdmin = () => useQuery({ queryKey: ['admin', 'me'], queryFn: () => apiJson<{ superAdmin: boolean }>('/admin/me').then((r) => !!r.superAdmin).catch(() => false), staleTime: 10 * 60_000, retry: false }).data === true;

export const isMarketplacePath = (p: string) => p === '/marketplace' || p.startsWith('/marketplace/');

type Section = 'browse' | 'stores' | 'services' | 'food' | 'imported' | 'more';
/** Which section a Marketplace address belongs to (an item or checkout page counts as Browse). */
export const marketplaceSection = (p: string): Section => {
    if (p.startsWith('/marketplace/imported/orders')) return 'more';
    if (p.startsWith('/marketplace/imported')) return 'imported';
    if (p.startsWith('/marketplace/stores') || p.startsWith('/marketplace/store/')) return 'stores';
    if (p.startsWith('/marketplace/services')) return 'services';
    if (p.startsWith('/marketplace/food')) return 'food';
    if (/^\/marketplace\/(orders|pay-later|ads|import-desk)/.test(p)) return 'more';
    return 'browse';
};

export const MARKETPLACE_BOTTOM_TABS: { path: string; icon: React.ComponentType<any>; label: string; section: Section }[] = [
    { path: '/marketplace', icon: Compass, label: 'Browse', section: 'browse' },
    { path: '/marketplace/stores', icon: Store, label: 'Stores', section: 'stores' },
    { path: '/marketplace/services', icon: Briefcase, label: 'Services', section: 'services' },
    { path: '/marketplace/food', icon: UtensilsCrossed, label: 'Food', section: 'food' },
    { path: '/marketplace/imported', icon: Globe, label: 'Imported', section: 'imported' },
];

const MORE = [
    { to: '/marketplace/orders', label: 'Orders', hint: 'What you bought and sold', icon: Package },
    { to: '/marketplace/imported/orders', label: 'Import orders', hint: 'Follow what you ordered from overseas', icon: PackageCheck },
    { to: '/marketplace/pay-later', label: 'Pay in 4', hint: 'Split a purchase into four payments', icon: CalendarClock },
    { to: '/marketplace/ads', label: 'Advertise', hint: 'Get your items and store seen first', icon: Megaphone },
    { to: '/marketplace/import-desk', label: 'Import desk', hint: 'Orders to buy, catalogue and prices (team only)', icon: PackageCheck, adminOnly: true },
    { to: '/marketplace?location=1', label: 'Store location', hint: 'Where your store is, for buyers nearby', icon: MapPin },
];

/** The round "more" button in the top bar, opening Orders, Pay in 4 and Advertise. */
export const MarketplaceMoreButton: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => { setOpen(false); }, [pathname]);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown); document.addEventListener('touchstart', onDown);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
    }, [open]);
    const isAdmin = useIsSuperAdmin();
    const inMore = marketplaceSection(pathname) === 'more';
    return (
        <div ref={box} className="relative">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="More Marketplace options" className={`flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 shadow-sm active:scale-95 ${inMore || open ? 'bg-[#E8F0FE] text-[#0B57D0]' : 'bg-white text-gray-500'}`}>
                <MoreHorizontal size={20} />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white py-1.5 shadow-xl">
                    {MORE.filter((m) => !(m as any).adminOnly || isAdmin).map(({ to, label, hint, icon: Icon }) => (
                        <button key={to} type="button" role="menuitem" onClick={() => navigate(to)} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[#F8FAFD] ${pathname.startsWith(to.split('?')[0]) && !to.includes('?') ? 'bg-[#F0F6FF]' : ''}`}>
                            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Icon size={16} /></span>
                            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1F1F1F]">{label}</span><span className="block text-xs text-[#5F6368]">{hint}</span></span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
