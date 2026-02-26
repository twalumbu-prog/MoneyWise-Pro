import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { RequisitionList } from './pages/RequisitionList';
import { RequisitionCreate } from './pages/RequisitionCreate';
import { Approvals } from './pages/Approvals';
import { CashierDashboard } from './pages/CashierDashboard';
import { RequisitionDetail } from './pages/RequisitionDetail';
import { Vouchers } from './pages/Vouchers';
import { VoucherDetail } from './pages/VoucherDetail';
import CashLedger from './pages/CashLedger';
import { Settings } from './pages/Settings';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Disconnect } from './pages/Disconnect';
import { Join } from './pages/Join';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { session, loading, userStatus, signOut } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" />;
    }

    if (userStatus === 'PENDING_APPROVAL') {
        return (
            <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center">
                    <div className="mx-auto w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
                        <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                    </div>
                    <h1 className="text-3xl font-bold text-brand-navy mb-4">Pending Approval</h1>
                    <p className="text-gray-600 mb-8">
                        Your request to join the organization has been submitted. Please wait for an administrator to approve your account.
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="w-full py-4 bg-gray-100 text-brand-navy font-bold rounded-2xl hover:bg-gray-200 transition-all shadow-sm"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

// Redirect requestors to requisitions page by default
const HomeRedirect = () => {
    const { userRole, userStatus } = useAuth();

    if (userStatus === 'PENDING_APPROVAL') {
        // Handled by ProtectedRoute but just for safety
        return null;
    }

    if (userRole === 'REQUESTOR') {
        return <Navigate to="/requisitions" replace />;
    }

    return <Dashboard />;
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/join" element={<Join />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/disconnect" element={<Disconnect />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <HomeRedirect />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/requisitions"
                        element={
                            <ProtectedRoute>
                                <RequisitionList />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/requisitions/new"
                        element={
                            <ProtectedRoute>
                                <RequisitionCreate />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/approvals"
                        element={
                            <ProtectedRoute>
                                <Approvals />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/disbursements"
                        element={
                            <ProtectedRoute>
                                <CashierDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/requisitions/:id"
                        element={
                            <ProtectedRoute>
                                <RequisitionDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/vouchers"
                        element={
                            <ProtectedRoute>
                                <Vouchers />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/vouchers/:id"
                        element={
                            <ProtectedRoute>
                                <VoucherDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/cashbook"
                        element={
                            <ProtectedRoute>
                                <CashLedger />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute>
                                <Settings />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
