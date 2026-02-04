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
import CashReconciliation from './pages/CashReconciliation';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { session, loading } = useAuth();

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

    return <>{children}</>;
};

// Redirect requestors to requisitions page by default
const HomeRedirect = () => {
    const { userRole } = useAuth();

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
                        path="/cashbook/reconcile"
                        element={
                            <ProtectedRoute>
                                <CashReconciliation />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
