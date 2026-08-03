import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Inbox,
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
} from 'lucide-react';
import { WalletCardsIcon, AstroidIcon } from './icons/BrandIcons';
import { useAuth } from '../context/AuthContext';

interface NavItem {
    label: string;
    path: string;
    icon: React.ComponentType<any>;
    isActive: (pathname: string, search: string) => boolean;
    /** No page built yet — rendered visible but inert, per the sidebar restructure plan. */
    disabled?: boolean;
}

const GENERAL_ITEMS: NavItem[] = [
    { label: 'Inbox', path: '/requisitions', icon: Inbox, isActive: (p) => p === '/requisitions' || p === '/' },
    { label: 'Wallets', path: '/cashbook', icon: WalletCardsIcon, isActive: (p) => p === '/cashbook' },
    { label: 'Reporting', path: '/reporting', icon: TrendingUp, isActive: (p) => p === '/reporting' },
    { label: 'Business Intelligence', path: '/intelligence', icon: AstroidIcon, isActive: (p) => p === '/intelligence' },
    { label: 'Audit', path: '/audit', icon: ShieldCheck, isActive: (p) => p === '/audit' },
    { label: 'Products & Services', path: '/products', icon: ShoppingBag, isActive: (p) => p === '/products' },
];

const SUPPORT_ITEMS: NavItem[] = [
    { label: 'Apps', path: '/apps', icon: Grid3x3, isActive: (p) => p.startsWith('/apps') },
    { label: 'Integrations', path: '/settings?tab=integrations', icon: Share2, isActive: (p, s) => p === '/settings' && s.includes('tab=integrations') },
    { label: 'Customer Care & Help', path: '#', icon: HelpCircle, isActive: () => false, disabled: true },
    { label: 'Settings', path: '/settings', icon: SettingsIcon, isActive: (p, s) => p === '/settings' && !s.includes('tab=integrations') },
];

const COLLAPSE_KEY = 'moneywise:sidebarCollapsed';

const SidebarLink: React.FC<{ item: NavItem; active: boolean; collapsed: boolean }> = ({ item, active, collapsed }) => {
    const Icon = item.icon;

    const content = (
        <>
            <Icon size={15} className={active ? 'text-[#0058DB]' : 'text-gray-500'} />
            {!collapsed && (
                <span className={`truncate ${active ? 'font-semibold text-[#111827]' : 'font-medium text-gray-600'}`}>
                    {item.label}
                </span>
            )}
            {!collapsed && item.disabled && (
                <span className="ml-auto text-[8px] font-bold text-gray-300 uppercase tracking-wider">Soon</span>
            )}
        </>
    );

    const className = `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] transition-all ${collapsed ? 'justify-center' : ''} ${
        item.disabled
            ? 'text-gray-300 cursor-not-allowed'
            : active
                ? 'bg-white shadow-[0px_2px_6px_0px_rgba(0,0,0,0.06)] outline outline-[1px] outline-[#E8EEF8]'
                : 'hover:bg-gray-100/60 text-gray-600'
    }`;

    if (item.disabled) {
        return (
            <div className={className} title={collapsed ? `${item.label} (coming soon)` : undefined}>
                {content}
            </div>
        );
    }

    return (
        <Link to={item.path} className={className} title={collapsed ? item.label : undefined}>
            {content}
        </Link>
    );
};

export const Sidebar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { signOut } = useAuth();
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
            className={`hidden md:flex md:flex-col md:h-screen flex-shrink-0 bg-[#F3F5FC] transition-[width] duration-200 ${
                collapsed ? 'md:w-[76px]' : 'md:w-64'
            }`}
        >
            {/* Logo row */}
            <div className={`h-14 flex items-center flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
                <Link to="/requisitions" className="flex items-center gap-2 overflow-hidden min-w-0">
                    <img src="/logo-mark.svg" alt="MoneyWise" className="h-4 w-auto flex-shrink-0" />
                    {!collapsed && (
                        <span className="font-advercase text-base font-normal text-[#111827] whitespace-nowrap truncate">
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
                    {GENERAL_ITEMS.map(item => (
                        <SidebarLink
                            key={item.path}
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
