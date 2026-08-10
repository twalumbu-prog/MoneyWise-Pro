import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings, LogOut, Menu, TrendingUp, Navigation, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { DesktopHeader } from './DesktopHeader';
import { WalletCardsIcon, AstroidIcon } from './icons/BrandIcons';

interface LayoutProps {
    children: React.ReactNode;
    backgroundColor?: string;
    noPadding?: boolean;
    title?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, backgroundColor = 'bg-[#F5FAFF]', noPadding = false, title }) => {
    const { user, userRole, signOut, userOrganizations, switchOrganization, organizationName, organizationId } = useAuth();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const isRequestor = userRole === 'REQUESTOR';
    const activeOrgs = userOrganizations.filter((uo: any) => uo.status === 'ACTIVE');

    const getPageTitle = () => {
        if (title) return title;
        const path = location.pathname;
        if (path === '/' || path === '/requisitions') return 'Inbox';
        if (path === '/cashbook') return 'Wallet';
        if (path === '/reporting') return isRequestor ? 'Portfolio' : 'Reports';
        if (path === '/intelligence') return 'Business Intelligence';
        if (path === '/audit') return 'Audit';
        if (path === '/products') return 'Products & Services';
        if (path === '/settings') return 'Settings';
        if (path === '/menu') return 'Menu';
        if (path === '/requisitions/new') return 'New Request';
        if (path === '/approvals') return 'Approvals';
        if (path === '/disbursements') return 'Disbursements';
        if (path.startsWith('/vouchers')) return 'Vouchers';
        if (path === '/schedules') return 'Schedules';
        if (path === '/apps') return 'Apps';
        if (path.startsWith('/apps/payroll/run')) return 'Run Payroll';
        if (path.startsWith('/apps/payroll')) return 'Payroll';
        if (path.startsWith('/invest')) return 'Invest';
        return 'MoneyWise';
    };

    return (
        <div className="min-h-screen md:h-screen md:flex md:overflow-hidden font-sans">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Right column: desktop header + content, or the full mobile stack.
                Desktop background is forced to #F3F5FC (the workspace canvas) with `!`
                so per-page backgroundColor props only steer the mobile view. The
                sidebar + header share this color so they sit seamlessly against it. */}
            <div className={`flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden ${backgroundColor} md:!bg-[#F3F5FC]`}>
            <DesktopHeader title={getPageTitle()} />

            {/* Mobile Header */}
            <div className="md:hidden sticky top-0 z-20">
                <div className={`${backgroundColor} px-6 py-4 flex items-center justify-between backdrop-blur-md bg-opacity-80`}>
                    <h1 className="font-advercase text-3xl font-normal text-black">
                        {getPageTitle()}
                    </h1>
                    <button
                        type="button"
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="h-10 w-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-400 overflow-hidden shadow-sm active:scale-95 transition-all"
                    >
                        <User size={20} />
                    </button>
                </div>

                {/* Profile Overlay */}
                {isProfileOpen && (
                    <>
                        <div 
                            className="fixed inset-0 z-[150] bg-brand-navy/20 backdrop-blur-xs transition-opacity" 
                            onClick={() => setIsProfileOpen(false)} 
                        />
                        <div className="fixed top-18 right-6 z-[160] w-64 bg-white rounded-3xl shadow-xl border border-gray-100 p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="pb-3 border-b border-gray-50 mb-3">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                                    Organization
                                </p>
                                <p className="text-sm font-black text-brand-navy truncate mb-3">{organizationName || 'No Organization'}</p>
                                
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                                    Profile
                                </p>
                                <p className="text-xs font-medium text-gray-500 truncate mb-1">{user?.email}</p>
                                <div className="flex items-center">
                                    <div className="h-1.5 w-1.5 rounded-full bg-brand-green mr-1.5"></div>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                                        {userRole}
                                    </p>
                                </div>
                            </div>
                            
                            {activeOrgs.length > 1 && (
                                <div className="pb-3 border-b border-gray-50 mb-3">
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
                                        Quick Switch Org
                                    </p>
                                    <div className="space-y-1 max-h-36 overflow-y-auto">
                                        {activeOrgs.map((uo: any) => {
                                            const isCurrent = uo.organization.id === organizationId;
                                            return (
                                                <button
                                                    key={uo.organization.id}
                                                    type="button"
                                                    disabled={isCurrent}
                                                    onClick={async () => {
                                                        setIsProfileOpen(false);
                                                        try {
                                                            await switchOrganization(uo.organization.id);
                                                        } catch (err) {
                                                            console.error('Failed to switch org on mobile:', err);
                                                        }
                                                    }}
                                                    className={`w-full text-left px-2.5 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                                                        isCurrent
                                                            ? 'text-brand-green bg-brand-green/5 font-bold'
                                                            : 'text-gray-500 hover:text-brand-navy hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <span className="truncate">{uo.organization.name}</span>
                                                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0 ml-1"></span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={() => {
                                    setIsProfileOpen(false);
                                    navigate('/settings');
                                }}
                                className="w-full flex items-center text-left py-2.5 text-xs font-bold text-gray-600 hover:text-brand-navy active:bg-gray-50 rounded-xl transition-all"
                            >
                                <Settings size={14} className="mr-2.5 text-gray-400" />
                                Settings
                            </button>
                            <button
                                onClick={async () => {
                                    setIsProfileOpen(false);
                                    await handleSignOut();
                                }}
                                className="w-full flex items-center text-left py-2.5 text-xs font-bold text-red-500 hover:text-red-600 active:bg-red-50 rounded-xl transition-all mt-1"
                            >
                                <LogOut size={14} className="mr-2.5 text-red-400" />
                                Sign Out
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Main Content Area */}
            <main className={`flex-1 overflow-x-hidden overflow-y-auto pb-28 md:pb-0 md:min-h-0 ${isRequestor ? 'h-screen md:h-auto' : 'h-[calc(100vh-60px)] md:h-auto'}`}>
                <div className={noPadding ? 'w-full h-full' : 'max-w-[1440px] mx-auto px-4 md:px-12 py-4 md:py-8'}>
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-[88px] bg-white border-t border-gray-100 flex items-center justify-around z-40 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                {[
                    { path: '/requisitions', icon: Navigation, label: 'Inbox', isActive: (p: string) => p === '/requisitions' || p === '/' },
                    { path: '/cashbook', icon: WalletCardsIcon, label: 'Wallet', isActive: (p: string) => p === '/cashbook', hide: isRequestor },
                    { path: '/intelligence', icon: AstroidIcon, label: 'BI', isActive: (p: string) => p === '/intelligence', hide: isRequestor },
                    { path: '/reporting', icon: TrendingUp, label: 'Reporting', isActive: (p: string) => p === '/reporting' },
                    { path: '/menu', icon: Menu, label: 'Menu', isActive: (p: string) => ['/menu', '/settings', '/audit', '/approvals', '/disbursements'].some(prefix => p.startsWith(prefix)) || p.startsWith('/vouchers') }
                ].filter(tab => !tab.hide).map((tab, idx) => {
                    const TabIcon = tab.icon;
                    const active = tab.isActive(location.pathname);
                    return (
                        <Link
                            key={idx}
                            to={tab.path}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                                active
                                    ? 'bg-[#F0F7FF] text-[#006AFF]'
                                    : 'text-gray-400 hover:text-gray-500 active:scale-95'
                            }`}
                            aria-label={tab.label}
                        >
                            <TabIcon size={22} className={active ? "fill-[#006AFF]/10" : ""} />
                        </Link>
                    );
                })}
            </div>
            </div>
        </div>
    );
};
