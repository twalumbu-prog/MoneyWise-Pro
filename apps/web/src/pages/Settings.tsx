import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { integrationService, IntegrationStatus } from '../services/integration.service';
import { accountService, Account } from '../services/account.service';
import {
    Settings as SettingsIcon,
    Users,
    FileText,
    Share2,
    CheckCircle,
    AlertCircle,
    ExternalLink,
    RefreshCw,
    ArrowRightLeft,
    ArrowDownToLine,
    BrainCircuit
} from 'lucide-react';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { UserManagement } from '../components/settings/UserManagement';
import { ChartOfAccounts } from '../components/settings/ChartOfAccounts';
import { RuleManagement } from '../components/settings/RuleManagement';
import { AIMetrics } from '../components/settings/AIMetrics';
import { Layout } from '../components/Layout';

export const Settings: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general');

    // Integration State
    const [status, setStatus] = useState<IntegrationStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [qbAccounts, setQbAccounts] = useState<any[]>([]);
    const [localAccounts, setLocalAccounts] = useState<Account[]>([]);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'integrations') {
            loadIntegrationData();
        }

        // Handle OAuth callback params
        const syncStatus = searchParams.get('status');
        if (syncStatus === 'success' || syncStatus === 'error') {
            setActiveTab('integrations');
            if (syncStatus === 'error') {
                setError(searchParams.get('message') || 'Failed to connect');
            }
        }
    }, [activeTab, searchParams]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ tab });
        setError(null);
    };

    const loadIntegrationData = async () => {
        try {
            setLoading(true);

            // Load status and local accounts
            const [statusData, accountsData] = await Promise.all([
                integrationService.getStatus(),
                accountService.getAll()
            ]);

            setStatus(statusData);
            setLocalAccounts(accountsData);

            // If connected, load QB accounts
            if (statusData.connected) {
                const qbData = await integrationService.getAccounts();
                setQbAccounts(qbData);
            }
        } catch (err: any) {
            console.error('Failed to load integration data:', err);
            setError('Failed to load integration status');
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
        if (!window.confirm('Are you sure you want to disconnect QuickBooks?')) return;
        try {
            setActionLoading(true);
            await integrationService.disconnect();
            await loadIntegrationData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleImport = async () => {
        try {
            setActionLoading(true);
            const result = await accountService.importFromQuickBooks();
            alert(result.message);
            await loadIntegrationData(); // Reload accounts
        } catch (err: any) {
            alert('Failed to import accounts: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleMapAccount = async (localAccountId: string, qbAccountId: string) => {
        try {
            setSaving(localAccountId);
            await accountService.update(localAccountId, { qb_account_id: qbAccountId });

            // Update local state
            setLocalAccounts(prev => prev.map(acc =>
                acc.id === localAccountId
                    ? { ...acc, qb_account_id: qbAccountId } as any
                    : acc
            ));
        } catch (err: any) {
            alert('Failed to save mapping: ' + err.message);
        } finally {
            setSaving(null);
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-brand-navy">Settings</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Manage your organization, team members, and integrations.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Navigation */}
                    <nav className="lg:w-64 flex-shrink-0">
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('general')}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === 'general'
                                    ? 'bg-brand-green/10 text-brand-green'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <SettingsIcon className="flex-shrink-0 -ml-1 mr-3 h-5 w-5" />
                                <span className="truncate">General</span>
                            </button>

                            <button
                                onClick={() => handleTabChange('users')}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === 'users'
                                    ? 'bg-brand-green/10 text-brand-green'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Users className="flex-shrink-0 -ml-1 mr-3 h-5 w-5" />
                                <span className="truncate">Team Members</span>
                            </button>

                            <button
                                onClick={() => handleTabChange('coa')}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === 'coa'
                                    ? 'bg-brand-green/10 text-brand-green'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <FileText className="flex-shrink-0 -ml-1 mr-3 h-5 w-5" />
                                <span className="truncate">Chart of Accounts</span>
                            </button>

                            <button
                                onClick={() => handleTabChange('integrations')}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === 'integrations'
                                    ? 'bg-brand-green/10 text-brand-green'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Share2 className="flex-shrink-0 -ml-1 mr-3 h-5 w-5" />
                                <span className="truncate">Integrations</span>
                            </button>

                            <button
                                onClick={() => handleTabChange('automation')}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === 'automation'
                                    ? 'bg-brand-green/10 text-brand-green'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <BrainCircuit className="flex-shrink-0 -ml-1 mr-3 h-5 w-5" />
                                <span className="truncate">AI & Automation</span>
                            </button>
                        </div>
                    </nav>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0">
                        {/* General Tab */}
                        {activeTab === 'general' && <GeneralSettings />}

                        {/* Users Tab */}
                        {activeTab === 'users' && <UserManagement />}

                        {/* Chart of Accounts Tab */}
                        {activeTab === 'coa' && <ChartOfAccounts />}

                        {/* Integrations Tab */}
                        {activeTab === 'integrations' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-bold text-brand-navy">Integrations</h3>
                                        <p className="text-sm text-gray-500">Manage connections to external services.</p>
                                    </div>
                                </div>

                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center">
                                        <AlertCircle className="h-4 w-4 mr-2" />
                                        {error}
                                    </div>
                                )}

                                <div className="bg-white shadow-sm rounded-xl border border-gray-200 divide-y divide-gray-200">
                                    <div className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-4">
                                                <div className="h-12 w-12 bg-[#2CA01C] rounded-lg flex items-center justify-center text-white font-bold text-xl">
                                                    qb
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-bold text-gray-900">QuickBooks Online</h4>
                                                    <p className="text-sm text-gray-500">Sync expenses and chart of accounts</p>
                                                </div>
                                            </div>
                                            <div>
                                                {loading ? (
                                                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                                                ) : status?.connected ? (
                                                    <div className="flex items-center space-x-4">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            <CheckCircle className="w-3 h-3 mr-1" />
                                                            Connected
                                                        </span>
                                                        <button
                                                            onClick={handleDisconnect}
                                                            disabled={actionLoading}
                                                            className="text-sm text-red-600 hover:text-red-900 font-medium"
                                                        >
                                                            Disconnect
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={handleConnect}
                                                        disabled={actionLoading}
                                                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-[#2CA01C] hover:bg-[#238914] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2CA01C] disabled:opacity-50"
                                                    >
                                                        <ExternalLink className="h-4 w-4 mr-2" />
                                                        Connect
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {status?.connected && (
                                            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-500">
                                                <div>
                                                    <span className="font-medium text-gray-700">Company:</span> {status.companyName}
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-700">Last Sync:</span>{' '}
                                                    {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="px-6 py-4 flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Automatic Syncing</h4>
                                                <p className="text-xs text-gray-500">Completed transactions will be automatically posted as expenses in QuickBooks.</p>
                                            </div>
                                            <div className="flex items-center text-xs font-bold text-brand-green">
                                                Enabled
                                                <div className="ml-3 h-5 w-10 bg-brand-green rounded-full relative">
                                                    <div className="absolute right-0.5 top-0.5 h-4 w-4 bg-white rounded-full shadow-sm"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-6 py-4 bg-gray-50 flex items-center space-x-3">
                                        <button
                                            onClick={handleImport}
                                            disabled={actionLoading}
                                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:opacity-50"
                                        >
                                            <ArrowDownToLine className="h-4 w-4 mr-2" />
                                            {actionLoading ? 'Importing...' : 'Import from QuickBooks'}
                                        </button>
                                    </div>
                                </div>

                                {/* Chart of Accounts Mapping */}
                                {status?.connected && (
                                    <div className="pt-8 border-t border-gray-100">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-brand-navy flex items-center">
                                                    <ArrowRightLeft className="h-5 w-5 mr-2 text-brand-green" />
                                                    Chart of Accounts Mapping
                                                </h3>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Map your local expense categories to QuickBooks accounts to ensure correct accounting.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                                                            Local Account
                                                        </th>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                                                            Status
                                                        </th>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                                                            QuickBooks Account (Expense/Liability)
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {localAccounts.filter(a => a.type === 'EXPENSE').map((account: any) => (
                                                        <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    <div className="flex-shrink-0 h-8 w-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs border border-blue-100">
                                                                        {account.code}
                                                                    </div>
                                                                    <div className="ml-4">
                                                                        <div className="text-sm font-bold text-gray-900">{account.name}</div>
                                                                        <div className="text-xs text-gray-500">{account.type}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {account.qb_account_id ? (
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        Mapped
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                                        Unmapped
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center space-x-2">
                                                                    <select
                                                                        value={account.qb_account_id || ''}
                                                                        onChange={(e) => handleMapAccount(account.id, e.target.value)}
                                                                        disabled={saving === account.id}
                                                                        className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-green focus:border-brand-green sm:text-sm rounded-md border"
                                                                    >
                                                                        <option value="">-- Select QuickBooks Account --</option>
                                                                        {qbAccounts
                                                                            .filter((qa: any) => ['Expense', 'Other Expense', 'Cost of Goods Sold', 'Other Current Liability', 'Accounts Payable', 'Credit Card'].includes(qa.AccountType) || qa.Classification === 'Expense' || qa.Classification === 'Liability')
                                                                            .sort((a: any, b: any) => a.Name.localeCompare(b.Name))
                                                                            .map((qa: any) => (
                                                                                <option key={qa.Id} value={qa.Id}>
                                                                                    {qa.Name} ({qa.AccountType})
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                    {saving === account.id && (
                                                                        <RefreshCw className="h-4 w-4 animate-spin text-brand-green" />
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AI & Automation Tab */}
                        {activeTab === 'automation' && (
                            <div className="space-y-12">
                                <AIMetrics />
                                <div className="border-t border-gray-100 pt-12">
                                    <RuleManagement />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
};
