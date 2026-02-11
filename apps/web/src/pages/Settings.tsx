import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { integrationService, IntegrationStatus } from '../services/integration.service';
import {
    Settings as SettingsIcon,
    Link as LinkIcon,
    Unlink,
    CheckCircle,
    AlertCircle,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export const Settings: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<IntegrationStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activeTab = searchParams.get('tab') || 'integrations';

    useEffect(() => {
        loadStatus();

        const syncStatus = searchParams.get('status');
        if (syncStatus === 'success') {
            // Success notification or logic if needed
        } else if (syncStatus === 'error') {
            setError(searchParams.get('message') || 'Failed to connect to QuickBooks');
        }
    }, [searchParams]);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const data = await integrationService.getStatus();
            setStatus(data);
        } catch (err: any) {
            console.error('Failed to load status:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            setActionLoading(true);
            const url = await integrationService.getConnectUrl();
            window.location.href = url;
        } catch (err: any) {
            setError(err.message);
            setActionLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('Are you sure you want to disconnect QuickBooks? Expenses will no longer be automatically synced.')) return;

        try {
            setActionLoading(true);
            await integrationService.disconnect();
            await loadStatus();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="flex items-center space-x-3 mb-8">
                    <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600">
                        <SettingsIcon className="h-6 w-6" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                </div>

                <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex border-b border-gray-100">
                        <button
                            className={`px-6 py-4 text-sm font-bold transition-colors ${activeTab === 'profile' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => { }}
                        >
                            Profile
                        </button>
                        <button
                            className={`px-6 py-4 text-sm font-bold transition-colors ${activeTab === 'integrations' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Integrations
                        </button>
                    </div>

                    <div className="p-8">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                            </div>
                        ) : error ? (
                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start text-red-700">
                                <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Error</p>
                                    <p className="text-sm opacity-90">{error}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center space-x-4">
                                        <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100">
                                            <img src="https://quickbooks.intuit.com/oidam/intuit/sbseg/en_us/quickbooks/logos/intuit-quickbooks-logo.png" alt="QuickBooks" className="h-8 object-contain" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">QuickBooks Online</h3>
                                            <p className="text-sm text-gray-500">Sync expenses and chart of accounts automatically.</p>
                                        </div>
                                    </div>

                                    {status?.connected ? (
                                        <div className="flex items-center space-x-3">
                                            <span className="flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">
                                                <CheckCircle className="h-3 w-3 mr-1.5" />
                                                Connected
                                            </span>
                                            <button
                                                onClick={handleDisconnect}
                                                disabled={actionLoading}
                                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                                title="Disconnect"
                                            >
                                                <Unlink className="h-5 w-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleConnect}
                                            disabled={actionLoading}
                                            className="inline-flex items-center px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
                                        >
                                            <LinkIcon className="h-4 w-4 mr-2" />
                                            {actionLoading ? 'Connecting...' : 'Connect QuickBooks'}
                                        </button>
                                    )}
                                </div>

                                {status?.connected && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Company ID (Realm ID)</span>
                                            <span className="text-sm font-bold text-gray-700">{status.details?.realm_id}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Last Synced</span>
                                            <span className="text-sm font-bold text-gray-700">
                                                {status.details?.updated_at ? new Date(status.details.updated_at).toLocaleString() : 'Never'}
                                            </span>
                                        </div>
                                        <div className="md:col-span-2 pt-4 border-t border-gray-200">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900">Automatic Syncing</h4>
                                                    <p className="text-xs text-gray-500">Completed transactions will be automatically posted as expenses in QuickBooks.</p>
                                                </div>
                                                <div className="flex items-center text-xs font-bold text-indigo-600">
                                                    Enabled
                                                    <div className="ml-3 h-5 w-10 bg-indigo-600 rounded-full relative">
                                                        <div className="absolute right-0.5 top-0.5 h-4 w-4 bg-white rounded-full shadow-sm"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-8 border-t border-gray-100">
                                    <h4 className="text-lg font-bold text-gray-900 mb-4">How it works</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <div className="h-8 w-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold">1</div>
                                            <h5 className="font-bold text-sm">Link Account</h5>
                                            <p className="text-xs text-gray-500 leading-relaxed">Securely connect your QuickBooks Online company using OAuth 2.0.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="h-8 w-8 bg-green-50 text-green-600 rounded-lg flex items-center justify-center font-bold">2</div>
                                            <h5 className="font-bold text-sm">Map Accounts</h5>
                                            <p className="text-xs text-gray-500 leading-relaxed">Link your local petty cash categories to QuickBooks expense accounts.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="h-8 w-8 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center font-bold">3</div>
                                            <h5 className="font-bold text-sm">Auto-Expense</h5>
                                            <p className="text-xs text-gray-500 leading-relaxed">When a requisition is completed, we post the actual expenditure directly to QB.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex justify-center">
                    <a
                        href="https://sandbox.qbo.intuit.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                        Access QuickBooks Sandbox
                        <ExternalLink className="h-3 w-3 ml-1.5" />
                    </a>
                </div>
            </div>
        </Layout>
    );
};
