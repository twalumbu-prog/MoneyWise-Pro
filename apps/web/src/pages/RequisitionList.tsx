import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { FileText, History, XCircle, X, Users, TrendingUp } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { useAuth } from '../context/AuthContext';
import { RequisitionInbox } from '../components/RequisitionInbox';
import { InboxCard, NewMenuItem } from '../components/InboxCard';
import RequisitionModal from '../components/requisitions/RequisitionModal';
import { MobileRequisitionWizard } from '../components/requisitions/MobileRequisitionWizard';
import { MobileStaffLoanWizard } from '../components/requisitions/MobileStaffLoanWizard';
import { MobileSalaryAdvanceWizard } from '../components/requisitions/MobileSalaryAdvanceWizard';
import { MobilePayrollWizard } from '../components/requisitions/MobilePayrollWizard';
import { MobileInvestWizard } from '../components/requisitions/MobileInvestWizard';
import { DesktopRequisitionWorkspace } from '../components/requisitions/DesktopRequisitionWorkspace';
import { DesktopStaffLoanWorkspace } from '../components/requisitions/DesktopStaffLoanWorkspace';
import { DesktopSalaryAdvanceWorkspace } from '../components/requisitions/DesktopSalaryAdvanceWorkspace';
import { DesktopPayrollWorkspace } from '../components/requisitions/DesktopPayrollWorkspace';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Clock, CheckCircle2, Check, AlertCircle, RotateCcw, ArrowUpDown, ListFilter, ShoppingBag } from 'lucide-react';
import { Requisition as RequisitionType, REQUISITION_STATUS_CONFIG, getStatusConfig } from '../services/requisition.service';
import { departmentService } from '../services/department.service';
import { SegmentedControl } from '../components/AnimatedTabs';
import { InflowInbox, inflowTitle, InflowRow } from '../components/InflowInbox';
import { InvoiceInbox } from '../components/InvoiceInbox';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import { InvoiceEditModal } from '../components/InvoiceEditModal';
import { cashbookService } from '../services/cashbook.service';
import { payrollService } from '../services/payroll.service';
import { paymentLinkService, PaymentLink, UpdateInvoiceLinkPayload } from '../services/product.service';
import { useNewnessTracker } from '../hooks/useNewnessTracker';
import InflowDetailDrawer from '../components/InflowDetailDrawer';
import { groupByDate } from 'core';

interface Requisition {
    id: string;
    description: string;
    estimated_total: number;
    status: string;
    created_at: string;
    requestor_name?: string;
    department?: string;
    type?: string;
    has_unread_updates?: boolean;
}

// Determine completed statuses (for filtering active requisitions in Requestor view)
const COMPLETED_STATUSES = Object.keys(REQUISITION_STATUS_CONFIG).filter(
    key => REQUISITION_STATUS_CONFIG[key].isCompleted
);

const TABS = [
    { label: 'All Requests', value: 'ALL' },
    { label: 'Approvals', value: 'PENDING_APPROVAL' },
    { label: 'Reviewed', value: 'REVIEWED' },
    { label: 'Disbursed', value: 'DISBURSED' },
    { label: 'Returned', value: 'CHANGE_SUBMITTED' },
    { label: 'Completed', value: 'COMPLETED' },
];

const MOBILE_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Awaiting Approval',
    REVIEWED: 'Reviewed',
    DISBURSED: 'Disbursed',
    CHANGE_SUBMITTED: 'Returned',
    COMPLETED: 'Completed',
};

export const RequisitionList: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, userRole, refreshNotifications, organizationId } = useAuth();
    const isCashHandler = userRole ? ['CASHIER', 'ACCOUNTANT', 'ADMIN'].includes(userRole) : false;
    const queryClient = useQueryClient();

    const requisitionsKey = ['requisitions', organizationId];
    const {
        data: requisitions = [],
        isLoading: requisitionsLoading,
        error: requisitionsError,
    } = useQuery<Requisition[]>({
        queryKey: requisitionsKey,
        queryFn: () => requisitionService.getAll(),
        enabled: !!organizationId,
    });
    // Cached data paints instantly; only block on the true first-ever load.
    const loading = requisitionsLoading || !organizationId;
    const error = requisitionsError ? 'Failed to load requisitions' : null;
    const [currentView] = useState<'active' | 'history'>('active');
    const [selectedRequisition, setSelectedRequisition] = useState<RequisitionType | null>(null);
    // Outflows = requisitions (existing) · Inflows = money-in ledger entries (sales, deposits, cash inflows)
    const [inboxMode, setInboxMode] = useState<'outflows' | 'inflows'>('outflows');
    // Within the Inflows view: cash payments vs. sent invoice links
    const [inflowSubMode, setInflowSubMode] = useState<'cash' | 'invoices'>('cash');
    const [selectedInvoice, setSelectedInvoice] = useState<PaymentLink | null>(null);
    const [editingInvoice, setEditingInvoice] = useState<PaymentLink | null>(null);
    const [selectedInflow, setSelectedInflow] = useState<InflowRow | null>(null);
    // Inflows are fetched up front too (not just when the tab is opened) so the
    // "new inflow" dot on the Inflows toggle is accurate even while viewing
    // Outflows; switching back to the tab refetches (e.g. after a sale).
    const {
        data: inflows = [],
        isFetching: inflowsFetching,
        refetch: refetchInflows,
    } = useQuery<InflowRow[]>({
        queryKey: ['inflows', organizationId],
        // Ordered by transaction date (not sync/created_at), so a backfilled batch of
        // historically-dated inflows (e.g. Master Fees payments synced today but dated
        // months ago) can rank below a low cap and never appear even though they're
        // real, current data. 1000 covers this org's full inflow history today with
        // room to grow; revisit with real pagination if it's ever not enough.
        queryFn: async () => {
            if (isRequestor && user?.id) {
                try {
                    const allStaff = await payrollService.listStaff();
                    const me = allStaff.find(s => s.user_id === user.id);
                    if (me) {
                        const history = await payrollService.getStaffPayrollHistory(me.id);
                        return history.map(h => ({
                            id: h.id,
                            description: `Payroll Notification - ${h.payroll_runs.period_label}`,
                            debit: h.net_pay,
                            status: 'COMPLETED',
                            date: h.payroll_runs.run_at || new Date().toISOString(),
                            created_at: h.payroll_runs.run_at || new Date().toISOString(),
                            reference_number: 'PAYROLL',
                            account_type: 'BANK',
                        }));
                    }
                } catch (e) {
                    console.error('Failed to load payslips for staff', e);
                }
                return [];
            }
            return (await cashbookService.getEntries({ entryType: 'INFLOW', limit: 1000 })) || [];
        },
        enabled: !!organizationId,
    });
    const inflowsLoading = inflowsFetching || !organizationId;

    // Invoice links — payment links with a multi-item basket (sent to a customer for AR).
    const {
        data: invoices = [],
        isLoading: invoicesInitialLoading,  // true only on the very first fetch (no cache yet)
        refetch: refetchInvoices,
    } = useQuery<PaymentLink[]>({
        queryKey: ['invoice-links', organizationId],
        queryFn: () => paymentLinkService.listInvoiceLinks(),
        // Requestors only see their payslips; invoice links are admin-only — the API
        // returns an empty list for non-admins so no role guard is needed here.
        enabled: !!organizationId,
        // Keep data fresh for 60 s so tab switches don't trigger a network round-trip
        // every single time. Explicit refresh (New Sale success, pull-to-refresh) bypasses
        // this via refetch() / invalidateQueries().
        staleTime: 60_000,
    });
    // Gate the loading spinner only on the initial fetch (no cached data yet).
    // Using isFetching here would hide the list on every background refetch — the
    // root cause of invoices "sometimes not showing" after a tab switch.
    const invoicesLoading = invoicesInitialLoading || !organizationId;

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string[]>(['ALL']);
    const [isNewRequisitionOpen, setIsNewRequisitionOpen] = useState(false); // State for mobile action sheet
    const [isRequisitionWizardOpen, setIsRequisitionWizardOpen] = useState(false);
    const [isStaffLoanWizardOpen, setIsStaffLoanWizardOpen] = useState(false);
    const [isSalaryAdvanceWizardOpen, setIsSalaryAdvanceWizardOpen] = useState(false);
    const [isPayrollWizardOpen, setIsPayrollWizardOpen] = useState(false);
    // Desktop-native "New Requisition" workspace — replaces the Inbox card in place
    // (sidebar/header stay put) instead of the mobile bottom sheet flow.
    const [isDesktopRequisitionOpen, setIsDesktopRequisitionOpen] = useState(false);
    const [isDesktopStaffLoanOpen, setIsDesktopStaffLoanOpen] = useState(false);
    const [isDesktopSalaryAdvanceOpen, setIsDesktopSalaryAdvanceOpen] = useState(false);
    const [isDesktopPayrollOpen, setIsDesktopPayrollOpen] = useState(false);
    
    // New Invest Wizard State
    const [isInvestWizardOpen, setIsInvestWizardOpen] = useState(false);

    // Org departments config
    const { data: departmentConfig } = useQuery({
        queryKey: ['departments', organizationId],
        queryFn: () => departmentService.list(),
        enabled: !!organizationId,
    });
    const useDepartments = departmentConfig?.use_departments ?? false;
    const orgDepartments = React.useMemo(
        () => (departmentConfig?.use_departments ? departmentConfig.departments.map(d => d.name) : []),
        [departmentConfig]
    );

    // Mobile filter/sort states
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
    const [filterRead, setFilterRead] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL');
    const [filterDepartment, setFilterDepartment] = useState<string[]>(['ALL']);
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Temp state for bottom sheet filters
    const [tempStatus, setTempStatus] = useState<string[]>(['ALL']);
    const [tempRead, setTempRead] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL');
    const [tempDepartment, setTempDepartment] = useState<string[]>(['ALL']);
    const [tempStartDate, setTempStartDate] = useState('');
    const [tempEndDate, setTempEndDate] = useState('');

    useEffect(() => {
        if (isFilterSheetOpen) {
            setTempStatus(activeTab);
            setTempRead(filterRead);
            setTempDepartment(filterDepartment);
            setTempStartDate(filterStartDate);
            setTempEndDate(filterEndDate);
        }
    }, [isFilterSheetOpen]);

    useEffect(() => {
        if (searchParams.get('new') === 'true') {
            setIsRequisitionWizardOpen(true);
        }

        const id = searchParams.get('id');
        if (id) {
            requisitionService.getById(id)
                .then(setSelectedRequisition)
                .catch(err => console.error('Failed to load requisition from URL:', err));
        }
    }, [searchParams]);

    const isRequestor = userRole === 'REQUESTOR';

    // "New since last visit" glow — one tracker per tab so an unread inflow
    // doesn't also light up outflow rows and vice versa.
    // firstVisitLookbackMs = 0 so the cutoff seeds to "now" on the very first
    // visit — only items that arrive AFTER the user has first opened this page
    // will ever light up, preventing the "always blue dot" problem where items
    // that predate the session appear perpetually new.
    const outflowsSeen = useNewnessTracker(organizationId ? `inbox_outflows_seen_${organizationId}` : null, 18000, 0);
    const inflowsSeen = useNewnessTracker(organizationId ? `inbox_inflows_seen_${organizationId}` : null, 18000, 0);
    const hasNewOutflow = requisitions.some(r => outflowsSeen.isNew(r.created_at));
    // Ignore unfinished PENDING intents — they're hidden from the list, so a dot
    // pointing at one would have nothing to show.
    const hasNewInflow = inflows.some(r => r.status !== 'PENDING' && inflowsSeen.isNew(r.created_at || r.date));

    // Start a tab's fade countdown only once its fetch has settled AND its new
    // items are actually rendered on the active tab — a slow sync must never
    // eat into the highlight window. The other tab keeps its toggle dot until
    // the user opens it.
    useEffect(() => {
        if (inboxMode === 'outflows' && !loading && hasNewOutflow) outflowsSeen.observe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboxMode, loading, hasNewOutflow]);
    useEffect(() => {
        if (inboxMode === 'inflows' && !inflowsLoading && hasNewInflow) inflowsSeen.observe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboxMode, inflowsLoading, hasNewInflow]);

    // Mutation call sites below await these to know fresh data has landed —
    // invalidate resolves only after the active query has refetched.
    const loadRequisitions = async () => {
        await queryClient.invalidateQueries({ queryKey: requisitionsKey });
    };

    const loadInflows = async () => {
        await refetchInflows();
        await refetchInvoices();
    };

    const handleInvoiceEdit = (invoice: PaymentLink) => setEditingInvoice(invoice);

    const handleInvoiceSave = async (id: string, payload: UpdateInvoiceLinkPayload) => {
        await paymentLinkService.updateInvoiceLink(id, payload);
        await refetchInvoices();
    };

    const handleInvoiceArchive = async (invoice: PaymentLink) => {
        if (!window.confirm(`Archive invoice ${invoice.token.slice(0, 8).toUpperCase()}? It will be hidden from your inbox but the payment link remains active.`)) return;
        try {
            await paymentLinkService.archiveInvoiceLink(invoice.id);
            await refetchInvoices();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to archive invoice');
        }
    };

    const handleInvoiceDelete = async (invoice: PaymentLink) => {
        if (!window.confirm(`Delete invoice ${invoice.token.slice(0, 8).toUpperCase()}? This will deactivate the payment link and cannot be undone.`)) return;
        try {
            await paymentLinkService.deactivatePaymentLink(invoice.id);
            await refetchInvoices();
            // If the deleted invoice was open in the detail panel, close it
            if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to delete invoice');
        }
    };

    useEffect(() => {
        if (inboxMode === 'inflows') loadInflows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboxMode]);

    const handleStatusChange = async () => {
        await loadRequisitions();
        if (selectedRequisition) {
            try {
                const updated = await requisitionService.getById(selectedRequisition.id);
                setSelectedRequisition(updated);
            } catch (err) {
                console.error('Failed to refresh selected requisition:', err);
            }
        }
    };



    const uniqueDepartments = React.useMemo(() => {
        // Prefer org-managed departments when configured; fall back to values on requisitions
        if (orgDepartments.length > 0) return orgDepartments;
        const depts = new Set<string>();
        requisitions.forEach(req => { if (req.department) depts.add(req.department); });
        return Array.from(depts).sort();
    }, [requisitions, orgDepartments]);

    const filteredRequisitions = requisitions.filter(req => {
        // Apply search filter
        const matchesSearch = req.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (req.requestor_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        // Apply tab/status filter (multi-select: OR across all selected statuses)
        const config = getStatusConfig(req.status);
        if (!activeTab.includes('ALL')) {
            const matchesAny = activeTab.some(tab => {
                if (tab === 'REVIEWED') return req.status === 'AUTHORISED';
                if (tab === 'PENDING_APPROVAL') return ['DRAFT', 'PENDING_APPROVAL'].includes(req.status);
                if (tab === 'COMPLETED') return config.isCompleted;
                return config.tab === tab;
            });
            if (!matchesAny) return false;
        }

        // Apply read/unread filter
        if (filterRead === 'UNREAD' && !req.has_unread_updates) return false;
        if (filterRead === 'READ' && req.has_unread_updates) return false;

        // Apply department filter (multi-select: OR across selected departments)
        if (!filterDepartment.includes('ALL')) {
            const reqDept = (req.department || 'General').toLowerCase();
            if (!filterDepartment.some(d => d.toLowerCase() === reqDept)) return false;
        }

        // Apply date range filter
        if (filterStartDate) {
            const reqDate = new Date(req.created_at);
            const startDate = new Date(filterStartDate + 'T00:00:00');
            if (reqDate < startDate) return false;
        }
        if (filterEndDate) {
            const reqDate = new Date(req.created_at);
            const endDate = new Date(filterEndDate + 'T23:59:59');
            if (reqDate > endDate) return false;
        }

        // For requestors in active view, exclude completed requisitions
        if (isRequestor && currentView === 'active' && COMPLETED_STATUSES.includes(req.status)) {
            return false;
        }

        return true;
    });

    const sortedRequisitions = React.useMemo(() => {
        return [...filteredRequisitions].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [filteredRequisitions, sortOrder]);

    // Invoices: filter by customer name / token / phone / email, sorted by date.
    const sortedInvoices = React.useMemo(() => {
        const q = searchQuery.toLowerCase();
        const filtered = invoices.filter(inv =>
            inv.customer_name.toLowerCase().includes(q) ||
            inv.token.toLowerCase().includes(q) ||
            (inv.customer_phone || '').toLowerCase().includes(q) ||
            (inv.customer_email || '').toLowerCase().includes(q)
        );
        return filtered.sort((a, b) => {
            const da = new Date(a.created_at || '').getTime();
            const db = new Date(b.created_at || '').getTime();
            return sortOrder === 'desc' ? db - da : da - db;
        });
    }, [invoices, searchQuery, sortOrder]);

    // Inflows: filter by the (cleaned) title or receipt number, then sort by date.
    const sortedInflows = React.useMemo(() => {
        const q = searchQuery.toLowerCase();
        // Only show inflows that actually went through. PENDING rows are unfinished
        // intents (e.g. a Lenco/POS checkout the customer never completed) — they
        // aren't real money yet, so they shouldn't clutter the inbox.
        // Also exclude ACCOUNTS_RECEIVABLE entries — those are invoice AR trackers
        // that live in the Invoices tab, not the Cash tab.
        const filtered = inflows.filter(row =>
            row.status !== 'PENDING' &&
            row.account_type !== 'ACCOUNTS_RECEIVABLE' &&
            (inflowTitle(row.description).toLowerCase().includes(q) ||
            (row.reference_number || '').toLowerCase().includes(q))
        );
        return filtered.sort((a, b) => {
            const dateA = new Date(a.created_at || a.date).getTime();
            const dateB = new Date(b.created_at || b.date).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [inflows, searchQuery, sortOrder]);

    const getTabCount = (tabValue: string) => {
        if (tabValue === 'ALL' || tabValue === 'COMPLETED') return 0;
        return requisitions.filter(req => {
            if (tabValue === 'PENDING_APPROVAL') return ['DRAFT', 'PENDING_APPROVAL'].includes(req.status);
            if (tabValue === 'REVIEWED') return req.status === 'AUTHORISED';
            const config = getStatusConfig(req.status);
            return config.tab === tabValue && !config.isCompleted;
        }).length;
    };

    const inflowTotalCount = inflows.filter(i => i.status !== 'PENDING').length;
    const hasActiveDesktopFilters = !activeTab.includes('ALL') || filterRead !== 'ALL' || (useDepartments && !filterDepartment.includes('ALL')) || !!filterStartDate || !!filterEndDate;

    // Day bucketing lives in `core` so the web inbox and the native inbox cannot
    // drift on how rows are grouped or how the date header reads. The wrappers
    // only rename `items` to the key each list already renders with.
    const groupRequisitionsByDate = (reqs: Requisition[]) =>
        groupByDate(reqs, r => r.created_at, sortOrder)
            .map(g => ({ dateLabel: g.dateLabel, dateKey: g.dateKey, requisitions: g.items }));

    const groupInflowsByDate = (rows: InflowRow[]) =>
        groupByDate(rows, r => r.date || r.created_at || new Date(), sortOrder)
            .map(g => ({ dateLabel: g.dateLabel, dateKey: g.dateKey, rows: g.items }));

    // Desktop "New" dropdown — mirrors the mobile bottom sheet options.
    const desktopNewMenuItems: NewMenuItem[] = [
        {
            label: 'New Requisition',
            description: 'Office items, services, or equipment',
            icon: FileText,
            iconColor: '#0F172A',
            onSelect: () => setIsDesktopRequisitionOpen(true),
        },
        {
            label: 'New Salary Advance',
            description: 'Quick funds from your next payroll',
            icon: History,
            iconColor: '#0F172A',
            onSelect: () => setIsDesktopSalaryAdvanceOpen(true),
        },
        {
            label: 'New Staff Loan',
            description: 'Long-term loan with fixed 15% interest',
            icon: Plus,
            iconColor: '#0F172A',
            onSelect: () => setIsDesktopStaffLoanOpen(true),
        },
        {
            label: 'Invest',
            description: 'Grow your money with our partners',
            icon: TrendingUp,
            iconColor: '#0F172A',
            onSelect: () => setIsInvestWizardOpen(true),
        },
        ...(!isRequestor ? [{
            label: 'New Payroll Requisition',
            description: 'Batch processing via spreadsheet upload',
            icon: Users,
            iconColor: '#0F172A',
            onSelect: () => setIsDesktopPayrollOpen(true),
        }] : []),
    ];

    return (
        <>
            <Layout noPadding={true} backgroundColor="bg-gray-50">
            <div className={`space-y-0 ${isRequestor ? 'pb-32' : ''} md:px-4 md:pb-4`}>
                {/* Helper to get counts */}
                {(() => {
                    return (
                        <>
                            {/* Mobile Outflows/Inflows toggle — capsule chip on a rounded track */}
                            <div className="md:hidden px-4 pt-2 pb-1">
                                <SegmentedControl
                                    variant="capsule"
                                    value={inboxMode}
                                    onChange={(v) => setInboxMode(v as 'outflows' | 'inflows')}
                                    options={[
                                        {
                                            value: 'inflows',
                                            label: (
                                                <span className="inline-flex items-center gap-1.5">
                                                    {hasNewInflow && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                                                    Inflows
                                                </span>
                                            ),
                                        },
                                        {
                                            value: 'outflows',
                                            label: (
                                                <span className="inline-flex items-center gap-1.5">
                                                    {hasNewOutflow && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                                                    Outflows
                                                </span>
                                            ),
                                        },
                                    ]}
                                />
                            </div>

                            {/* Mobile Search & Sort/Filter Bar */}
                            <div className="md:hidden px-5 pt-4 pb-3">
                                <div className="flex items-center bg-white rounded-[32px] pl-6 pr-2.5 py-2.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-black/5">
                                    <Search className="text-zinc-500 mr-4 flex-shrink-0" size={20} strokeWidth={1.5} />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-brand-navy placeholder:text-stone-300 font-normal"
                                    />
                                    <button
                                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                        className={`w-10 h-10 rounded-full transition-all flex-shrink-0 flex items-center justify-center ${
                                            sortOrder !== 'desc' ? 'text-[#006AFF]' : 'text-zinc-600 hover:text-brand-navy'
                                        }`}
                                        title="Sort by Date"
                                    >
                                        <ArrowUpDown size={16} />
                                    </button>
                                    {inboxMode === 'outflows' && (<>
                                    <div className="w-[1px] h-5 bg-slate-200 flex-shrink-0" />
                                    <button
                                        onClick={() => setIsFilterSheetOpen(true)}
                                        className={`w-10 h-10 rounded-full transition-all flex-shrink-0 flex items-center justify-center ${
                                            !activeTab.includes('ALL') || filterRead !== 'ALL' || (useDepartments && !filterDepartment.includes('ALL')) || filterStartDate || filterEndDate
                                                ? 'text-[#006AFF]'
                                                : 'text-zinc-600 hover:text-brand-navy'
                                        }`}
                                        title="Filters"
                                    >
                                        <ListFilter size={16} />
                                    </button>
                                    </>)}
                                </div>
                            </div>

                            {/* Active Filter Chips (Outflows only) */}
                            {inboxMode === 'outflows' && (!activeTab.includes('ALL') || filterRead !== 'ALL' || (useDepartments && !filterDepartment.includes('ALL')) || filterStartDate || filterEndDate || sortOrder !== 'desc') && (
                                <div className="md:hidden px-6 pb-3 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                                    {activeTab.filter(t => t !== 'ALL').map(status => (
                                        <span key={status} className="inline-flex items-center gap-1.5 bg-[#F0F7FF] text-[#006AFF] border border-[#006AFF]/20 rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                                            {MOBILE_STATUS_LABELS[status] ?? status}
                                            <button
                                                onClick={() => {
                                                    const next = activeTab.filter(t => t !== status);
                                                    setActiveTab(next.length === 0 ? ['ALL'] : next);
                                                }}
                                                className="ml-0.5 rounded-full hover:bg-[#006AFF]/10 p-0.5 transition-colors"
                                                aria-label="Remove status filter"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                    ))}
                                    {filterRead !== 'ALL' && (
                                        <span className="inline-flex items-center gap-1.5 bg-[#F0F7FF] text-[#006AFF] border border-[#006AFF]/20 rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                                            {filterRead === 'UNREAD' ? 'Unread Only' : 'Read Only'}
                                            <button
                                                onClick={() => setFilterRead('ALL')}
                                                className="ml-0.5 rounded-full hover:bg-[#006AFF]/10 p-0.5 transition-colors"
                                                aria-label="Remove read filter"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                    )}
                                    {useDepartments && filterDepartment.filter(d => d !== 'ALL').map(dept => (
                                        <span key={dept} className="inline-flex items-center gap-1.5 bg-[#F0F7FF] text-[#006AFF] border border-[#006AFF]/20 rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                                            {dept} Dept.
                                            <button
                                                onClick={() => {
                                                    const next = filterDepartment.filter(d => d !== dept);
                                                    setFilterDepartment(next.length === 0 ? ['ALL'] : next);
                                                }}
                                                className="ml-0.5 rounded-full hover:bg-[#006AFF]/10 p-0.5 transition-colors"
                                                aria-label="Remove department filter"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                    ))}
                                    {(filterStartDate || filterEndDate) && (
                                        <span className="inline-flex items-center gap-1.5 bg-[#F0F7FF] text-[#006AFF] border border-[#006AFF]/20 rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                                            {filterStartDate && filterEndDate
                                                ? `${new Date(filterStartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${new Date(filterEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                                                : filterStartDate
                                                    ? `From ${new Date(filterStartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                                                    : `Until ${new Date(filterEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`}
                                            <button
                                                onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
                                                className="ml-0.5 rounded-full hover:bg-[#006AFF]/10 p-0.5 transition-colors"
                                                aria-label="Remove date filter"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                    )}
                                    {sortOrder !== 'desc' && (
                                        <span className="inline-flex items-center gap-1.5 bg-[#F0F7FF] text-[#006AFF] border border-[#006AFF]/20 rounded-full px-3 py-1.5 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                                            Oldest First
                                            <button
                                                onClick={() => setSortOrder('desc')}
                                                className="ml-0.5 rounded-full hover:bg-[#006AFF]/10 p-0.5 transition-colors"
                                                aria-label="Remove sort filter"
                                            >
                                                <X size={11} />
                                            </button>
                                        </span>
                                    )}
                                </div>
                            )}
                        </>
                    );
                })()}

                <div className="w-full pt-6 md:pt-0">
                    {/* Desktop: unified Inbox card shell (toggle, tabs, search/sort/filter, New) */}
                    <div className="hidden md:block">
                      {isDesktopRequisitionOpen ? (
                        <DesktopRequisitionWorkspace 
                            onClose={() => setIsDesktopRequisitionOpen(false)} 
                            onSuccess={loadRequisitions}
                        />
                      ) : isDesktopStaffLoanOpen ? (
                        <DesktopStaffLoanWorkspace 
                            onClose={() => setIsDesktopStaffLoanOpen(false)} 
                            onSuccess={loadRequisitions}
                        />
                      ) : isDesktopSalaryAdvanceOpen ? (
                        <DesktopSalaryAdvanceWorkspace 
                            onClose={() => setIsDesktopSalaryAdvanceOpen(false)} 
                            onSuccess={loadRequisitions}
                        />
                      ) : isDesktopPayrollOpen ? (
                        <DesktopPayrollWorkspace 
                            onClose={() => setIsDesktopPayrollOpen(false)} 
                            onSuccess={loadRequisitions}
                        />
                      ) : (
                        <InboxCard
                            mode={inboxMode}
                            onModeChange={setInboxMode}
                            outflowCount={requisitions.length}
                            inflowCount={inflowTotalCount}
                            showNew={inboxMode === 'outflows' || isCashHandler}
                            newLabel={inboxMode === 'inflows' ? 'New Sale' : 'New Request'}
                            onNew={() => navigate(inboxMode === 'inflows' ? '/sales/new' : '/requisitions/new')}
                            newMenuItems={inboxMode === 'outflows' ? desktopNewMenuItems : undefined}
                            showTabs={inboxMode === 'outflows'}
                            tabs={TABS}
                            activeTab={activeTab}
                            getTabCount={getTabCount}
                            onTabChange={(v) => setActiveTab([v])}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            sortOrder={sortOrder}
                            onToggleSort={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            onOpenFilters={() => setIsFilterSheetOpen(true)}
                            onRefresh={() => inboxMode === 'inflows' ? loadInflows() : loadRequisitions()}
                            hasActiveFilters={hasActiveDesktopFilters}
                            leftContent={inboxMode === 'inflows' && !isRequestor ? (
                                <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px]">
                                    {([
                                        { value: 'cash', label: 'Cash', count: sortedInflows.length },
                                        { value: 'invoices', label: 'Invoices', count: sortedInvoices.length },
                                    ] as const).map(tab => (
                                        <button
                                            key={tab.value}
                                            onClick={() => setInflowSubMode(tab.value)}
                                            className={`px-3.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                                inflowSubMode === tab.value
                                                    ? 'font-bold bg-white text-[#111827] shadow-sm'
                                                    : 'font-normal text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {tab.label}
                                            {tab.count > 0 && (
                                                <span className={`px-1 rounded text-[9px] ${
                                                    inflowSubMode === tab.value
                                                        ? 'bg-[#E8EEF8] text-[#0058DB]'
                                                        : 'bg-gray-200 text-gray-500'
                                                }`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : undefined}
                        >
                            {inboxMode === 'outflows' ? (
                                <>
                                    {loading && (
                                        <div className="bg-gray-50/60 rounded-2xl p-24 text-center">
                                            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[#006AFF] mb-6"></div>
                                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Syncing your inbox...</p>
                                        </div>
                                    )}
                                    {error && (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex items-center text-red-700">
                                            <div className="p-3 bg-red-100 rounded-xl mr-4">
                                                <XCircle className="h-6 w-6" />
                                            </div>
                                            <p className="font-bold">{error}</p>
                                        </div>
                                    )}
                                    {!loading && !error && (
                                        <RequisitionInbox
                                            requisitions={sortedRequisitions}
                                            onRowClick={async (id) => {
                                                try {
                                                    const fullReq = await requisitionService.getById(id);
                                                    setSelectedRequisition(fullReq);
                                                    const clickedReq = sortedRequisitions.find(r => r.id === id);
                                                    if (clickedReq?.has_unread_updates) {
                                                        queryClient.setQueryData<Requisition[]>(requisitionsKey, prev => prev?.map(r => r.id === id ? { ...r, has_unread_updates: false } : r));
                                                        requisitionService.markRead(id).then(() => refreshNotifications()).catch(console.error);
                                                    }
                                                } catch (err) {
                                                    console.error('Failed to fetch requisition details:', err);
                                                }
                                            }}
                                            onDelete={async (id) => {
                                                if (window.confirm('Are you sure you want to delete this requisition? This action cannot be undone.')) {
                                                    try {
                                                        await requisitionService.delete(id);
                                                        await loadRequisitions();
                                                    } catch (err: any) {
                                                        alert(err.message || 'Failed to delete requisition');
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* Cash inflows */}
                                    {inflowSubMode === 'cash' && (<>
                                        {inflowsLoading && inflows.length === 0 && (
                                            <div className="bg-gray-50/60 rounded-2xl p-24 text-center">
                                                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-emerald-500 mb-6"></div>
                                                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading inflows...</p>
                                            </div>
                                        )}
                                        {!inflowsLoading && sortedInflows.length === 0 && (
                                            <div className="bg-gray-50/60 rounded-2xl p-24 text-center">
                                                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white mb-6 border border-gray-100">
                                                    <FileText className="h-10 w-10 text-gray-200" />
                                                </div>
                                                <h3 className="text-xl font-bold text-brand-navy">No inflows yet</h3>
                                                <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Record a sale with the New Sale button to see money-in here.</p>
                                            </div>
                                        )}
                                        {sortedInflows.length > 0 && (
                                            <InflowInbox
                                                inflows={sortedInflows}
                                                onRowClick={(id) => setSelectedInflow(sortedInflows.find(r => r.id === id) ?? null)}
                                            />
                                        )}
                                    </>)}

                                    {/* Invoice inflows */}
                                    {inflowSubMode === 'invoices' && (<>
                                        {invoicesLoading && (
                                            <div className="bg-gray-50/60 rounded-2xl p-24 text-center">
                                                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[#0058DB] mb-6"></div>
                                                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading invoices...</p>
                                            </div>
                                        )}
                                        {!invoicesLoading && (
                                            <InvoiceInbox
                                                invoices={sortedInvoices}
                                                onRowClick={setSelectedInvoice}
                                                onEdit={handleInvoiceEdit}
                                                onArchive={handleInvoiceArchive}
                                                onDelete={handleInvoiceDelete}
                                            />
                                        )}
                                    </>)}
                                </>
                            )}
                        </InboxCard>
                      )}
                    </div>

                    {inboxMode === 'outflows' && (<>
                    {loading && (
                        <div className="md:hidden bg-white shadow-sm border border-gray-100 rounded-[2.5rem] p-24 text-center">
                            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[#006AFF] mb-6"></div>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Syncing your inbox...</p>
                        </div>
                    )}

                    {error && (
                        <div className="md:hidden bg-red-50 border border-red-100 rounded-2xl p-6 flex items-center text-red-700">
                            <div className="p-3 bg-red-100 rounded-xl mr-4">
                                <XCircle className="h-6 w-6" />
                            </div>
                            <p className="font-bold">{error}</p>
                        </div>
                    )}

                    {!loading && !error && sortedRequisitions.length === 0 && (
                        <div className="md:hidden bg-white shadow-sm border border-gray-100 rounded-3xl p-24 text-center">
                            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 mb-6 border border-gray-100">
                                <FileText className="h-10 w-10 text-gray-200" />
                            </div>
                            <h3 className="text-xl font-bold text-brand-navy">No requisitions found</h3>
                            <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Your request list is currently empty.</p>
                        </div>
                    )}

                    {!loading && !error && sortedRequisitions.length > 0 && (
                        <>
                            {/* Mobile Card View (Unified Component Styling) */}
                            <div className="md:hidden space-y-5 px-5">
                                {groupRequisitionsByDate(sortedRequisitions).map((group) => (
                                    <div key={group.dateKey} className="space-y-2">
                                        <h4 className="text-xs font-bold text-black px-2.5 leading-5">
                                            {group.dateLabel}
                                        </h4>
                                        <div className="bg-white rounded-[20px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-gray-200 p-5 flex flex-col gap-7">
                                            {group.requisitions.map((req) => {
                                                const statusConfig = getStatusConfig(req.status);

                                                const getStatusIcon = (status: string) => {
                                                    const config = getStatusConfig(status);
                                                    switch (config.iconType) {
                                                        case 'clock': return <Clock size={15} className="text-blue-700" strokeWidth={1.5} />;
                                                        case 'check-circle': return <CheckCircle2 size={15} className="text-blue-700" strokeWidth={1.5} />;
                                                        case 'check': return <Check size={15} className="text-emerald-500" strokeWidth={1.5} />;
                                                        case 'alert': return <AlertCircle size={15} className="text-red-500" strokeWidth={1.5} />;
                                                        case 'rotate': return <RotateCcw size={15} className="text-gray-400" strokeWidth={1.5} />;
                                                        default: return <Clock size={15} className="text-gray-400" strokeWidth={1.5} />;
                                                    }
                                                };

                                                const isNew = outflowsSeen.isNew(req.created_at);

                                                return (
                                                    <div
                                                        key={req.id}
                                                        className="flex flex-col gap-1 active:opacity-70 transition-opacity cursor-pointer"
                                                        onClick={async () => {
                                                            try {
                                                                const fullReq = await requisitionService.getById(req.id);
                                                                setSelectedRequisition(fullReq);
                                                                if (req.has_unread_updates) {
                                                                    queryClient.setQueryData<Requisition[]>(requisitionsKey, prev => prev?.map(r => r.id === req.id ? { ...r, has_unread_updates: false } : r));
                                                                    requisitionService.markRead(req.id).then(() => refreshNotifications()).catch(console.error);
                                                                }
                                                            } catch (err) {
                                                                console.error('Failed to fetch requisition details:', err);
                                                                setSelectedRequisition(req as any);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-1.5 py-1">
                                                            <span className={`text-xs text-zinc-500 transition-all duration-500 ${isNew ? 'font-extrabold' : 'font-bold'}`}>
                                                                {req.requestor_name || 'System User'}
                                                            </span>
                                                            {isNew && (
                                                                <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-[9px] font-bold text-white leading-none tracking-wide">
                                                                    NEW
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex justify-between items-center gap-4">
                                                            <h3 className="font-normal text-base text-black leading-tight line-clamp-2">
                                                                {req.description}
                                                            </h3>
                                                            <div className="font-medium text-base text-black whitespace-nowrap text-right">
                                                                K{req.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            {getStatusIcon(req.status)}
                                                            <span className="text-xs font-normal text-slate-400">
                                                                {statusConfig.label}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </>
                    )}
                    </>)}

                    {inboxMode === 'inflows' && (<>
                        {/* Mobile Cash / Invoices sub-toggle */}
                        {!isRequestor && (
                            <div className="md:hidden px-5 pb-3">
                                <SegmentedControl
                                    variant="capsule"
                                    value={inflowSubMode}
                                    onChange={(v) => setInflowSubMode(v as 'cash' | 'invoices')}
                                    options={[
                                        {
                                            value: 'cash',
                                            label: (
                                                <span className="inline-flex items-center gap-1.5">
                                                    Cash
                                                    <span className="text-[9px] opacity-60">({sortedInflows.length})</span>
                                                </span>
                                            ),
                                        },
                                        {
                                            value: 'invoices',
                                            label: (
                                                <span className="inline-flex items-center gap-1.5">
                                                    Invoices
                                                    <span className="text-[9px] opacity-60">({sortedInvoices.length})</span>
                                                </span>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        )}

                        {/* Mobile: Cash inflows */}
                        {inflowSubMode === 'cash' && (<>
                            {inflowsLoading && inflows.length === 0 && (
                                <div className="md:hidden bg-white shadow-sm border border-gray-100 rounded-[2.5rem] p-24 text-center">
                                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-emerald-500 mb-6"></div>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading inflows...</p>
                                </div>
                            )}

                            {!inflowsLoading && sortedInflows.length === 0 && (
                                <div className="md:hidden bg-white shadow-sm border border-gray-100 rounded-3xl p-24 text-center">
                                    <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 mb-6 border border-gray-100">
                                        <FileText className="h-10 w-10 text-gray-200" />
                                    </div>
                                    <h3 className="text-xl font-bold text-brand-navy">No inflows yet</h3>
                                    <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Record a sale with the New Sale button to see money-in here.</p>
                                </div>
                            )}

                            {sortedInflows.length > 0 && (
                                <div className="md:hidden space-y-5 px-5">
                                    {groupInflowsByDate(sortedInflows).map((group) => (
                                        <div key={group.dateKey} className="space-y-2">
                                            <h4 className="text-xs font-bold text-black px-2.5 leading-5">{group.dateLabel}</h4>
                                            <div className="bg-white rounded-[20px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-gray-200 p-5 flex flex-col gap-7">
                                                {group.rows.map((row) => {
                                                    const statusConfig = getStatusConfig(row.status || 'COMPLETED');
                                                    const getStatusIcon = (status: string) => {
                                                        switch (getStatusConfig(status).iconType) {
                                                            case 'clock': return <Clock size={15} className="text-blue-700" strokeWidth={1.5} />;
                                                            case 'check-circle': return <CheckCircle2 size={15} className="text-blue-700" strokeWidth={1.5} />;
                                                            case 'check': return <Check size={15} className="text-emerald-500" strokeWidth={1.5} />;
                                                            case 'alert': return <AlertCircle size={15} className="text-red-500" strokeWidth={1.5} />;
                                                            case 'rotate': return <RotateCcw size={15} className="text-gray-400" strokeWidth={1.5} />;
                                                            default: return <Clock size={15} className="text-gray-400" strokeWidth={1.5} />;
                                                        }
                                                    };
                                                    const isNew = inflowsSeen.isNew(row.created_at || row.date);
                                                    return (
                                                        <div key={row.id} className="flex flex-col gap-1 cursor-pointer" onClick={() => setSelectedInflow(row)}>
                                                            <div className="flex items-center gap-1.5 py-1">
                                                                <span className={`text-xs text-zinc-500 transition-all duration-500 ${isNew ? 'font-extrabold' : 'font-bold'}`}>
                                                                    {row.reference_number || 'Receipt'}
                                                                </span>
                                                                {isNew && (
                                                                    <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-[9px] font-bold text-white leading-none tracking-wide">
                                                                        NEW
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex justify-between items-center gap-4">
                                                                <h3 className="font-normal text-base text-black leading-tight line-clamp-2">
                                                                    {inflowTitle(row.description)}
                                                                </h3>
                                                                <div className="font-medium text-base text-black whitespace-nowrap text-right">
                                                                    +K{(row.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 mt-1">
                                                                {getStatusIcon(row.status || 'COMPLETED')}
                                                                <span className="text-xs font-normal text-slate-400">
                                                                    {statusConfig.label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>)}

                        {/* Mobile: Invoice inflows */}
                        {inflowSubMode === 'invoices' && (
                            <div className="md:hidden px-5 space-y-5">
                                {invoicesLoading && invoices.length === 0 && (
                                    <div className="bg-white shadow-sm border border-gray-100 rounded-[2.5rem] p-24 text-center">
                                        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[#0058DB] mb-6"></div>
                                        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading invoices...</p>
                                    </div>
                                )}
                                {!invoicesLoading && sortedInvoices.length === 0 && (
                                    <div className="bg-white shadow-sm border border-gray-100 rounded-3xl p-24 text-center">
                                        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 mb-6 border border-gray-100">
                                            <FileText className="h-10 w-10 text-gray-200" />
                                        </div>
                                        <h3 className="text-xl font-bold text-brand-navy">No invoices yet</h3>
                                        <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Create an invoice from the New Sale flow to send a payment link.</p>
                                    </div>
                                )}
                                {sortedInvoices.length > 0 && (
                                    <div className="bg-white rounded-[20px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-gray-200">
                                        <InvoiceInbox
                                            invoices={sortedInvoices}
                                            onRowClick={setSelectedInvoice}
                                            onEdit={handleInvoiceEdit}
                                            onArchive={handleInvoiceArchive}
                                            onDelete={handleInvoiceDelete}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </>)}
                </div>
            </div>
        </Layout>

            <InflowDetailDrawer
                inflow={selectedInflow}
                onClose={() => setSelectedInflow(null)}
            />

            <InvoiceDetailModal
                invoice={selectedInvoice}
                isOpen={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
            />

            <InvoiceEditModal
                invoice={editingInvoice}
                isOpen={!!editingInvoice}
                onClose={() => setEditingInvoice(null)}
                onSave={handleInvoiceSave}
            />

            <RequisitionModal
                requisition={selectedRequisition}
                isOpen={!!selectedRequisition}
                onClose={() => {
                    setSelectedRequisition(null);
                    if (searchParams.has('id')) {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete('id');
                        setSearchParams(newParams, { replace: true });
                    }
                }}
                onStatusChange={handleStatusChange}
                onDelete={async (id) => {
                    if (window.confirm('Are you sure you want to delete this requisition? This action cannot be undone.')) {
                        try {
                            await requisitionService.delete(id);
                            setSelectedRequisition(null);
                            await loadRequisitions();
                        } catch (err: any) {
                            alert(err.message || 'Failed to delete requisition');
                        }
                    }
                }}
            />

            {/* Staff Loan / Salary Advance / Payroll wizards are shared across mobile
                (bottom sheet trigger) and desktop (New dropdown trigger) — neither has
                a bespoke desktop redesign yet, so both viewports reuse the same flow. */}
            <MobileStaffLoanWizard
                isOpen={isStaffLoanWizardOpen}
                onClose={() => setIsStaffLoanWizardOpen(false)}
                onSuccess={loadRequisitions}
            />
            <MobileSalaryAdvanceWizard
                isOpen={isSalaryAdvanceWizardOpen}
                onClose={() => setIsSalaryAdvanceWizardOpen(false)}
                onSuccess={loadRequisitions}
            />
            <MobilePayrollWizard
                isOpen={isPayrollWizardOpen}
                onClose={() => setIsPayrollWizardOpen(false)}
                onSuccess={loadRequisitions}
            />
            <MobileInvestWizard
                isOpen={isInvestWizardOpen}
                onClose={() => setIsInvestWizardOpen(false)}
            />

            {/* Mobile Only UI Elements - Outside Layout for best z-index/fixed behavior */}
            <div className="md:hidden">
                {/* Backdrop */}
                <div
                    className={`fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[150] transition-opacity duration-300 ${isNewRequisitionOpen && !isRequisitionWizardOpen && !isStaffLoanWizardOpen && !isSalaryAdvanceWizardOpen && !isPayrollWizardOpen && !isInvestWizardOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    onClick={() => setIsNewRequisitionOpen(false)}
                />

                {/* Bottom Sheet Container */}
                <div
                    className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[160] transition-transform duration-500 ease-out flex flex-col max-h-[85vh] ${isNewRequisitionOpen ? 'translate-y-0' : 'translate-y-full'}`}
                >
                    {/* Drag Handle */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                    </div>

                    {/* Sheet Header */}
                    <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                        <h2 className="text-xl font-bold text-brand-navy">{inboxMode === 'inflows' ? 'New Sale' : 'New Requisition'}</h2>
                        <button
                            onClick={() => setIsNewRequisitionOpen(false)}
                            className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sheet Content */}
                    <div className="p-5 space-y-3 overflow-y-auto pb-10">
                        {inboxMode === 'inflows' ? (
                            isCashHandler ? (
                                <button
                                    onClick={() => {
                                        setIsNewRequisitionOpen(false);
                                        navigate('/sales/new');
                                    }}
                                    className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                                >
                                    <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                        <ShoppingBag className="h-6 w-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 text-base">New Sale</div>
                                        <div className="text-xs text-emerald-600/70 font-medium">Ring up products & take payment</div>
                                    </div>
                                </button>
                            ) : (
                                <div className="text-center p-4 text-gray-400 text-sm">
                                    You don't have permission to record sales.
                                </div>
                            )
                        ) : (<>
                        <button
                            onClick={() => {
                                setIsNewRequisitionOpen(false);
                                setIsRequisitionWizardOpen(true);
                            }}
                            className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                        >
                            <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                <FileText className="h-6 w-6 text-brand-navy" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Requisition</div>
                                <div className="text-xs text-gray-500 font-medium">Office items, services, or equipment</div>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                setIsNewRequisitionOpen(false);
                                setIsSalaryAdvanceWizardOpen(true);
                            }}
                            className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                        >
                            <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                <History className="h-6 w-6 text-brand-navy" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Salary Advance</div>
                                <div className="text-xs text-gray-500 font-medium">Quick funds from your next payroll</div>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                setIsNewRequisitionOpen(false);
                                setIsStaffLoanWizardOpen(true);
                            }}
                            className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                        >
                            <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                <Plus className="h-6 w-6 text-brand-navy" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Staff Loan</div>
                                <div className="text-xs text-gray-500 font-medium">Long-term loan with fixed 15% interest</div>
                            </div>
                        </button>
                        
                        <button
                            onClick={() => {
                                setIsNewRequisitionOpen(false);
                                setIsInvestWizardOpen(true);
                            }}
                            className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                        >
                            <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                <TrendingUp className="h-6 w-6 text-brand-navy" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">Invest</div>
                                <div className="text-xs text-gray-500 font-medium">Grow your money with our partners</div>
                            </div>
                        </button>

                        {!isRequestor && (
                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    setIsPayrollWizardOpen(true);
                                }}
                                className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                    <FileText className="h-6 w-6 text-brand-navy" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-base">New Payroll Requisition</div>
                                    <div className="text-xs text-gray-500 font-medium">Batch processing via spreadsheet upload</div>
                                </div>
                            </button>
                        )}
                        </>)}
                    </div>
                </div>

                {/* Filter Bottom Sheet */}
                <div
                    className={`fixed inset-0 bg-brand-navy/60 backdrop-blur-xs z-[200] transition-opacity duration-300 ${isFilterSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    onClick={() => setIsFilterSheetOpen(false)}
                />
                <div
                    className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[210] transition-transform duration-500 ease-out flex flex-col max-h-[90vh] ${isFilterSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
                >
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                    </div>
                    <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                        <h2 className="text-xl font-bold text-brand-navy">Filters</h2>
                        <button
                            onClick={() => setIsFilterSheetOpen(false)}
                            className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 space-y-6 overflow-y-auto pb-28">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-3">Status</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: 'All', value: 'ALL' },
                                    { label: 'Draft', value: 'DRAFT' },
                                    { label: 'Awaiting Approval', value: 'PENDING_APPROVAL' },
                                    { label: 'Reviewed / Authorised', value: 'REVIEWED' },
                                    { label: 'Disbursed', value: 'DISBURSED' },
                                    { label: 'Returned', value: 'CHANGE_SUBMITTED' },
                                    { label: 'Completed', value: 'COMPLETED' },
                                ].map(status => (
                                    <button
                                        key={status.value}
                                        onClick={() => {
                                            if (status.value === 'ALL') {
                                                setTempStatus(['ALL']);
                                            } else {
                                                setTempStatus(prev => {
                                                    const withoutAll = prev.filter(s => s !== 'ALL');
                                                    if (withoutAll.includes(status.value)) {
                                                        const next = withoutAll.filter(s => s !== status.value);
                                                        return next.length === 0 ? ['ALL'] : next;
                                                    }
                                                    return [...withoutAll, status.value];
                                                });
                                            }
                                        }}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                                            (status.value === 'ALL' ? tempStatus.includes('ALL') : tempStatus.includes(status.value))
                                                ? 'bg-[#F0F7FF] text-[#006AFF] border-[#006AFF]/30'
                                                : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100'
                                        }`}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-3">Updates</label>
                            <div className="flex gap-2">
                                {[
                                    { label: 'All', value: 'ALL' },
                                    { label: 'Unread Only', value: 'UNREAD' },
                                    { label: 'Read Only', value: 'READ' }
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setTempRead(option.value as any)}
                                        className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all border text-center ${
                                            tempRead === option.value
                                                ? 'bg-[#F0F7FF] text-[#006AFF] border-[#006AFF]/30'
                                                : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {useDepartments && uniqueDepartments.length > 0 && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-3">Department</label>
                            <div className="flex flex-wrap gap-2">
                                {['ALL', ...uniqueDepartments].map(dept => (
                                    <button
                                        key={dept}
                                        onClick={() => {
                                            if (dept === 'ALL') {
                                                setTempDepartment(['ALL']);
                                            } else {
                                                setTempDepartment(prev => {
                                                    const withoutAll = prev.filter(d => d !== 'ALL');
                                                    if (withoutAll.includes(dept)) {
                                                        const next = withoutAll.filter(d => d !== dept);
                                                        return next.length === 0 ? ['ALL'] : next;
                                                    }
                                                    return [...withoutAll, dept];
                                                });
                                            }
                                        }}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                                            (dept === 'ALL' ? tempDepartment.includes('ALL') : tempDepartment.includes(dept))
                                                ? 'bg-[#F0F7FF] text-[#006AFF] border-[#006AFF]/30'
                                                : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100'
                                        }`}
                                    >
                                        {dept === 'ALL' ? 'All Departments' : dept}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-3">Date Range</label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Start Date</span>
                                    <input
                                        type="date"
                                        value={tempStartDate}
                                        onChange={(e) => setTempStartDate(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm text-brand-navy font-bold focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="flex-1">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">End Date</span>
                                    <input
                                        type="date"
                                        value={tempEndDate}
                                        onChange={(e) => setTempEndDate(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm text-brand-navy font-bold focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 border-t border-gray-50 bg-white flex items-center gap-3 absolute bottom-0 left-0 right-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                        <button
                            onClick={() => {
                                setTempStatus(['ALL']);
                                setTempRead('ALL');
                                setTempDepartment(['ALL']);
                                setTempStartDate('');
                                setTempEndDate('');
                            }}
                            className="px-6 py-4 bg-gray-50 text-gray-500 font-bold rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-sm"
                        >
                            Reset
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab(tempStatus);
                                setFilterRead(tempRead);
                                setFilterDepartment(tempDepartment);
                                setFilterStartDate(tempStartDate);
                                setFilterEndDate(tempEndDate);
                                setIsFilterSheetOpen(false);
                            }}
                            className="flex-1 py-4 bg-[#006AFF] hover:bg-blue-600 text-white font-bold rounded-2xl active:scale-[0.98] transition-all text-sm text-center shadow-md shadow-blue-100"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>

                {/* Mobile Wizards */}
                <MobileRequisitionWizard
                    isOpen={isRequisitionWizardOpen}
                    onClose={() => setIsRequisitionWizardOpen(false)}
                    onSuccess={loadRequisitions}
                />

                <div
                    className={`fixed bottom-24 right-6 z-[140] flex items-center justify-center transition-all duration-300 ${
                        selectedRequisition || isRequisitionWizardOpen || isStaffLoanWizardOpen || isSalaryAdvanceWizardOpen || isPayrollWizardOpen || isInvestWizardOpen || (inboxMode === 'inflows' && !isCashHandler)
                            ? 'opacity-0 pointer-events-none scale-0' 
                            : 'opacity-100 scale-100'
                    }`}
                    style={{ display: selectedRequisition || isRequisitionWizardOpen || isStaffLoanWizardOpen || isSalaryAdvanceWizardOpen || isPayrollWizardOpen || isInvestWizardOpen || (inboxMode === 'inflows' && !isCashHandler) ? 'none' : 'flex' }}
                >
                    <button
                        onClick={() => setIsNewRequisitionOpen(true)}
                        className="h-16 w-16 bg-[#006AFF] text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all hover:bg-blue-600"
                    >
                        <Plus size={32} />
                    </button>
                </div>
            </div>
        </>
    );
};
