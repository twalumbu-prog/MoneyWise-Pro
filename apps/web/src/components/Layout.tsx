import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, FileText, CheckCircle, FileSpreadsheet, Settings, LogOut, Wallet, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, userRole, signOut, organizationName, notificationCounts } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const location = useLocation();

    const handleSignOut = async () => {
        await signOut();
    };

    const isRequestor = userRole === 'REQUESTOR';

    return (
        <div className="min-h-screen bg-brand-gray flex flex-col md:flex-row font-sans">
            {/* Mobile Header - Hide for Requestors */}
            {!isRequestor && (
                <div className="md:hidden bg-white shadow-sm p-4 flex items-center justify-between sticky top-0 z-20 border-b border-gray-100">
                    <div className="flex items-center">
                        <div className="h-8 w-8 bg-brand-navy rounded-lg flex items-center justify-center mr-2">
                            <Wallet className="h-5 w-5 text-brand-green" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-brand-navy leading-tight">MoneyWise</h1>
                            <p className="text-[10px] text-gray-500 font-medium tracking-wide">
                                {organizationName ? organizationName.toUpperCase() : 'PRO'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-gray-500 hover:text-brand-green p-1 transition-colors"
                    >
                        {isMobileMenuOpen ? (
                            <X className="h-6 w-6" />
                        ) : (
                            <Menu className="h-6 w-6" />
                        )}
                    </button>
                </div>
            )}

            {/* Mobile Menu Overlay - Hide for Requestors */}
            {!isRequestor && isMobileMenuOpen && (
                <div className="fixed inset-0 z-10 bg-brand-navy/20 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
            )}

            {/* Mobile Navigation Drawer - Hide for Requestors */}
            {!isRequestor && (
                <div
                    className={`fixed inset-y-0 left-0 z-20 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    <div className="flex flex-col h-full">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                            <div className="flex items-center">
                                <div className="h-8 w-8 bg-brand-navy rounded-lg flex items-center justify-center mr-3">
                                    <Wallet className="h-5 w-5 text-brand-green" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-brand-navy leading-tight">MoneyWise</h1>
                                    <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">
                                        {organizationName || 'Financial Control'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-400 hover:text-brand-navy">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
                            {[
                                { path: '/', icon: Home, label: 'Dashboard' },
                                { path: '/requisitions', icon: FileText, label: 'Requisitions', count: notificationCounts?.requisitions },
                                { path: '/approvals', icon: CheckCircle, label: 'Approvals', count: notificationCounts?.approvals },
                                { path: '/vouchers', icon: FileSpreadsheet, label: 'Vouchers', count: notificationCounts?.vouchers },
                                { path: '/disbursements', icon: FileSpreadsheet, label: 'Disbursements', count: notificationCounts?.disbursements },
                                { path: '/cashbook', icon: Wallet, label: 'Cash Ledger' },
                                { path: '/settings', icon: Settings, label: 'Settings', count: notificationCounts?.settings },
                            ].map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center px-4 py-3 rounded-xl transition-all group font-medium text-sm ${location.pathname === item.path
                                        ? 'bg-brand-green/10 text-brand-navy shadow-sm'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-brand-navy'
                                        }`}
                                >
                                    <item.icon className="h-5 w-5 mr-3 text-gray-400 group-hover:text-brand-green transition-colors flex-shrink-0" />
                                    <span className="flex-1 overflow-hidden whitespace-nowrap">{item.label}</span>
                                    {item.count ? (
                                        <div className="h-2 w-2 rounded-full bg-brand-green relative ml-auto">
                                            <div className="absolute inset-0 rounded-full bg-brand-green animate-ping opacity-75"></div>
                                        </div>
                                    ) : null}
                                </Link>
                            ))}
                        </nav>

                        <div className="p-6 border-t border-gray-50 bg-gray-50/50">
                            <div className="mb-4">
                                <p className="text-sm font-bold text-brand-navy truncate">
                                    {user?.email}
                                </p>
                                <div className="flex items-center mt-1">
                                    <div className="h-1.5 w-1.5 rounded-full bg-brand-green mr-2"></div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                        {userRole || 'Loading...'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center w-full px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-gray-100"
                            >
                                <LogOut className="h-4 w-4 mr-3" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Sidebar - Hide for Requestors */}
            {!isRequestor && (
                <aside className={`hidden md:flex flex-col bg-white border-r border-gray-100 sticky top-0 h-screen transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
                    <div className={`p-4 ${isSidebarCollapsed ? 'items-center justify-center' : 'p-8'} transition-all`}>
                        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                            <div className="h-10 w-10 bg-brand-navy rounded-xl flex items-center justify-center shadow-lg shadow-brand-navy/20 flex-shrink-0">
                                <Wallet className="h-6 w-6 text-brand-green" />
                            </div>
                            {!isSidebarCollapsed && (
                                <div className="overflow-hidden whitespace-nowrap">
                                    <h1 className="text-xl font-bold text-brand-navy leading-tight">MoneyWise</h1>
                                    <p className="text-[10px] text-gray-400 font-bold tracking-[0.2em] uppercase mt-0.5">
                                        {organizationName || 'Pro'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end pr-2 -mt-4 mb-2 relative z-10">
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="bg-white border border-gray-200 rounded-full p-1.5 text-gray-500 hover:text-brand-navy shadow-sm transition-colors hover:bg-gray-50"
                        >
                            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                        </button>
                    </div>

                    <nav className={`flex-1 overflow-y-auto px-3 space-y-1`}>
                        {!isSidebarCollapsed && (
                            <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 overflow-hidden whitespace-nowrap">Menu</p>
                        )}
                        {[
                            { path: '/', icon: Home, label: 'Dashboard' },
                            { path: '/requisitions', icon: FileText, label: 'Requisitions', count: notificationCounts?.requisitions },
                            { path: '/approvals', icon: CheckCircle, label: 'Approvals', count: notificationCounts?.approvals },
                            { path: '/vouchers', icon: FileSpreadsheet, label: 'Vouchers', count: notificationCounts?.vouchers },
                            { path: '/disbursements', icon: FileSpreadsheet, label: 'Disbursements', count: notificationCounts?.disbursements },
                            { path: '/cashbook', icon: Wallet, label: 'Cash Ledger' },
                            { path: '/settings', icon: Settings, label: 'Settings', count: notificationCounts?.settings },
                        ].map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={isSidebarCollapsed ? item.label : ''}
                                className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3 rounded-xl transition-all group font-medium text-sm ${location.pathname === item.path
                                    ? 'bg-brand-green/10 text-brand-navy shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-brand-navy'
                                    }`}
                            >
                                <item.icon
                                    className={`h-5 w-5 transition-colors flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'} ${location.pathname === item.path
                                        ? 'text-brand-green'
                                        : 'text-gray-400 group-hover:text-brand-green'
                                        }`}
                                />
                                {!isSidebarCollapsed && <span className="overflow-hidden whitespace-nowrap flex-1">{item.label}</span>}
                                {item.count ? (
                                    <div className={`h-2 w-2 rounded-full bg-brand-green relative ${isSidebarCollapsed ? 'absolute top-2 right-2' : 'ml-auto mt-1'}`}>
                                        <div className="absolute inset-0 rounded-full bg-brand-green animate-ping opacity-75"></div>
                                    </div>
                                ) : null}
                            </Link>
                        ))}
                    </nav>

                    <div className={`p-4 border-t border-gray-50 mt-auto ${isSidebarCollapsed ? 'items-center justify-center' : ''}`}>
                        <div className={`bg-brand-gray rounded-xl border border-gray-100 mb-3 ${isSidebarCollapsed ? 'p-2 flex justify-center' : 'p-4'}`}>
                            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between mb-2'}`}>
                                <div className="h-8 w-8 rounded-lg bg-brand-navy flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                    {(user?.email?.[0] || 'U').toUpperCase()}
                                </div>
                                {!isSidebarCollapsed && (
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2 ${userRole === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        {userRole}
                                    </div>
                                )}
                            </div>
                            {!isSidebarCollapsed && (
                                <p className="text-xs font-medium text-gray-900 truncate" title={user?.email || ''}>
                                    {user?.email}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleSignOut}
                            title={isSidebarCollapsed ? 'Sign Out' : ''}
                            className={`flex items-center w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'} py-2 text-xs font-bold text-gray-500 hover:text-red-600 transition-colors bg-transparent hover:bg-gray-50 rounded-lg`}
                        >
                            <LogOut className={`h-4 w-4 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                            {!isSidebarCollapsed && "Sign Out"}
                        </button>
                    </div>
                </aside>
            )}

            {/* Main Content */}
            <div className={`flex-1 flex flex-col overflow-hidden ${isRequestor ? 'h-screen' : 'h-[calc(100vh-60px)] md:h-screen'}`}>
                {/* Requestor Header */}
                {isRequestor && (
                    <header className="bg-white shadow-sm p-4 flex items-center justify-between z-20 border-b border-gray-100 shrink-0 px-6">
                        <div className="flex items-center">
                            <div className="h-8 w-8 bg-brand-navy rounded-lg flex items-center justify-center mr-3 shadow-sm">
                                <Wallet className="h-5 w-5 text-brand-green" />
                            </div>
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

                            {/* Dropdown Menu */}
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

                {/* Page Content */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-brand-gray p-6 md:p-8">
                    {children}


                </main>
            </div>
        </div>
    );
};
