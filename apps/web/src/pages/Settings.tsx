import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QuickBooksIntegration } from '../components/settings/integrations/QuickBooksIntegration';
import { LencoIntegration } from '../components/settings/integrations/LencoIntegration';
import { MasterfeesIntegration } from '../components/settings/integrations/MasterfeesIntegration';
import {
    Settings as SettingsIcon,
    Users,
    FileText,
    Share2,
    User,
    GraduationCap,
    CreditCard
} from 'lucide-react';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { UserManagement } from '../components/settings/UserManagement';
import { ChartOfAccounts } from '../components/settings/ChartOfAccounts';
import { MyProfileSettings } from '../components/settings/MyProfileSettings';
import { SubscriptionBilling } from '../components/settings/SubscriptionBilling';
import { Layout } from '../components/Layout';

export const Settings: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');

    const [activeIntegration, setActiveIntegration] = useState<'quickbooks' | 'lenco' | 'masterfees' | null>(null);
    const [integrationError, setIntegrationError] = useState<string | null>(null);

    useEffect(() => {
        // Handle QuickBooks OAuth callback params (?status=success|error)
        const syncStatus = searchParams.get('status');
        if (syncStatus === 'success' || syncStatus === 'error') {
            setActiveTab('integrations');
            setActiveIntegration('quickbooks');
            if (syncStatus === 'error') {
                setIntegrationError(searchParams.get('message') || 'Failed to connect');
            }
            return;
        }
        // Handle Master Fees OAuth callback params (?mf_status=success|error)
        const mfStatus = searchParams.get('mf_status');
        if (mfStatus === 'success' || mfStatus === 'error') {
            setActiveTab('integrations');
            setActiveIntegration('masterfees');
            if (mfStatus === 'error') {
                setIntegrationError(searchParams.get('mf_message') || 'Master Fees connection failed');
            }
        }
    }, [searchParams]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ tab });
        setIntegrationError(null);
        setActiveIntegration(null);
    };

    return (
        <Layout noPadding>
            <div className="flex-1 h-full p-4 bg-slate-100 flex flex-col justify-start items-start w-full overflow-hidden">
                <div className="self-stretch flex-1 flex justify-start items-start gap-2.5 w-full overflow-hidden">
                    <div className="flex-1 h-full p-3.5 bg-white rounded-[20px] flex flex-col justify-start items-center gap-7 overflow-hidden shadow-sm w-full">
                        <div className="self-stretch h-full flex flex-col justify-start items-center gap-3 w-full">

                            {/* Header */}
                            <div className="self-stretch flex justify-between items-center w-full flex-shrink-0">
                                <div className="flex justify-start items-center gap-2">
                                    <SettingsIcon className="w-4 h-4 text-gray-900" />
                                    <div className="justify-center text-gray-900 text-base font-semibold font-['DM_Sans'] leading-5">Settings</div>
                                </div>
                            </div>

                            {/* Tabs Row */}
                            <div className="self-stretch flex-shrink-0 overflow-x-auto no-scrollbar">
                                <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px] min-w-max">
                                    {[
                                        { id: 'general', label: 'General Settings', icon: <SettingsIcon className="w-2.5 h-2.5" /> },
                                        { id: 'profile', label: 'My Profile', icon: <User className="w-2.5 h-2.5" /> },
                                        { id: 'users', label: 'Team Members', icon: <Users className="w-2.5 h-2.5" /> },
                                        { id: 'coa', label: 'Chart of Accounts', icon: <FileText className="w-2.5 h-2.5" /> },
                                        { id: 'integrations', label: 'Integrations', icon: <Share2 className="w-2.5 h-2.5" /> },
                                        { id: 'billing', label: 'Subscription & Billing', icon: <CreditCard className="w-2.5 h-2.5" /> }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabChange(tab.id)}
                                            className={`px-3.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                                activeTab === tab.id
                                                    ? 'font-bold bg-white text-[#111827] shadow-sm'
                                                    : 'font-normal text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {tab.icon}
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Main Content Area */}
                            <div className={`self-stretch flex-1 bg-white rounded-xl outline outline-1 outline-offset-[-1px] outline-violet-100 flex flex-col justify-start items-start w-full ${activeTab === 'billing' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                                <div className={`w-full p-4 sm:p-6 min-w-0 ${activeTab === 'billing' ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : 'flex-1'}`}>
                                    {/* Profile Tab */}
                                    {activeTab === 'profile' && <MyProfileSettings />}

                                    {/* General Tab */}
                                    {activeTab === 'general' && <GeneralSettings />}

                                    {/* Users Tab */}
                                    {activeTab === 'users' && <UserManagement />}

                                    {/* Chart of Accounts Tab */}
                                    {activeTab === 'coa' && <ChartOfAccounts />}

                                    {/* Integrations Tab */}
                                    {activeTab === 'integrations' && (
                                        <div className="space-y-6">
                                            {!activeIntegration ? (
                                                <>
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <h3 className="text-lg font-bold text-brand-navy">Integrations</h3>
                                                            <p className="text-sm text-gray-500">Manage connections to external services.</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* QuickBooks Card */}
                                                        <button
                                                            onClick={() => setActiveIntegration('quickbooks')}
                                                            className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-green/30 transition-all text-left group"
                                                        >
                                                            <div className="h-12 w-12 bg-[#2CA01C] rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4 group-hover:scale-105 transition-transform shadow-sm">
                                                                qb
                                                            </div>
                                                            <h4 className="text-base font-bold text-gray-900 mb-1">QuickBooks Online</h4>
                                                            <p className="text-sm text-gray-500">Sync expenses and chart of accounts</p>
                                                        </button>

                                                        {/* Lenco Card */}
                                                        <button
                                                            onClick={() => setActiveIntegration('lenco')}
                                                            className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-pink/30 transition-all text-left group"
                                                        >
                                                            <div className="h-12 w-12 bg-brand-pink rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4 group-hover:scale-105 transition-transform shadow-sm">
                                                                L
                                                            </div>
                                                            <h4 className="text-base font-bold text-gray-900 mb-1">Lenco Banking</h4>
                                                            <p className="text-sm text-gray-500">Manage corporate wallets and transfers</p>
                                                        </button>

                                                        {/* Master Fees Card */}
                                                        <button
                                                            onClick={() => setActiveIntegration('masterfees')}
                                                            className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-navy/30 transition-all text-left group"
                                                        >
                                                            <div className="h-12 w-12 bg-brand-navy rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-105 transition-transform shadow-sm">
                                                                <GraduationCap className="h-6 w-6" />
                                                            </div>
                                                            <h4 className="text-base font-bold text-gray-900 mb-1">Master Fees</h4>
                                                            <p className="text-sm text-gray-500">Sync school invoices, fee revenue &amp; receivables</p>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : activeIntegration === 'quickbooks' ? (
                                                <QuickBooksIntegration
                                                    onBack={() => setActiveIntegration(null)}
                                                    initialError={integrationError}
                                                />
                                            ) : activeIntegration === 'masterfees' ? (
                                                <MasterfeesIntegration
                                                    onBack={() => setActiveIntegration(null)}
                                                    initialError={integrationError}
                                                />
                                            ) : (
                                                <LencoIntegration
                                                    onBack={() => setActiveIntegration(null)}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Subscription & Billing Tab */}
                                    {activeTab === 'billing' && <SubscriptionBilling />}


                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};
