import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings, LogOut, Menu, BarChart3, Navigation, Inbox, Sparkles, User } from 'lucide-react';
import { TopNavbar } from './TopNavbar';
import { SubNavbar } from './SubNavbar';

interface LayoutProps {
    children: React.ReactNode;
    backgroundColor?: string;
    noPadding?: boolean;
    title?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, backgroundColor = 'bg-[#F5FAFF]', noPadding = false, title }) => {
    const { user, userRole, signOut } = useAuth();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const isRequestor = userRole === 'REQUESTOR';

    const getPageTitle = () => {
        if (title) return title;
        const path = location.pathname;
        if (path === '/' || path === '/requisitions') return 'Inbox';
        if (path === '/cashbook') return 'Wallet';
        if (path === '/reporting') return 'Budgets & Reporting';
        if (path === '/intelligence') return 'Business Intelligence';
        if (path === '/audit') return 'Audit';
        if (path === '/settings') return 'Settings';
        if (path === '/menu') return 'Menu';
        if (path === '/requisitions/new') return 'New Request';
        if (path === '/approvals') return 'Approvals';
        if (path === '/disbursements') return 'Disbursements';
        if (path.startsWith('/vouchers')) return 'Vouchers';
        return 'MoneyWise';
    };

    return (
        <div className={`min-h-screen ${backgroundColor} flex flex-col font-sans`}>
            {/* Desktop Navigation */}
            <div className="hidden md:block sticky top-0 z-30">
                <TopNavbar />
                <SubNavbar />
            </div>

            {/* Mobile Header */}
            <div className="md:hidden sticky top-0 z-20">
                <div className="bg-[#F5FAFF] px-6 py-4 flex items-center justify-between backdrop-blur-md bg-opacity-80">
                    <h1 className="text-[28px] font-black text-brand-navy tracking-tight">
                        {getPageTitle()}
                    </h1>
                    <button
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
                                <p className="text-sm font-black text-brand-navy truncate">{user?.email}</p>
                                <div className="flex items-center mt-1">
                                    <div className="h-1.5 w-1.5 rounded-full bg-brand-green mr-1.5"></div>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                                        {userRole}
                                    </p>
                                </div>
                            </div>
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
            <main className={`flex-1 overflow-x-hidden overflow-y-auto pb-24 md:pb-0 ${isRequestor ? 'h-screen' : 'h-[calc(100vh-60px)] md:h-screen'}`}>
                <div className={noPadding ? 'w-full h-full' : 'max-w-[1440px] mx-auto px-4 md:px-12 py-4 md:py-8'}>
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around z-40 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                {[
                    { path: '/requisitions', icon: Navigation, label: 'Inbox', isActive: (p: string) => p === '/requisitions' || p === '/' },
                    { path: '/cashbook', icon: Inbox, label: 'Wallet', isActive: (p: string) => p === '/cashbook' },
                    { path: '/intelligence', icon: Sparkles, label: 'BI', isActive: (p: string) => p === '/intelligence' },
                    { path: '/reporting', icon: BarChart3, label: 'Reporting', isActive: (p: string) => p === '/reporting' },
                    { path: '/menu', icon: Menu, label: 'Menu', isActive: (p: string) => ['/menu', '/settings', '/audit', '/approvals', '/disbursements'].some(prefix => p.startsWith(prefix)) || p.startsWith('/vouchers') }
                ].map((tab, idx) => {
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
    );
};
