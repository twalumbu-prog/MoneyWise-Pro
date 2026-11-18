import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { usePersonalAccount } from './hooks/usePersonalAccount';
import { onboardingService } from './services/onboarding.service';
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Onboarding = React.lazy(() => import('./pages/Onboarding').then(m => ({ default: m.Onboarding })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const MarketplaceListing = React.lazy(() => import('./pages/MarketplaceListing').then(m => ({ default: m.MarketplaceListing })));
const MarketplaceOrders = React.lazy(() => import('./pages/MarketplaceOrders').then(m => ({ default: m.MarketplaceOrders })));
const MarketplaceCategory = React.lazy(() => import('./pages/MarketplaceCategory').then(m => ({ default: m.MarketplaceCategory })));
const MarketplaceFood = React.lazy(() => import('./pages/MarketplaceFood').then(m => ({ default: m.MarketplaceFood })));
const MarketplaceStores = React.lazy(() => import('./pages/MarketplaceStores').then(m => ({ default: m.MarketplaceStores })));
const MarketplaceServices = React.lazy(() => import('./pages/MarketplaceServices').then(m => ({ default: m.MarketplaceServices })));
const MarketplaceImported = React.lazy(() => import('./pages/MarketplaceImported').then(m => ({ default: m.MarketplaceImported })));
const MarketplaceImportedItem = React.lazy(() => import('./pages/MarketplaceImportedItem').then(m => ({ default: m.MarketplaceImportedItem })));
const MarketplaceImportOrders = React.lazy(() => import('./pages/MarketplaceImportOrders').then(m => ({ default: m.MarketplaceImportOrders })));
const MarketplaceCompare = React.lazy(() => import('./pages/MarketplaceCompare').then(m => ({ default: m.MarketplaceCompare })));
const MarketplacePlan = React.lazy(() => import('./pages/MarketplacePlan').then(m => ({ default: m.MarketplacePlan })));
const MarketplaceRequests = React.lazy(() => import('./pages/MarketplaceRequests').then(m => ({ default: m.MarketplaceRequests })));
const MarketplacePriceDesk = React.lazy(() => import('./pages/MarketplacePriceDesk').then(m => ({ default: m.MarketplacePriceDesk })));
const ImportsDesk = React.lazy(() => import('./pages/ImportsDesk').then(m => ({ default: m.ImportsDesk })));
const Loans = React.lazy(() => import('./pages/Loans').then(m => ({ default: m.Loans })));
const LoansDemo = React.lazy(() => import('./pages/LoansDemo').then(m => ({ default: m.LoansDemo })));
const FundPrices = React.lazy(() => import('./pages/invest/FundPrices').then(m => ({ default: m.FundPrices })));
const MarketplaceAds = React.lazy(() => import('./pages/MarketplaceAds').then(m => ({ default: m.MarketplaceAds })));
const MarketplacePayLater = React.lazy(() => import('./pages/MarketplacePayLater').then(m => ({ default: m.MarketplacePayLater })));
const MarketplaceStore = React.lazy(() => import('./pages/MarketplaceStore').then(m => ({ default: m.MarketplaceStore })));
const MarketplaceCheckout = React.lazy(() => import('./pages/MarketplaceCheckout').then(m => ({ default: m.MarketplaceCheckout })));
const Marketplace = React.lazy(() => import('./pages/Marketplace').then(m => ({ default: m.Marketplace })));
const KycProfile = React.lazy(() => import('./pages/KycProfile').then(m => ({ default: m.KycProfile })));
const InvestAccounts = React.lazy(() => import('./pages/InvestAccounts').then(m => ({ default: m.InvestAccounts })));
const RewardsManage = React.lazy(() => import('./pages/RewardsManage').then(m => ({ default: m.RewardsManage })));
const ManualEntry = React.lazy(() => import('./pages/ManualEntry').then(m => ({ default: m.ManualEntry })));
const Budgets = React.lazy(() => import('./pages/Budgets').then(m => ({ default: m.Budgets })));
const Savings = React.lazy(() => import('./pages/Savings').then(m => ({ default: m.Savings })));
const SavingsDetail = React.lazy(() => import('./pages/SavingsDetail').then(m => ({ default: m.SavingsDetail })));
const PersonalSend = React.lazy(() => import('./pages/PersonalSend').then(m => ({ default: m.PersonalSend })));
const PersonalHome = React.lazy(() => import('./pages/PersonalHome').then(m => ({ default: m.PersonalHome })));
const RequisitionList = React.lazy(() => import('./pages/RequisitionList').then(m => ({ default: m.RequisitionList })));
const RequisitionCreate = React.lazy(() => import('./pages/RequisitionCreate').then(m => ({ default: m.RequisitionCreate })));
const NewSale = React.lazy(() => import('./pages/NewSale').then(m => ({ default: m.NewSale })));
const Approvals = React.lazy(() => import('./pages/Approvals').then(m => ({ default: m.Approvals })));
const CashierDashboard = React.lazy(() => import('./pages/CashierDashboard').then(m => ({ default: m.CashierDashboard })));
const Vouchers = React.lazy(() => import('./pages/Vouchers').then(m => ({ default: m.Vouchers })));
const VoucherDetail = React.lazy(() => import('./pages/VoucherDetail').then(m => ({ default: m.VoucherDetail })));
const CashLedger = React.lazy(() => import('./pages/CashLedger'));
const Suppliers = React.lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const Reporting = React.lazy(() => import('./pages/Reporting').then(m => ({ default: m.Reporting })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const ProductsServices = React.lazy(() => import('./pages/ProductsServices').then(m => ({ default: m.ProductsServices })));
const Intelligence = React.lazy(() => import('./pages/Intelligence').then(m => ({ default: m.Intelligence })));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const DeleteAccount = React.lazy(() => import('./pages/DeleteAccount').then(m => ({ default: m.DeleteAccount })));
const Support = React.lazy(() => import('./pages/Support').then(m => ({ default: m.Support })));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const PaidReturn = React.lazy(() => import('./pages/PaidReturn').then(m => ({ default: m.PaidReturn })));
const Disconnect = React.lazy(() => import('./pages/Disconnect').then(m => ({ default: m.Disconnect })));
const Join = React.lazy(() => import('./pages/Join').then(m => ({ default: m.Join })));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Audit = React.lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit })));
const Menu = React.lazy(() => import('./pages/Menu').then(m => ({ default: m.Menu })));
const Apps = React.lazy(() => import('./pages/Apps').then(m => ({ default: m.Apps })));
const Payroll = React.lazy(() => import('./pages/Payroll').then(m => ({ default: m.Payroll })));
const CRM = React.lazy(() => import('./pages/CRM').then(m => ({ default: m.CRM })));
const RunPayrollPage = React.lazy(() => import('./pages/RunPayrollPage').then(m => ({ default: m.RunPayrollPage })));
const PublicStore = React.lazy(() => import('./pages/PublicPay').then(m => ({ default: m.PublicPay })));
const PayEntry = React.lazy(() => import('./pages/PayEntry').then(m => ({ default: m.PayEntry })));
const SavingsJoin = React.lazy(() => import('./pages/SavingsJoin').then(m => ({ default: m.SavingsJoin })));
const PublicInvoiceLink = React.lazy(() => import('./pages/PublicInvoiceLink').then(m => ({ default: m.PublicInvoiceLink })));
const PublicPaymentLink = React.lazy(() => import('./pages/PublicPaymentLink').then(m => ({ default: m.PublicPaymentLink })));
const Schedules = React.lazy(() => import('./pages/Schedules').then(m => ({ default: m.Schedules })));
const InvestHome = React.lazy(() => import('./pages/invest/InvestHome').then(m => ({ default: m.InvestHome })));
const InvestCompany = React.lazy(() => import('./pages/invest/InvestCompany').then(m => ({ default: m.InvestCompany })));
const InvestProductDetail = React.lazy(() => import('./pages/invest/InvestProductDetail').then(m => ({ default: m.InvestProductDetail })));
const Rewards = React.lazy(() => import('./pages/Rewards').then(m => ({ default: m.Rewards })));
const PayRequest = React.lazy(() => import('./pages/PayRequest').then(m => ({ default: m.PayRequest })));
/** A tap-to-pay link opened while signed out: remembered so the person lands on it after signing in. */
const TAP_RETURN_KEY = 'mw_tap_return';
const ApiDocs = React.lazy(() => import('./pages/ApiDocs').then(m => ({ default: m.ApiDocs })));
import { CompleteProfile } from './pages/CompleteProfile';
import { OAuthAuthorize, OAUTH_RETURN_KEY } from './pages/OAuthAuthorize';
import { Loader2 } from 'lucide-react';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { RealtimeCacheSync } from './components/RealtimeCacheSync';
import { ReferralClaimer } from './components/ReferralClaimer';
import { REWARDS_SIGNUP_KEY } from './lib/rewardClaims';
import { UpdatePrompt } from './components/UpdatePrompt';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { session, loading, userStatus, signOut } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#0B57D0]" />
            </div>
        );
    }

    if (!session) {
        // A connecting app sent the user here: resume the consent screen after login.
        if (location.pathname === '/oauth/authorize') {
            try { sessionStorage.setItem(OAUTH_RETURN_KEY, location.pathname + location.search); } catch { /* storage unavailable */ }
        }
        if (location.pathname.startsWith('/r/')) {
            try { sessionStorage.setItem(TAP_RETURN_KEY, location.pathname); } catch { /* storage unavailable */ }
        }
        return <Navigate to="/login" />;
    }

    if (userStatus === 'PENDING_APPROVAL') {
        return (
            <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center">
                    <div className="mx-auto w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
                        <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                    </div>
                    <h1 className="text-3xl font-bold text-[#1F1F1F] mb-4">Pending Approval</h1>
                    <p className="text-gray-600 mb-8">
                        Your request to join the organization has been submitted. Please wait for an administrator to approve your account.
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="w-full py-4 bg-gray-100 text-[#1F1F1F] font-bold rounded-2xl hover:bg-gray-200 transition-all shadow-sm"
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
    const { userRole, userStatus, organizationId, userOrganizations, organizationsLoaded } = useAuth();
    const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
    const { isPersonal } = usePersonalAccount();

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

    // Back from "Sign up with Google to redeem your rewards" on a store: straight to Rewards (it sets up the personal account).
    try {
        if (localStorage.getItem(REWARDS_SIGNUP_KEY) === '1') return <Navigate to="/rewards?welcome=1" replace />;
    } catch { /* storage unavailable */ }

    try {
        const pendingTap = sessionStorage.getItem(TAP_RETURN_KEY);
        if (pendingTap && /^\/r\/[A-Za-z0-9]{10}$/.test(pendingTap)) {
            sessionStorage.removeItem(TAP_RETURN_KEY);
            return <Navigate to={pendingTap} replace />;
        }
    } catch { /* storage unavailable */ }

    try {
        const pendingOAuth = sessionStorage.getItem(OAUTH_RETURN_KEY);
        if (pendingOAuth && pendingOAuth.startsWith('/oauth/authorize')) {
            return <Navigate to={pendingOAuth} replace />;
        }
    } catch { /* storage unavailable */ }

    // Signed in with Google/Apple but no organization yet → choose personal or business first.
    if (organizationsLoaded && !userOrganizations.some((uo: any) => uo.status === 'ACTIVE' || !uo.status)) {
        return <Navigate to="/complete-profile" replace />;
    }

    if (needsOnboarding === null) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#0B57D0]" />
            </div>
        );
    }

    if (needsOnboarding) {
        return <Navigate to="/onboarding" replace />;
    }

    // Requestors work from their inbox; everyone else lands on the Home dashboard (the inbox is one click away).
    if (userRole === 'REQUESTOR') {
        return <Navigate to="/requisitions" replace />;
    }

    // A personal account's first screen is Home; businesses land on the business dashboard.
    if (isPersonal) return <PersonalHome />;

    return <Dashboard />;
};

// MoneyWise Pro is a client-side-routed SPA (react-router, no full page
// reloads between screens). <SpeedInsights/>'s Web Vitals collection is tied
// to the browser's real navigation event, which only fires once per hard
// load — without this, a user could navigate the whole app for an hour and
// only ever report ONE measurement. Passing `route` re-triggers collection on
// every in-app navigation, so it needs useLocation() and must live inside
// <Router>, not in main.tsx (which found b/c only 1 LCP + 3 FCP/TTFB/CLS
// datapoints were recorded across an entire real user session on 2026-07-10).
const SpeedInsightsRouteTracker: React.FC = () => {
    const location = useLocation();
    return <SpeedInsights route={location.pathname} />;
};

import { AchievementsProvider } from './context/AchievementsContext';

function App() {
    return (
        <AuthProvider>
            {/* Live cross-device cache invalidation (no-op while signed out) */}
            <RealtimeCacheSync />
            <ReferralClaimer />
            <Router>
                <AchievementsProvider>
                    <SpeedInsightsRouteTracker />
                    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#0B57D0]" /></div>}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfile /></ProtectedRoute>} />
                        <Route path="/join" element={<Join />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/delete-account" element={<DeleteAccount />} />
                        <Route path="/support" element={<Support />} />
                        <Route path="/terms" element={<TermsOfService />} />
                        <Route path="/disconnect" element={<Disconnect />} />
                        <Route path="/paid" element={<PaidReturn />} />
                        <Route path="/pay/:wallet_id" element={<PayEntry />} />
                        <Route path="/r/:code" element={<ProtectedRoute><PayRequest /></ProtectedRoute>} />
                        {/* Friendly store link: /<business-username>/store → that org's Main wallet catalogue */}
                        <Route path="/:username/store" element={<PublicStore />} />
                        <Route path="/:username/store/:walletSlug" element={<PublicStore />} />
                        <Route path="/pl/:token" element={<PublicPaymentLink />} />
                        {/* Short invoice link: /<business-code>/invoice/<n> */}
                        <Route path="/:code/invoice/:no" element={<PublicInvoiceLink />} />
                        <Route path="/savings/join/:code" element={<SavingsJoin />} />
                        <Route path="/docs/api" element={<ApiDocs />} />
                        <Route path="/oauth/authorize" element={<ProtectedRoute><OAuthAuthorize /></ProtectedRoute>} />
                        <Route path="/api-docs" element={<Navigate to="/docs/api" replace />} />
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
                        <Route path="/marketplace/c/:main" element={<ProtectedRoute><MarketplaceCategory /></ProtectedRoute>} />
                        <Route path="/marketplace/c/:main/:sub" element={<ProtectedRoute><MarketplaceCategory /></ProtectedRoute>} />
                        <Route path="/marketplace/food" element={<ProtectedRoute><MarketplaceFood /></ProtectedRoute>} />
                        <Route path="/marketplace/stores" element={<ProtectedRoute><MarketplaceStores /></ProtectedRoute>} />
                        <Route path="/marketplace/services" element={<ProtectedRoute><MarketplaceServices /></ProtectedRoute>} />
                        <Route path="/marketplace/compare" element={<ProtectedRoute><MarketplaceCompare /></ProtectedRoute>} />
                        <Route path="/marketplace/compare/:slug" element={<ProtectedRoute><MarketplaceCompare /></ProtectedRoute>} />
                        <Route path="/marketplace/plan" element={<ProtectedRoute><MarketplacePlan /></ProtectedRoute>} />
                        <Route path="/marketplace/requests" element={<ProtectedRoute><MarketplaceRequests /></ProtectedRoute>} />
                        <Route path="/marketplace/requests/:id" element={<ProtectedRoute><MarketplaceRequests /></ProtectedRoute>} />
                        <Route path="/marketplace/price-desk" element={<ProtectedRoute><MarketplacePriceDesk /></ProtectedRoute>} />
                        <Route path="/marketplace/import-desk" element={<ProtectedRoute><ImportsDesk /></ProtectedRoute>} />
                        <Route path="/invest/prices" element={<ProtectedRoute><FundPrices /></ProtectedRoute>} />
                        <Route path="/loans" element={<ProtectedRoute><Loans /></ProtectedRoute>} />
                        <Route path="/loans/demo" element={<ProtectedRoute><LoansDemo /></ProtectedRoute>} />
                        <Route path="/marketplace/imported" element={<ProtectedRoute><MarketplaceImported /></ProtectedRoute>} />
                        <Route path="/marketplace/imported/orders" element={<ProtectedRoute><MarketplaceImportOrders /></ProtectedRoute>} />
                        <Route path="/marketplace/imported/:id" element={<ProtectedRoute><MarketplaceImportedItem /></ProtectedRoute>} />
                        <Route path="/marketplace/ads" element={<ProtectedRoute><MarketplaceAds /></ProtectedRoute>} />
                        <Route path="/marketplace/pay-later"element={<ProtectedRoute><MarketplacePayLater /></ProtectedRoute>} />
                        <Route path="/marketplace/orders"element={<ProtectedRoute><MarketplaceOrders /></ProtectedRoute>} />
                        <Route path="/marketplace/store/:orgId" element={<ProtectedRoute><MarketplaceStore /></ProtectedRoute>} />
                        <Route path="/marketplace/checkout/:productId" element={<ProtectedRoute><MarketplaceCheckout /></ProtectedRoute>} />
                        <Route
                            path="/marketplace/:id"
                            element={
                                <ProtectedRoute>
                                    <MarketplaceListing />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/marketplace"
                            element={
                                <ProtectedRoute>
                                    <Marketplace />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invest/kyc"
                            element={
                                <ProtectedRoute>
                                    <KycProfile />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invest/accounts"
                            element={
                                <ProtectedRoute>
                                    <InvestAccounts />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/rewards/manage"
                            element={
                                <ProtectedRoute>
                                    <RewardsManage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/manual-entry"
                            element={
                                <ProtectedRoute>
                                    <ManualEntry />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/budgets"
                            element={
                                <ProtectedRoute>
                                    <Budgets />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/savings"
                            element={
                                <ProtectedRoute>
                                    <Savings />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/savings/:id"
                            element={
                                <ProtectedRoute>
                                    <SavingsDetail />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/send"
                            element={
                                <ProtectedRoute>
                                    <PersonalSend />
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
                            path="/products"
                            element={
                                <ProtectedRoute>
                                    <ProductsServices />
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
                        <Route
                            path="/apps"
                            element={
                                <ProtectedRoute>
                                    <Apps />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/apps/payroll"
                            element={
                                <ProtectedRoute>
                                    <Payroll />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/apps/crm"
                            element={
                                <ProtectedRoute>
                                    <CRM />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/apps/suppliers"
                            element={
                                <ProtectedRoute>
                                    <Suppliers />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/apps/payroll/run"
                            element={
                                <ProtectedRoute>
                                    <RunPayrollPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/schedules"
                            element={
                                <ProtectedRoute>
                                    <Schedules />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/rewards"
                            element={
                                <ProtectedRoute>
                                    <Rewards />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invest"
                            element={
                                <ProtectedRoute>
                                    <InvestHome />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invest/company/:id"
                            element={
                                <ProtectedRoute>
                                    <InvestCompany />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invest/product/:id"
                            element={
                                <ProtectedRoute>
                                    <InvestProductDetail />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </React.Suspense>
                <UpdatePrompt />
                <PWAInstallPrompt />
                </AchievementsProvider>
            </Router>
        </AuthProvider>
    );
}

export default App;
