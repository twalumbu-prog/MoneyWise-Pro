import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { onboardingService } from './services/onboarding.service';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
// src/App.tsx unused Dashboard removed
import { RequisitionList } from './pages/RequisitionList';
import { RequisitionCreate } from './pages/RequisitionCreate';
import { NewSale } from './pages/NewSale';
import { Approvals } from './pages/Approvals';
import { CashierDashboard } from './pages/CashierDashboard';
// RequisitionDetail removed
import { Vouchers } from './pages/Vouchers';
import { VoucherDetail } from './pages/VoucherDetail';
import CashLedger from './pages/CashLedger';
import { Reporting } from './pages/Reporting';
import { Settings } from './pages/Settings';
import { Intelligence } from './pages/Intelligence';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Disconnect } from './pages/Disconnect';
import { Join } from './pages/Join';
import { ResetPassword } from './pages/ResetPassword';
import { Audit } from './pages/Audit';
import { Menu } from './pages/Menu';
import { PublicPay } from './pages/PublicPay';
import { PublicPaymentLink } from './pages/PublicPaymentLink';
import { Loader2 } from 'lucide-react';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { RealtimeCacheSync } from './components/RealtimeCacheSync';

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

// Orgs whose onboarding is known-finished this session — avoids re-checking on
// every visit to '/'. COMPLETED is terminal, so caching it is always safe.
const onboardingDoneCache = new Set<string>();

// Redirect requestors to requisitions page by default; send admins of
// organizations with unfinished onboarding back into the wizard. `needsOnboarding`
// is a tri-state (null = still determining) so this NEVER paints RequisitionList
// on a stale/uninitialized snapshot — the dashboard only renders once we've
// positively established the user doesn't need the wizard. This is what makes the
// post-signup transition into onboarding feel seamless instead of flashing the
// real dashboard for a frame first.
const HomeRedirect = () => {
    const { userRole, userStatus, organizationId } = useAuth();
    const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

    useEffect(() => {
        if (userStatus === 'PENDING_APPROVAL') return;
        if (!userRole) return; // AuthContext profile fetch hasn't resolved yet

        if (userRole !== 'ADMIN' || !organizationId) {
            setNeedsOnboarding(false);
            return;
        }
        if (onboardingDoneCache.has(organizationId)) {
            setNeedsOnboarding(false);
            return;
        }

        let cancelled = false;
        onboardingService.getState()
            .then(s => {
                if (cancelled) return;
                if (s.progress.status === 'COMPLETED') {
                    onboardingDoneCache.add(organizationId);
                    setNeedsOnboarding(false);
                } else {
                    setNeedsOnboarding(true);
                }
            })
            .catch(() => { if (!cancelled) setNeedsOnboarding(false); }) // on failure, let the user into the app
            ;
        return () => { cancelled = true; };
    }, [userRole, userStatus, organizationId]);

    if (userStatus === 'PENDING_APPROVAL') {
        // Handled by ProtectedRoute but just for safety
        return null;
    }

    if (needsOnboarding === null) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (needsOnboarding) {
        return <Navigate to="/onboarding" replace />;
    }

    if (userRole === 'REQUESTOR') {
        return <Navigate to="/requisitions" replace />;
    }

    return <RequisitionList />;
};

function App() {
    return (
        <AuthProvider>
            {/* Live cross-device cache invalidation (no-op while signed out) */}
            <RealtimeCacheSync />
            <Router>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/join" element={<Join />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/disconnect" element={<Disconnect />} />
                    <Route path="/pay/:wallet_id" element={<PublicPay />} />
                    <Route path="/pl/:token" element={<PublicPaymentLink />} />
                    <Route
                        path="/onboarding"
                        element={
                            <ProtectedRoute>
                                <Onboarding />
                            </ProtectedRoute>
                        }
                    />
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
                        path="/sales/new"
                        element={
                            <ProtectedRoute>
                                <NewSale />
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
                        path="/reporting"
                        element={
                            <ProtectedRoute>
                                <Reporting />
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
                    <Route
                        path="/intelligence"
                        element={
                            <ProtectedRoute>
                                <Intelligence />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/audit"
                        element={
                            <ProtectedRoute>
                                <Audit />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/menu"
                        element={
                            <ProtectedRoute>
                                <Menu />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
                <PWAInstallPrompt />
            </Router>
        </AuthProvider>
    );
}

export default App;
