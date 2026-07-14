import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrgDetail from './pages/OrgDetail';
import WalletPool from './pages/WalletPool';
import TestCollections from './pages/TestCollections';
import PaymentLinkAnalytics from './pages/PaymentLinkAnalytics';
import Logs from './pages/Logs';

export default function App() {
    return (
        <AdminAuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <Dashboard />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/org/:orgId"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <OrgDetail />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/wallet-pool"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <WalletPool />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/test-collections"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <TestCollections />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/analytics/payment-links"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <PaymentLinkAnalytics />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/logs"
                        element={
                            <ProtectedRoute>
                                <Layout>
                                    <Logs />
                                </Layout>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </BrowserRouter>
        </AdminAuthProvider>
    );
}
