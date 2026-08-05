import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { QuickBooksIntegration } from '../components/settings/integrations/QuickBooksIntegration';
import { LencoIntegration } from '../components/settings/integrations/LencoIntegration';
import { MasterfeesIntegration } from '../components/settings/integrations/MasterfeesIntegration';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { UserManagement } from '../components/settings/UserManagement';
import { ChartOfAccounts } from '../components/settings/ChartOfAccounts';
import { RuleManagement } from '../components/settings/RuleManagement';
import { AIMetrics } from '../components/settings/AIMetrics';
import { MyProfileSettings } from '../components/settings/MyProfileSettings';
import {
    Settings,
    ShieldCheck,
    LogOut,
    User,
    ShoppingBag,
    Share2,
    Users,
    ChevronRight,
    ChevronLeft,
    GraduationCap,
    Plus,
} from 'lucide-react';

type MenuDetail = 'integrations' | 'profile' | 'general' | 'users' | 'other' | null;

export const Menu: React.FC = () => {
    const navigate = useNavigate();
    const { user, userRole, organizationName, signOut } = useAuth();

    // Which full-screen detail panel (if any) is currently open.
    const [detail, setDetail] = useState<MenuDetail>(null);
    const [activeIntegration, setActiveIntegration] = useState<'quickbooks' | 'lenco' | 'masterfees' | null>(null);

    // Ref to open the Add Member modal from the navbar button
    const openAddMemberRef = useRef<(() => void) | null>(null);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const getPosition = (role: string | null) => {
        if (!role) return 'User';
        switch (role.toUpperCase()) {
            case 'ADMIN': return 'Administrator';
            case 'ACCOUNTANT': return 'Senior Accountant';
            case 'CASHIER': return 'Financial Cashier';
            case 'REQUESTOR': return 'Staff Member';
            default: return role;
        }
    };

    const closeDetail = () => {
        setDetail(null);
        setActiveIntegration(null);
    };

    const OPTIONS_ITEMS = [
        {
            id: 'audit',
            label: 'Audit Log',
            description: 'Compliance & audit history',
            icon: ShieldCheck,
            onClick: () => navigate('/audit'),
            show: true,
        },
        {
            id: 'products',
            label: 'Products & Services',
            description: 'Catalog, pricing & payment links',
            icon: ShoppingBag,
            onClick: () => navigate('/products'),
            show: true,
        },
        {
            id: 'integrations',
            label: 'Integrations',
            description: 'QuickBooks, Lenco & Master Fees',
            icon: Share2,
            onClick: () => setDetail('integrations'),
            show: userRole === 'ADMIN',
        },
    ].filter(item => item.show);

    const SETTINGS_ITEMS = [
        {
            id: 'profile',
            label: 'My Profile',
            description: 'Your account & preferences',
            icon: User,
            onClick: () => setDetail('profile'),
            show: true,
        },
        {
            id: 'general',
            label: 'General Settings',
            description: 'Organization & departments',
            icon: Settings,
            onClick: () => setDetail('general'),
            show: userRole === 'ADMIN',
        },
        {
            id: 'users',
            label: 'Team Members',
            description: 'Manage staff access',
            icon: Users,
            onClick: () => setDetail('users'),
            show: userRole === 'ADMIN',
        },
    ].filter(item => item.show);

    const detailTitle =
        detail === 'profile' ? 'My Profile' :
        detail === 'general' ? 'General Settings' :
        detail === 'users' ? 'Team Members' :
        detail === 'integrations' ? 'Integrations' :
        detail === 'other' ? 'Other Settings' : '';

    return (
        <Layout noPadding={false} backgroundColor="bg-[#F9FAFB]">
            <div className="max-w-md mx-auto space-y-4 pb-24 md:pb-0">
                {/* Profile / business card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
                        <User size={26} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black text-brand-navy truncate">
                            {organizationName || 'My Business'}
                        </h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            {getPosition(userRole)}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-1">
                            {user?.email}
                        </p>
                    </div>
                </div>

                {/* Options card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
                    <div className="text-neutral-900 text-base font-bold mb-2">Options</div>
                    <div className="divide-y divide-gray-50">
                        {OPTIONS_ITEMS.map(item => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    onClick={item.onClick}
                                    className="w-full flex items-center gap-4 py-3.5 text-left active:bg-gray-50 rounded-xl transition-colors -mx-1 px-1"
                                >
                                    <div className="p-2.5 rounded-2xl bg-white text-[#006AFF] flex-shrink-0">
                                        <Icon size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-black text-sm font-bold">{item.label}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Settings card */}
                {SETTINGS_ITEMS.length > 0 && (
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
                        <div className="text-neutral-900 text-base font-bold mb-2">Settings</div>
                        <div className="divide-y divide-gray-50">
                            {SETTINGS_ITEMS.map(item => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={item.onClick}
                                        className="w-full flex items-center gap-4 py-3.5 text-left active:bg-gray-50 rounded-xl transition-colors -mx-1 px-1"
                                    >
                                        <div className="p-2.5 rounded-2xl bg-white text-[#006AFF] flex-shrink-0">
                                            <Icon size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-black text-sm font-bold">{item.label}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Sign Out Button */}
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center px-6 py-4 bg-red-50 text-red-600 rounded-3xl font-bold text-sm active:bg-red-100 transition-all border border-red-100/50 shadow-sm"
                >
                    <LogOut size={16} className="mr-3" />
                    Sign Out
                </button>
            </div>

            {/* Full-screen detail panel */}
            {detail && (
                <div className="fixed inset-0 z-[80] bg-white flex flex-col">
                    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                        <button
                            onClick={closeDetail}
                            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:scale-95 transition-all flex-shrink-0"
                            aria-label="Back"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <h1 className="text-base font-bold text-black truncate flex-1">{detailTitle}</h1>
                        {detail === 'users' && userRole === 'ADMIN' && (
                            <button
                                onClick={() => openAddMemberRef.current?.()}
                                className="flex-shrink-0 h-8 pl-3 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                            >
                                <Plus size={14} className="text-white" />
                                <span className="text-white text-xs font-bold">Add Member</span>
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        {detail === 'profile' && <MyProfileSettings />}
                        {detail === 'general' && <GeneralSettings />}
                        {detail === 'users' && (
                            <UserManagement onRequestAdd={(open) => { openAddMemberRef.current = open; }} />
                        )}
                        {detail === 'other' && (
                            <div className="space-y-10">
                                <div>
                                    <h3 className="text-base font-bold text-brand-navy mb-3">Chart of Accounts</h3>
                                    <ChartOfAccounts />
                                </div>
                                <div className="border-t border-gray-100 pt-8">
                                    <h3 className="text-base font-bold text-brand-navy mb-3">AI &amp; Automation</h3>
                                    <div className="space-y-12">
                                        <AIMetrics />
                                        <div className="border-t border-gray-100 pt-12">
                                            <RuleManagement />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {detail === 'integrations' && (
                            <div className="space-y-6">
                                {!activeIntegration ? (
                                    <>
                                        <p className="text-sm text-gray-500">Manage connections to external services.</p>
                                        <div className="grid grid-cols-1 gap-4">
                                            <button
                                                onClick={() => setActiveIntegration('quickbooks')}
                                                className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm active:shadow-md transition-all text-left"
                                            >
                                                <div className="h-12 w-12 bg-[#2CA01C] rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4 shadow-sm">
                                                    qb
                                                </div>
                                                <h4 className="text-base font-bold text-gray-900 mb-1">QuickBooks Online</h4>
                                                <p className="text-sm text-gray-500">Sync expenses and chart of accounts</p>
                                            </button>

                                            <button
                                                onClick={() => setActiveIntegration('lenco')}
                                                className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm active:shadow-md transition-all text-left"
                                            >
                                                <div className="h-12 w-12 bg-brand-pink rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4 shadow-sm">
                                                    L
                                                </div>
                                                <h4 className="text-base font-bold text-gray-900 mb-1">Lenco Banking</h4>
                                                <p className="text-sm text-gray-500">Manage corporate wallets and transfers</p>
                                            </button>

                                            <button
                                                onClick={() => setActiveIntegration('masterfees')}
                                                className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-2xl shadow-sm active:shadow-md transition-all text-left"
                                            >
                                                <div className="h-12 w-12 bg-brand-navy rounded-xl flex items-center justify-center text-white mb-4 shadow-sm">
                                                    <GraduationCap className="h-6 w-6" />
                                                </div>
                                                <h4 className="text-base font-bold text-gray-900 mb-1">Master Fees</h4>
                                                <p className="text-sm text-gray-500">Sync school invoices, fee revenue &amp; receivables</p>
                                            </button>
                                        </div>
                                    </>
                                ) : activeIntegration === 'quickbooks' ? (
                                    <QuickBooksIntegration onBack={() => setActiveIntegration(null)} initialError={null} />
                                ) : activeIntegration === 'masterfees' ? (
                                    <MasterfeesIntegration onBack={() => setActiveIntegration(null)} />
                                ) : (
                                    <LencoIntegration onBack={() => setActiveIntegration(null)} />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Layout>
    );
};
export default Menu;
