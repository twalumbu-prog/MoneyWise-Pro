import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrgDetail from './pages/OrgDetail';

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
                </Routes>
            </BrowserRouter>
        </AdminAuthProvider>
    );
}
