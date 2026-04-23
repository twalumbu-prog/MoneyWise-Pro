import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, Settings, LogOut, Wallet, Menu, X, BarChart3, PieChart, ShieldCheck } from 'lucide-react';
import { TopNavbar } from './TopNavbar';
import { SubNavbar } from './SubNavbar';

interface LayoutProps {
    children: React.ReactNode;
    backgroundColor?: string;
    noPadding?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, backgroundColor = 'bg-[#F8F9FA]', noPadding = false }) => {
    const { user, userRole, signOut, organizationName, notificationCounts } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();

    const handleSignOut = async () => {
        await signOut();
    };

    const isRequestor = userRole === 'REQUESTOR';

    return (
        <div className={`min-h-screen ${backgroundColor} flex flex-col font-sans`}>
            {/* Desktop Navigation */}
            <div className="hidden md:block sticky top-0 z-30">
                <TopNavbar />
                <SubNavbar />
            </div>

            {/* Mobile Header */}
            <div className="md:hidden">
                <div className="bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-20 border-b border-gray-100">
                    <div>
                        <div className="flex items-center space-x-1">
                            <span className="text-[20px] font-bold text-brand-navy tracking-tight">MoneyWise</span>
                            <span className="text-[20px] font-bold text-[#006AFF] tracking-tight">Pro</span>
                        </div>
                        <p className="text-[12px] text-gray-400 font-medium tracking-tight mt-0.5">
                            {organizationName || 'Financial Control'}
                        </p>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-brand-navy p-1 transition-colors"
                    >
                        {isMobileMenuOpen ? (
                            <X className="h-7 w-7" />
                        ) : (
                            <Menu className="h-7 w-7" />
                        )}
                    </button>
                </div>

                {/* Full Screen Mobile Menu Overlay */}
                <div 
                    className={`fixed inset-0 z-[100] bg-white transform transition-transform duration-500 ease-in-out md:hidden ${
                        isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                >
                    <div className="flex flex-col h-full">
                        {/* Menu Header */}
                        <div className="p-6 flex items-center justify-between border-b border-gray-50">
                            <div>
                                <div className="flex items-center space-x-1">
                                    <span className="text-[20px] font-bold text-brand-navy tracking-tight">MoneyWise</span>
                                    <span className="text-[20px] font-bold text-[#006AFF] tracking-tight">Pro</span>
                                </div>
                                <p className="text-[12px] text-gray-400 font-medium tracking-tight mt-0.5">
                                    {organizationName || 'Financial Control'}
                                </p>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-brand-navy">
                                <X className="h-7 w-7" />
                            </button>
                        </div>

                        {/* Menu Items */}
                        <nav className="flex-1 overflow-y-auto py-8 px-6 space-y-2">
                            {[
                                { path: '/requisitions', icon: FileText, label: 'Inbox', count: notificationCounts?.requisitions },
                                { path: '/cashbook', icon: Wallet, label: 'Cash Ledger' },
                                { path: '/reporting', icon: BarChart3, label: 'Budgets & Reporting' },
                                { path: '/intelligence', icon: PieChart, label: 'Business Intelligence' },
                                { path: '/audit', icon: ShieldCheck, label: 'Audit' },
                                { path: '/settings', icon: Settings, label: 'Settings', count: notificationCounts?.settings },
                            ].map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center px-5 py-4 rounded-2xl transition-all group font-bold text-base ${
                                        location.pathname === item.path
                                        ? 'bg-[#F0F7FF] text-[#006AFF]'
                                        : 'text-gray-600 active:bg-gray-50'
                                    }`}
                                >
                                    <span className="flex-1">{item.label}</span>
                                    {item.count ? (
                                        <div className="px-2.5 py-0.5 rounded-full bg-[#006AFF] text-white text-[10px] font-black">
                                            {item.count}
                                        </div>
                                    ) : null}
                                </Link>
                            ))}
                        </nav>

                        {/* Menu Footer */}
                        <div className="p-8 border-t border-gray-50">
                            <div className="mb-8">
                                <p className="text-base font-bold text-brand-navy truncate">
                                    {user?.email}
                                </p>
                                <div className="flex items-center mt-1">
                                    <div className="h-2 w-2 rounded-full bg-brand-green mr-2"></div>
                                    <p className="text-[12px] text-gray-400 font-bold uppercase tracking-widest">
                                        {userRole}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center w-full px-6 py-4 text-base font-bold text-red-500 bg-red-50 rounded-2xl active:bg-red-100 transition-all"
                            >
                                <LogOut className="h-5 w-5 mr-4" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <main className={`flex-1 overflow-x-hidden overflow-y-auto ${isRequestor ? 'h-screen' : 'h-[calc(100vh-60px)] md:h-screen'}`}>
                {isRequestor && (
                    <header className="bg-white shadow-sm p-4 flex items-center justify-between z-20 border-b border-gray-100 shrink-0 px-6">
                        <div className="flex items-center">
                            <div>
                                <h1 className="text-lg font-bold text-brand-navy leading-tight">MoneyWise</h1>
                                <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">
                                    {organizationName || 'Financial Control'}
                                </p>
                            </div>
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="text-gray-500 hover:text-brand-green p-2 transition-colors rounded-lg hover:bg-gray-50 bg-white shadow-sm border border-gray-100"
                            >
                                {isMobileMenuOpen ? (
                                    <X className="h-5 w-5" />
                                ) : (
                                    <Menu className="h-5 w-5" />
                                )}
                            </button>

                            {isMobileMenuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-30"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                    ></div>
                                    <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden transform origin-top-right transition-all">
                                        <div className="p-5 border-b border-gray-50 bg-gray-50/50">
                                            <p className="text-sm font-bold text-brand-navy truncate">
                                                {user?.email}
                                            </p>
                                            <div className="flex items-center mt-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-brand-green mr-2"></div>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                    {userRole || 'Requestor'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-2">
                                            <button
                                                onClick={() => {
                                                    setIsMobileMenuOpen(false);
                                                    handleSignOut();
                                                }}
                                                className="flex items-center w-full px-4 py-3 text-sm font-bold text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors text-left"
                                            >
                                                <LogOut className="h-4 w-4 mr-3" />
                                                Sign Out
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </header>
                )}

                <div className={noPadding ? 'w-full h-full' : 'max-w-[1440px] mx-auto px-4 md:px-12 py-4 md:py-8'}>
                    {children}
                </div>
            </main>
        </div>
    );
};
