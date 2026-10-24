import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { crmService, Customer, CrmProduct, CrmProductSummary, LoyaltyOverview, LoyaltySegment } from '../services/crm.service';
import { CustomerDetail } from '../components/crm/CustomerDetail';
import { AddCustomerModal } from '../components/crm/AddCustomerModal';
import { InvestorsPanel } from '../components/crm/InvestorsPanel';
import { CampaignModal } from '../components/crm/CampaignModal';
import { SegmentBadge, SEGMENT_STYLE } from '../components/crm/loyaltyUi';
import { investmentService } from 'core';
import { Search, SlidersHorizontal, ArrowDownUp, Plus, X, UserCheck, Mail } from 'lucide-react';

type FilterTab = 'ALL' | 'OWING' | 'CLEAR';
type SortDir = 'desc' | 'asc';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CRM: React.FC = () => {
    const { organizationId, organizationName, userRole } = useAuth();
    const queryClient = useQueryClient();
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
    const [productFilter, setProductFilter] = useState<CrmProduct | null>(null);
    const [search, setSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

    // Investment companies also see an Investors tab (account applications from the app).
    const [searchParams] = useSearchParams();
    const [mainTab, setMainTab] = useState<'customers' | 'loyalty' | 'investors'>(
        searchParams.get('tab') === 'investors' ? 'investors' : searchParams.get('tab') === 'loyalty' ? 'loyalty' : 'customers'
    );
    const [campaign, setCampaign] = useState<{ segments?: LoyaltySegment[] } | null>(null);
    const [segmentFilter, setSegmentFilter] = useState<LoyaltySegment | null>(null);
    const [detailTab, setDetailTab] = useState<'history' | 'loyalty'>('history');
    const canEmail = userRole === 'ADMIN' || userRole === 'ACCOUNTANT';
    const { data: payoutInfo } = useQuery({
        queryKey: ['investor-payout-settings'],
        queryFn: () => investmentService.getPayoutSettings(),
        retry: false,
        staleTime: 5 * 60_000,
        enabled: !!organizationId,
    });
    const showInvestors = !!payoutInfo?.isInvestmentCompany;

    const { data: customers = [], isLoading, isError } = useQuery<Customer[]>({
        queryKey: ['crm-customers', organizationId],
        queryFn: () => crmService.listCustomers(),
        enabled: !!organizationId,
        retry: 1,
    });

    const { data: loyalty } = useQuery<LoyaltyOverview>({
        queryKey: ['crm-loyalty', organizationId],
        queryFn: () => crmService.getLoyaltyOverview(),
        enabled: !!organizationId,
        retry: 1,
        staleTime: 60_000,
    });
    // Blue Opus only: MoneyWise vs Project Genius customer counts (the server returns enabled:false for everyone else).
    const { data: productSummary } = useQuery<CrmProductSummary>({
        queryKey: ['crm-products', organizationId],
        queryFn: () => crmService.getProductSummary(),
        enabled: !!organizationId,
        retry: false,
        staleTime: 60_000,
    });
    const loyaltyById = new Map((loyalty?.customers || []).map(l => [l.customer_id, l]));

    const filteredCustomers = customers
        .filter(c => {
            if (productFilter && c.product !== productFilter) return false;
            if (mainTab === 'loyalty' && segmentFilter && loyaltyById.get(c.id)?.segment !== segmentFilter) return false;
            if (filterTab === 'OWING') return c.owing_status === 'OWING';
            if (filterTab === 'CLEAR') return c.owing_status === 'CLEAR';
            return true;
        })
        .filter(c => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                c.name.toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q)
            );
        })
        .sort((a, b) => {
            const ta = new Date(a.created_at).getTime();
            const tb = new Date(b.created_at).getTime();
            return sortDir === 'desc' ? tb - ta : ta - tb;
        });

    // If viewing a specific customer detail
    if (selectedCustomerId) {
        return (
            <Layout noPadding={true}>
                <div className="flex flex-col h-full min-h-0">
                    <div className="flex-1 overflow-hidden">
                        <CustomerDetail
                            customerId={selectedCustomerId}
                            initialTab={detailTab}
                            onBack={() => setSelectedCustomerId(null)}
                            onUpdated={() => queryClient.invalidateQueries({ queryKey: ['crm-customers', organizationId] })}
                        />
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout noPadding={true}>
            <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-hidden flex flex-col px-5 pb-5 gap-2.5 pt-0">

                    {/* Main Card */}
                    <div className="flex-1 bg-white rounded-[20px] flex flex-col overflow-hidden p-3.5 gap-3">

                        {/* Top Bar / Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                    <UserCheck size={18} />
                                </div>
                                <div>
                                    <h1 className="text-base font-bold text-gray-900 font-['DM_Sans']">Customer Relationship Management</h1>
                                    <p className="text-[11px] text-gray-500">Track customer purchases, open invoices, and owing balances</p>
                                </div>
                            </div>
                        </div>

                        <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-1 self-start">
                            {([['customers', 'Customers'], ['loyalty', 'Loyalty'], ...(showInvestors ? [['investors', 'Investors']] : [])] as ['customers' | 'loyalty' | 'investors', string][]).map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => setMainTab(id)}
                                    className={`px-4 h-full rounded-lg text-[11px] font-['DM_Sans'] transition-all ${
                                        mainTab === id ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900' : 'font-normal text-gray-900 hover:bg-white/50'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {showInvestors && mainTab === 'investors' ? (
                            <InvestorsPanel initialOpenId={searchParams.get('application')} />
                        ) : (
                        <>
                        {mainTab === 'loyalty' && (
                            <div className="flex flex-col gap-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] text-gray-500">Customers grouped by how often and how recently they buy. Pick a group to focus on it.</p>
                                    {canEmail && (
                                        <button
                                            onClick={() => setCampaign({ segments: segmentFilter ? [segmentFilter] : [] })}
                                            className="h-8 px-3 bg-blue-600 rounded-lg flex items-center gap-2 text-white text-xs font-bold font-['DM_Sans'] hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
                                        >
                                            <Mail size={13} />
                                            {segmentFilter ? `Email ${SEGMENT_STYLE[segmentFilter].label.toLowerCase()} customers` : 'Email customers'}
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                                    {(loyalty?.segments || []).map(s => (
                                        <button
                                            key={s.value}
                                            title={s.hint}
                                            onClick={() => setSegmentFilter(f => (f === s.value ? null : s.value))}
                                            className={`text-left p-2.5 rounded-xl border transition-colors ${
                                                segmentFilter === s.value ? 'border-blue-500 bg-blue-50/60' : 'border-gray-100 bg-white hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                                                <span className={`w-1.5 h-1.5 rounded-full ${SEGMENT_STYLE[s.value].dot}`} />{s.label}
                                            </span>
                                            <span className="block text-lg font-bold text-gray-900 leading-tight mt-0.5">{s.count}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Toolbar Row */}
                        <div className="flex items-center justify-between gap-3 pt-1">
                            {searchOpen ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="flex-1 flex items-center gap-2 h-8 px-3 bg-gray-50 border border-gray-200 rounded-lg">
                                        <Search size={13} className="text-gray-400 flex-shrink-0" />
                                        <input
                                            autoFocus
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="Search customers by name, phone, or email…"
                                            className="flex-1 text-xs bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                                        />
                                        {search && (
                                            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <button onClick={() => { setSearchOpen(false); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                {productSummary?.enabled && (
                                    <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-1">
                                        {[{ product: null, label: 'All products', total: null }, ...productSummary.products].map(p => (
                                            <button
                                                key={p.product ?? 'ALL'}
                                                onClick={() => setProductFilter(p.product as CrmProduct | null)}
                                                className={`px-3 h-full rounded-lg text-[10px] font-['DM_Sans'] transition-all ${
                                                    productFilter === p.product
                                                        ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900'
                                                        : 'font-normal text-gray-900 hover:bg-white/50'
                                                }`}
                                            >
                                                {p.label}{p.total !== null && ` (${p.total})`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-2">
                                    {(['ALL', 'OWING', 'CLEAR'] as FilterTab[]).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setFilterTab(tab)}
                                            className={`px-3.5 h-full rounded-lg text-[10px] font-['DM_Sans'] transition-all flex items-center gap-1.5 ${
                                                filterTab === tab
                                                    ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900'
                                                    : 'font-normal text-gray-900 hover:bg-white/50'
                                            }`}
                                        >
                                            {tab === 'ALL' && 'All Customers'}
                                            {tab === 'OWING' && (
                                                <>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    Owing (Open Invoices)
                                                </>
                                            )}
                                            {tab === 'CLEAR' && (
                                                <>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Clear
                                                </>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                </div>
                            )}

                            {!searchOpen && (
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setSearchOpen(true)} className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                            <Search size={16} />
                                        </button>
                                        <button
                                            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                                            title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
                                            className={`w-4 h-4 transition-colors ${sortDir === 'asc' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <ArrowDownUp size={16} />
                                        </button>
                                        <button className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                            <SlidersHorizontal size={16} />
                                        </button>
                                    </div>

                                    {canEmail && mainTab === 'customers' && (
                                        <button
                                            onClick={() => setCampaign({})}
                                            className="h-8 px-3 py-1 bg-white border border-gray-200 rounded-lg flex items-center gap-2 text-gray-800 text-xs font-bold font-['DM_Sans'] hover:bg-gray-50 transition-colors"
                                        >
                                            <Mail size={13} />
                                            Email Customers
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsAddCustomerOpen(true)}
                                        className="h-8 px-3 py-1 bg-blue-600 rounded-lg flex items-center gap-2 text-white text-xs font-bold font-['DM_Sans'] hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        New Customer
                                        <Plus size={13} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Customer List (Matching Staff Table style) */}
                        <div className="flex-1 bg-white rounded-2xl border border-violet-100 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2.5">
                                {isLoading && organizationId ? (
                                    <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading customers…</div>
                                ) : isError ? (
                                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                                        <p className="text-sm text-red-500 font-medium">Failed to load customers</p>
                                        <button
                                            onClick={() => queryClient.invalidateQueries({ queryKey: ['crm-customers', organizationId] })}
                                            className="text-xs text-blue-600 font-semibold hover:underline"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                ) : filteredCustomers.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                                        <p className="text-sm text-gray-400 font-medium">{search ? 'No matching customers found' : 'No customers recorded yet'}</p>
                                        {!search && (
                                            <button
                                                onClick={() => setIsAddCustomerOpen(true)}
                                                className="text-xs text-emerald-600 font-semibold hover:underline"
                                            >
                                                Add your first customer
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    filteredCustomers.map((customer, index) => {
                                        const isOwing = customer.owing_status === 'OWING';
                                        const initial = (customer.name?.[0] || '?').toUpperCase();
                                        return (
                                            <button
                                                key={`${customer.id}_${index}`}
                                                onClick={() => { setDetailTab(mainTab === 'loyalty' ? 'loyalty' : 'history'); setSelectedCustomerId(customer.id); }}
                                                className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-slate-50 rounded-xl border border-gray-100 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                                        {initial}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-gray-900 truncate">
                                                            {customer.name}
                                                            {customer.product_label && (
                                                                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-semibold align-middle ${customer.product === 'PROJECT_GENIUS' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>
                                                                    {customer.product_label}
                                                                </span>
                                                            )}
                                                            {customer.status === 'INACTIVE' && <span className="ml-1.5 text-[9px] font-normal text-gray-400">inactive</span>}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 truncate">
                                                            {customer.phone || 'No phone'} · {customer.email || 'No email'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4 flex-shrink-0">
                                                    {(() => {
                                                        const l = loyaltyById.get(customer.id);
                                                        if (!l) return null;
                                                        return (
                                                            <div className="flex items-center gap-3">
                                                                {mainTab === 'loyalty' && (
                                                                    <div className="text-right hidden md:block">
                                                                        <span className="text-[10px] text-gray-400 block">Purchases</span>
                                                                        <span className="text-xs font-bold text-gray-800">
                                                                            {l.order_count}{l.days_since_last_purchase !== null ? ` · ${l.days_since_last_purchase === 0 ? 'today' : `${l.days_since_last_purchase}d ago`}` : ''}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <SegmentBadge segment={l.segment} />
                                                            </div>
                                                        );
                                                    })()}
                                                    <div className="text-right hidden sm:block">
                                                        <span className="text-[10px] text-gray-400 block">Total Spent</span>
                                                        <span className="text-xs font-bold text-gray-800">K{fmt(customer.total_spend || 0)}</span>
                                                    </div>

                                                    <span className={`pl-2 pr-2.5 py-1 rounded-[20px] inline-flex items-center gap-1.5 ${
                                                        isOwing ? 'bg-red-100 text-red-800' : 'bg-lime-300/25 text-green-900'
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isOwing ? 'bg-red-500' : 'bg-lime-600'}`} />
                                                        <span className="text-[10px] font-semibold font-['Inter']">
                                                            {isOwing ? `Owing K${fmt(customer.owing_amount)}` : 'Clear'}
                                                        </span>
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        </>
                        )}

                    </div>
                </div>

                {campaign && (
                    <CampaignModal
                        overview={loyalty}
                        organizationName={organizationName}
                        initialAudience={campaign.segments?.length ? { segments: campaign.segments } : undefined}
                        onClose={() => setCampaign(null)}
                    />
                )}

                {isAddCustomerOpen && (
                    <AddCustomerModal
                        onClose={() => setIsAddCustomerOpen(false)}
                        onSuccess={() => {
                            setIsAddCustomerOpen(false);
                            queryClient.invalidateQueries({ queryKey: ['crm-customers', organizationId] });
                        }}
                    />
                )}
            </div>
        </Layout>
    );
};
