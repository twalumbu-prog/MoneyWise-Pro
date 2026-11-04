import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    House,
    Inbox,
    CalendarDays,
    TrendingUp,
    ShieldCheck,
    ShoppingBag,
    Grid3x3,
    Share2,
    HelpCircle,
    Settings as SettingsIcon,
    PanelLeftClose,
    PanelLeftOpen,
    LogOut,
    Store,
    LineChart,
    Landmark,
    PiggyBank,
} from 'lucide-react';
import { WalletCardsIcon, AstroidIcon } from './icons/BrandIcons';
import { useAuth, NotificationCounts } from '../context/AuthContext';
import { usePersonalAccount } from '../hooks/usePersonalAccount';

interface NavItem {
    label: string;
    path: string;
    icon: React.ComponentType<any>;
    isActive: (pathname: string, search: string) => boolean;
    disabled?: boolean;
    getBadge?: (counts: NotificationCounts) => number;
    tourTarget?: string;
}

const PLAN_ITEM: NavItem = { label: 'Plan', path: '/savings', icon: PiggyBank, isActive: (p) => p.startsWith('/savings') || p === '/budgets' || p.startsWith('/rewards') };
const HOME_ITEM: NavItem = { label: 'Home', path: '/', icon: House, isActive: (p) => p === '/' };

const GENERAL_ITEMS: NavItem[] = [
    {
        label: 'Inbox',
        path: '/requisitions',
        icon: Inbox,
        isActive: (p) => p === '/requisitions' || p === '/',
        getBadge: (c) => c.requisitions + c.approvals + c.disbursements + c.vouchers,
    },
    { label: 'Schedules', path: '/schedules', icon: CalendarDays, isActive: (p) => p === '/schedules', tourTarget: 'nav-schedules-tab' },
    {
        label: 'Wallets',
        path: '/cashbook',
        icon: WalletCardsIcon,
        isActive: (p) => p === '/cashbook',
        getBadge: (c) => c.wallets,
    },
    { label: 'Reporting', path: '/reporting', icon: TrendingUp, isActive: (p) => p === '/reporting' },
    { label: 'Business Intelligence', path: '/intelligence', icon: AstroidIcon, isActive: (p) => p === '/intelligence', tourTarget: 'nav-bi-tab' },
    { label: 'Audit', path: '/audit', icon: ShieldCheck, isActive: (p) => p === '/audit' },
];

const SUPPORT_ITEMS: NavItem[] = [
    { label: 'Apps', path: '/apps', icon: Grid3x3, isActive: (p) => p.startsWith('/apps') },
    { label: 'Integrations', path: '/settings?tab=integrations', icon: Share2, isActive: (p, s) => p === '/settings' && s.includes('tab=integrations') },
    { label: 'Products & Services', path: '/products', icon: ShoppingBag, isActive: (p) => p === '/products' },
    { label: 'Customer Care & Help', path: '#', icon: HelpCircle, isActive: () => false, disabled: true },
    {
        label: 'Settings',
        path: '/settings',
        icon: SettingsIcon,
        isActive: (p, s) => p === '/settings' && !s.includes('tab=integrations'),
        getBadge: (c) => c.settings,
        tourTarget: 'nav-settings',
    },
];

const SERVICES_ITEMS: NavItem[] = [
    { label: 'Marketplace', path: '/marketplace', icon: Store, isActive: (p) => p.startsWith('/marketplace') },
    { label: 'Invest', path: '/invest', icon: LineChart, isActive: (p) => p.startsWith('/invest') },
    { label: 'Loans', path: '/loans', icon: Landmark, isActive: (p) => p.startsWith('/loans') },
];

const COLLAPSE_KEY = 'moneywise:sidebarCollapsed';

const SidebarLink: React.FC<{ item: NavItem; active: boolean; collapsed: boolean; badge?: number }> = ({ item, active, collapsed, badge }) => {
    const Icon = item.icon;
    const showBadge = !!badge && badge > 0;
    const badgeLabel = badge && badge > 9 ? '9+' : String(badge ?? 0);

    const content = (
        <>
            {/* Icon — with a tiny dot overlay when collapsed */}
            <span className="relative flex-shrink-0">
                <Icon size={15} className={active ? 'text-[#041E49]' : 'text-[#5F6368]'} />
                {collapsed && showBadge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#B3261D] border border-[#F8FAFD]" />
                )}
            </span>

            {!collapsed && (
                <span className={`truncate ${active ? 'font-semibold text-[#041E49]' : 'font-medium text-[#3C4043]'}`}>
                    {item.label}
                </span>
            )}
            {!collapsed && item.disabled && (
                <span className="ml-auto text-[8px] font-bold text-gray-300 uppercase tracking-wider">Soon</span>
            )}
            {/* Numeric badge — expanded sidebar only */}
            {!collapsed && showBadge && (
                <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B3261D] text-white text-[10px] font-bold leading-none flex items-center justify-center tabular-nums">
                    {badgeLabel}
                </span>
            )}
        </>
    );

    const className = `flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] transition-colors ${collapsed ? 'justify-center' : ''} ${
        item.disabled
            ? 'text-gray-300 cursor-not-allowed'
            : active
                ? 'bg-[#D3E3FD] text-[#041E49]'
                : 'hover:bg-[#1F1F1F]/[0.07] text-gray-600'
    }`;

    if (item.disabled) {
        return (
            <div className={className} title={collapsed ? `${item.label} (coming soon)` : undefined}>
                {content}
            </div>
        );
    }

    return (
        <Link
            to={item.path}
            className={className}
            title={collapsed ? item.label : undefined}
            {...(item.tourTarget ? { 'data-tour-target': item.tourTarget } : {})}
        >
            {content}
        </Link>
    );
};

export const Sidebar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { signOut, notificationCounts } = useAuth();
    // A personal account's first item is Home; the Inbox is behind its bell, so it moves out of the sidebar's lead spot.
    const { isPersonal } = usePersonalAccount();
    const generalItems = isPersonal ? [HOME_ITEM, ...GENERAL_ITEMS.map(i => i.label === 'Inbox' ? { ...i, isActive: (p: string) => p === '/requisitions' } : i).flatMap(i => i.label === 'Wallets' ? [i, PLAN_ITEM] : [i])] : GENERAL_ITEMS;
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem(COLLAPSE_KEY) === '1';
        } catch {
            return false;
        }
    });

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
            } catch {
                /* no-op — collapse state just won't persist across reloads */
            }
            return next;
        });
    };

    return (
        <aside
            className={`hidden md:flex md:flex-col md:h-screen flex-shrink-0 bg-[#F8FAFD] transition-[width] duration-200 ${
                collapsed ? 'md:w-[76px]' : 'md:w-64'
            }`}
        >
            {/* Logo row */}
            <div className={`h-14 flex items-center flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
                <Link to="/requisitions" className="flex items-center gap-2 overflow-hidden min-w-0">
                    <img src="/logo-mark.svg" alt="MoneyWise" className="h-4 w-auto flex-shrink-0" />
                    {!collapsed && (
                        <span className="font-advercase text-base font-normal text-[#1F1F1F] whitespace-nowrap truncate">
                            Moneywise
                        </span>
                    )}
                </Link>
                {!collapsed && (
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all flex-shrink-0"
                        aria-label="Collapse sidebar"
                        title="Collapse sidebar"
                    >
                        <PanelLeftClose size={16} />
                    </button>
                )}
            </div>

            {collapsed && (
                <div className="px-2 pb-1 flex justify-center flex-shrink-0">
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all"
                        aria-label="Expand sidebar"
                        title="Expand sidebar"
                    >
                        <PanelLeftOpen size={16} />
                    </button>
                </div>
            )}

            {/* Nav groups */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
                {!collapsed && (
                    <div className="px-2 pt-3 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        General
                    </div>
                )}
                <nav className={`flex flex-col gap-[3px] ${collapsed ? 'pt-3' : ''} mb-6`}>
                    {generalItems.map(item => (
                        <SidebarLink
                            key={item.path}
                            item={item}
                            collapsed={collapsed}
                            active={item.isActive(location.pathname, location.search)}
                            badge={item.getBadge ? item.getBadge(notificationCounts) : undefined}
                        />
                    ))}
                </nav>

                {!collapsed && (
                    <div className="px-2 pt-1 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Services
                    </div>
                )}
                <nav className="flex flex-col gap-[3px] mb-6">
                    {SERVICES_ITEMS.map(item => (
                        <SidebarLink
                            key={item.label}
                            item={item}
                            collapsed={collapsed}
                            active={item.isActive(location.pathname, location.search)}
                        />
                    ))}
                </nav>

                {!collapsed && (
                    <div className="px-2 pt-1 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Support
                    </div>
                )}
                <nav className="flex flex-col gap-[3px]">
                    {SUPPORT_ITEMS.map(item => (
                        <SidebarLink
                            key={item.label}
                            item={item}
                            collapsed={collapsed}
                            active={item.isActive(location.pathname, location.search)}
                            badge={item.getBadge ? item.getBadge(notificationCounts) : undefined}
                        />
                    ))}
                </nav>
            </div>

            <div className={`px-3 flex-shrink-0 ${collapsed ? 'px-2' : ''}`}>
                <button
                    type="button"
                    onClick={async () => {
                        await signOut();
                        navigate('/login');
                    }}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all ${collapsed ? 'justify-center' : ''}`}
                    title={collapsed ? 'Sign Out' : undefined}
                >
                    <LogOut size={15} className="text-gray-500" />
                    {!collapsed && <span className="truncate">Sign Out</span>}
                </button>
            </div>

            {!collapsed && (
                <div className="px-4 py-4 flex-shrink-0 text-center">
                    <p className="text-[8px] text-gray-400 leading-tight">
                        © All Rights Reserved 2026<br />Fee Master ltd.
                    </p>
                </div>
            )}
        </aside>
    );
};
