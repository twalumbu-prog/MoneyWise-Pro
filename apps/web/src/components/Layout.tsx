import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, FileText, CheckCircle, FileSpreadsheet, Settings, LogOut, Wallet, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, userRole, signOut } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleSignOut = async () => {
        await signOut();
    };

    const isRequestor = userRole === 'REQUESTOR';

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
            {/* Mobile Header - Hide for Requestors */}
            {!isRequestor && (
                <div className="md:hidden bg-white shadow-sm p-4 flex items-center justify-between sticky top-0 z-20">
                    <div>
                        <h1 className="text-xl font-bold text-indigo-600">AE&CF</h1>
                        <p className="text-[10px] text-gray-500">Cashflow Management</p>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-gray-600 hover:text-indigo-600 p-1"
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
                <div className="fixed inset-0 z-10 bg-gray-600 bg-opacity-50 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
            )}

            {/* Mobile Navigation Drawer - Hide for Requestors */}
            {!isRequestor && (
                <div
                    className={`fixed inset-y-0 left-0 z-20 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    <div className="flex flex-col h-full">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-indigo-600">AE&CF</h1>
                                <p className="text-xs text-gray-500 mt-1">Cashflow Management</p>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-500">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <nav className="flex-1 overflow-y-auto py-4">
                            <Link
                                to="/"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <Home className="h-5 w-5 mr-3" />
                                Dashboard
                            </Link>
                            <Link
                                to="/requisitions"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <FileText className="h-5 w-5 mr-3" />
                                Requisitions
                            </Link>
                            <Link
                                to="/approvals"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <CheckCircle className="h-5 w-5 mr-3" />
                                Approvals
                            </Link>
                            <Link
                                to="/vouchers"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <FileSpreadsheet className="h-5 w-5 mr-3" />
                                Vouchers
                            </Link>
                            <Link
                                to="/disbursements"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <FileSpreadsheet className="h-5 w-5 mr-3" />
                                Disbursements
                            </Link>
                            <Link
                                to="/cashbook"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <Wallet className="h-5 w-5 mr-3" />
                                Cash Ledger
                            </Link>
                            <Link
                                to="/cashbook/reconcile"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <Wallet className="h-5 w-5 mr-3" />
                                Cash Reconciliation
                            </Link>
                            <Link
                                to="/settings"
                                className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <Settings className="h-5 w-5 mr-3" />
                                Settings
                            </Link>
                        </nav>

                        <div className="p-6 bg-gray-50 border-t border-gray-200">
                            <div className="mb-4">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {user?.email}
                                </p>
                                <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-0.5">
                                    {userRole || 'Loading...'}
                                </p>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
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
                <aside className="hidden md:block w-64 bg-white shadow-md relative">
                    <div className="p-6">
                        <h1 className="text-2xl font-bold text-indigo-600">AE&CF</h1>
                        <p className="text-xs text-gray-500 mt-1">Cashflow Management</p>
                    </div>
                    <nav className="mt-6">
                        <Link
                            to="/"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <Home className="h-5 w-5 mr-3" />
                            Dashboard
                        </Link>
                        <Link
                            to="/requisitions"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <FileText className="h-5 w-5 mr-3" />
                            Requisitions
                        </Link>
                        <Link
                            to="/approvals"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <CheckCircle className="h-5 w-5 mr-3" />
                            Approvals
                        </Link>
                        <Link
                            to="/vouchers"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <FileSpreadsheet className="h-5 w-5 mr-3" />
                            Vouchers
                        </Link>
                        <Link
                            to="/disbursements"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <FileSpreadsheet className="h-5 w-5 mr-3" />
                            Disbursements
                        </Link>
                        <Link
                            to="/cashbook"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <Wallet className="h-5 w-5 mr-3" />
                            Cash Ledger
                        </Link>
                        <Link
                            to="/cashbook/reconcile"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <Wallet className="h-5 w-5 mr-3" />
                            Cash Reconciliation
                        </Link>
                        <Link
                            to="/settings"
                            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <Settings className="h-5 w-5 mr-3" />
                            Settings
                        </Link>
                    </nav>
                    <div className="absolute bottom-0 w-64 p-6 bg-gray-50 border-t border-gray-200">
                        <div className="mb-4">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {user?.email}
                            </p>
                            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-0.5">
                                {userRole || 'Loading...'}
                            </p>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                        >
                            <LogOut className="h-4 w-4 mr-3" />
                            Sign Out
                        </button>
                    </div>
                </aside>
            )}

            {/* Main Content */}
            <div className={`flex-1 flex flex-col overflow-hidden ${isRequestor ? 'h-screen' : 'h-[calc(100vh-60px)] md:h-screen'}`}>
                {/* Page Content */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};
