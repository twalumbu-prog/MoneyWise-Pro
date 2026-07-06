import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrgDetail from './pages/OrgDetail';
import WalletPool from './pages/WalletPool';
import TestCollections from './pages/TestCollections';

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
                </Routes>
            </BrowserRouter>
        </AdminAuthProvider>
    );
}
