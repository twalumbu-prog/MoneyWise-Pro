import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { FileText, History, XCircle, X } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { useAuth } from '../context/AuthContext';
import { RequisitionInbox } from '../components/RequisitionInbox';
import RequisitionModal from '../components/requisitions/RequisitionModal';
import { MobileRequisitionWizard } from '../components/requisitions/MobileRequisitionWizard';
import { MobileStaffLoanWizard } from '../components/requisitions/MobileStaffLoanWizard';
import { MobileSalaryAdvanceWizard } from '../components/requisitions/MobileSalaryAdvanceWizard';
import { MobilePayrollWizard } from '../components/requisitions/MobilePayrollWizard';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Plus, Clock, CheckCircle2, Check, AlertCircle, RotateCcw, ArrowUpDown, Filter } from 'lucide-react';
import { Requisition as RequisitionType, REQUISITION_STATUS_CONFIG, getStatusConfig } from '../services/requisition.service';
import { departmentService } from '../services/department.service';

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
    const { userRole, refreshNotifications } = useAuth();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentView] = useState<'active' | 'history'>('active');
    const [selectedRequisition, setSelectedRequisition] = useState<RequisitionType | null>(null);
    const [viewMode, setViewMode] = useState<'inbox' | 'scheduled'>('inbox');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string[]>(['ALL']);
    const [isNewRequisitionOpen, setIsNewRequisitionOpen] = useState(false); // State for mobile action sheet
    const [isRequisitionWizardOpen, setIsRequisitionWizardOpen] = useState(false);
    const [isStaffLoanWizardOpen, setIsStaffLoanWizardOpen] = useState(false);
    const [isSalaryAdvanceWizardOpen, setIsSalaryAdvanceWizardOpen] = useState(false);
    const [isPayrollWizardOpen, setIsPayrollWizardOpen] = useState(false);

    // Org departments config
    const [useDepartments, setUseDepartments] = useState(false);
    const [orgDepartments, setOrgDepartments] = useState<string[]>([]);

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

    useEffect(() => {
        loadRequisitions();
        departmentService.list()
            .then(({ use_departments, departments }) => {
                setUseDepartments(use_departments);
                if (use_departments) setOrgDepartments(departments.map(d => d.name));
            })
            .catch(() => {});
    }, []);

    const loadRequisitions = async () => {
        try {
            setLoading(true);
            const data = await requisitionService.getAll();
            setRequisitions(data);
            setError(null);
        } catch (err) {
            setError('Failed to load requisitions');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

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

    interface DateGroup {
        dateLabel: string;
        dateKey: string;
        requisitions: Requisition[];
    }

    const groupRequisitionsByDate = (reqs: Requisition[]): DateGroup[] => {
        const groupsMap: { [key: string]: Requisition[] } = {};
        reqs.forEach(req => {
            const dateObj = new Date(req.created_at);
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const dateKey = `${yyyy}-${mm}-${dd}`;
            
            if (!groupsMap[dateKey]) {
                groupsMap[dateKey] = [];
            }
            groupsMap[dateKey].push(req);
        });

        const sortedKeys = Object.keys(groupsMap).sort((a, b) => {
            return sortOrder === 'desc' 
                ? b.localeCompare(a) 
                : a.localeCompare(b);
        });

        return sortedKeys.map(key => {
            const firstReq = groupsMap[key][0];
            const dateObj = new Date(firstReq.created_at);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const dateLabel = `${dayName} - ${day}/${month}/${year}`;
            
            return {
                dateLabel,
                dateKey: key,
                requisitions: groupsMap[key]
            };
        });
    };

    return (
        <>
            <Layout noPadding={true} backgroundColor="bg-white">
            <div className={`space-y-0 md:space-y-8 ${isRequestor ? 'pb-32' : ''} md:max-w-[1440px] md:mx-auto md:px-12 md:py-8`}>
                {/* Desktop Action Row (Unified with Navigation Edges) */}
                <div className="hidden md:block pt-2 mb-4">
                    <div className="flex items-center justify-between gap-6">
                        {/* View Switcher */}
                        <div className="flex items-center bg-gray-100/50 p-1.5 rounded-2xl w-fit border border-gray-100 shadow-inner">
                            <button 
                                onClick={() => setViewMode('inbox')}
                                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'inbox' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-500'}`}
                            >
                                Requisition Inbox
                            </button>
                            <button 
                                onClick={() => setViewMode('scheduled')}
                                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'scheduled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-500'}`}
                            >
                                Scheduled
                            </button>
                        </div>

                        {/* Search & Actions */}
                        <div className="flex items-center space-x-4 flex-1 max-w-2xl">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text"
                                    placeholder="Find messages, requisitions and more"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#006AFF]/20 transition-all font-bold text-brand-navy placeholder:text-gray-400 shadow-sm"
                                />
                            </div>
                            <button 
                                onClick={loadRequisitions}
                                className="p-3.5 bg-white text-gray-400 hover:text-[#006AFF] rounded-2xl border border-gray-100 transition-all shadow-sm hover:shadow"
                                title="Refresh"
                            >
                                <RefreshCw size={20} />
                            </button>
                            <button 
                                onClick={() => navigate('/requisitions/new')}
                                className="bg-[#006AFF] text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-blue-600 transition-all flex items-center space-x-2 whitespace-nowrap"
                            >
                                <Plus size={20} />
                                <span>New Request</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Helper to get counts */}
                {(() => {
                    const getTabCount = (tabValue: string) => {
                        if (tabValue === 'ALL' || tabValue === 'COMPLETED') return 0;
                        return requisitions.filter(req => {
                            if (tabValue === 'PENDING_APPROVAL') return ['DRAFT', 'PENDING_APPROVAL'].includes(req.status);
                            if (tabValue === 'REVIEWED') return req.status === 'AUTHORISED';
                            const config = getStatusConfig(req.status);
                            return config.tab === tabValue && !config.isCompleted;
                        }).length;
                    };

                    return (
                        <>
                            {/* Status Tabs Row (Stand-alone) */}
                            <div className="hidden md:flex items-center space-x-2 pb-2">
                                {TABS.map((tab) => {
                                    const count = getTabCount(tab.value);
                                    return (
                                        <button
                                            key={tab.value}
                                            onClick={() => setActiveTab([tab.value])}
                                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap border flex items-center
                                                ${activeTab.length === 1 && activeTab[0] === tab.value
                                                    ? 'bg-[#F0F7FF] text-[#006AFF] border-[#006AFF]/30 shadow-sm'
                                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-transparent'}`}
                                        >
                                            <span>{tab.label}</span>
                                            {count > 0 && (
                                                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black min-w-[18px] text-center ${
                                                    activeTab.length === 1 && activeTab[0] === tab.value ? 'bg-[#006AFF] text-white' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Mobile Search & Sort/Filter Bar */}
                            <div className="md:hidden px-6 pt-2 pb-3">
                                <div className="flex items-center bg-white border border-gray-100 rounded-full px-4 py-3 shadow-sm">
                                    <Search className="text-gray-400 mr-2 flex-shrink-0" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="flex-1 bg-transparent border-none outline-none text-sm text-brand-navy placeholder:text-gray-400 font-bold"
                                    />
                                    <div className="w-[1px] h-6 bg-gray-100 mx-2 flex-shrink-0" />
                                    <button
                                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                        className={`p-1.5 rounded-xl transition-all flex-shrink-0 flex items-center justify-center ${
                                            sortOrder !== 'desc' ? 'bg-[#F0F7FF] text-[#006AFF]' : 'text-gray-400 hover:text-brand-navy'
                                        }`}
                                        title="Sort by Date"
                                    >
                                        <ArrowUpDown size={18} />
                                    </button>
                                    <button
                                        onClick={() => setIsFilterSheetOpen(true)}
                                        className={`p-1.5 rounded-xl transition-all flex-shrink-0 flex items-center justify-center ml-1 ${
                                            !activeTab.includes('ALL') || filterRead !== 'ALL' || (useDepartments && !filterDepartment.includes('ALL')) || filterStartDate || filterEndDate
                                                ? 'bg-[#F0F7FF] text-[#006AFF]'
                                                : 'text-gray-400 hover:text-brand-navy'
                                        }`}
                                        title="Filters"
                                    >
                                        <Filter size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Active Filter Chips */}
                            {(!activeTab.includes('ALL') || filterRead !== 'ALL' || (useDepartments && !filterDepartment.includes('ALL')) || filterStartDate || filterEndDate || sortOrder !== 'desc') && (
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

                <div className="w-full pt-6">
                    {loading && (
                        <div className="bg-white shadow-sm border border-gray-100 rounded-[2.5rem] p-24 text-center">
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

                    {!loading && !error && sortedRequisitions.length === 0 && (
                        <div className="bg-white shadow-sm border border-gray-100 rounded-3xl p-24 text-center">
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
                            <div className="md:hidden space-y-6 px-6">
                                {groupRequisitionsByDate(sortedRequisitions).map((group) => (
                                    <div key={group.dateKey} className="space-y-3">
                                        <h4 className="text-[12px] font-bold text-black px-1">
                                            {group.dateLabel}
                                        </h4>
                                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                            {group.requisitions.map((req) => {
                                                const statusConfig = getStatusConfig(req.status);
                                                
                                                const getStatusIcon = (status: string) => {
                                                    const config = getStatusConfig(status);
                                                    switch (config.iconType) {
                                                        case 'clock': return <Clock size={13} className="text-blue-500" />;
                                                        case 'check-circle': return <CheckCircle2 size={13} className="text-[#006AFF]" />;
                                                        case 'check': return <Check size={13} className="text-emerald-500" />;
                                                        case 'alert': return <AlertCircle size={13} className="text-red-500" />;
                                                        case 'rotate': return <RotateCcw size={13} className="text-gray-400" />;
                                                        default: return <Clock size={13} className="text-gray-400" />;
                                                    }
                                                };

                                                return (
                                                    <div 
                                                        key={req.id} 
                                                        className="p-5 active:bg-gray-50 transition-colors cursor-pointer"
                                                        onClick={async () => {
                                                            try {
                                                                const fullReq = await requisitionService.getById(req.id);
                                                                setSelectedRequisition(fullReq);
                                                                if (req.has_unread_updates) {
                                                                    setRequisitions(prev => prev.map(r => r.id === req.id ? { ...r, has_unread_updates: false } : r));
                                                                    requisitionService.markRead(req.id).then(() => refreshNotifications()).catch(console.error);
                                                                }
                                                            } catch (err) {
                                                                console.error('Failed to fetch requisition details:', err);
                                                                setSelectedRequisition(req as any);
                                                            }
                                                        }}
                                                    >
                                                        <div className="text-[11px] font-bold text-gray-400 mb-1.5">
                                                            {req.requestor_name || 'System User'}
                                                        </div>
                                                        <div className="flex justify-between items-start gap-4 mb-2">
                                                            <h3 className="font-normal text-[15px] text-brand-navy leading-tight line-clamp-2">
                                                                {req.description}
                                                            </h3>
                                                            <div className="font-normal text-[15px] text-brand-navy tracking-tight whitespace-nowrap text-right">
                                                                K{req.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            {getStatusIcon(req.status)}
                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
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

                            {/* Desktop View (Overhauled Inbox) */}
                            <div className="hidden md:block">
                                <RequisitionInbox 
                                    requisitions={sortedRequisitions} 
                                    onRowClick={async (id) => {
                                        try {
                                            const fullReq = await requisitionService.getById(id);
                                            setSelectedRequisition(fullReq);
                                            const clickedReq = sortedRequisitions.find(r => r.id === id);
                                            if (clickedReq?.has_unread_updates) {
                                                setRequisitions(prev => prev.map(r => r.id === id ? { ...r, has_unread_updates: false } : r));
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
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Layout>

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

            {/* Mobile Only UI Elements - Outside Layout for best z-index/fixed behavior */}
            <div className="md:hidden">
                {/* Backdrop */}
                <div
                    className={`fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[150] transition-opacity duration-300 ${isNewRequisitionOpen && !isRequisitionWizardOpen && !isStaffLoanWizardOpen && !isSalaryAdvanceWizardOpen && !isPayrollWizardOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
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
                        <h2 className="text-xl font-bold text-brand-navy">New Requisition</h2>
                        <button
                            onClick={() => setIsNewRequisitionOpen(false)}
                            className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sheet Content */}
                    <div className="p-5 space-y-3 overflow-y-auto pb-10">
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
                                <History className="h-6 w-6 text-emerald-600" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Salary Advance</div>
                                <div className="text-xs text-emerald-600/70 font-medium">Quick funds from your next payroll</div>
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
                                <Plus className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Staff Loan</div>
                                <div className="text-xs text-blue-600/70 font-medium">Long-term loan with fixed 15% interest</div>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                setIsNewRequisitionOpen(false);
                                setIsPayrollWizardOpen(true);
                            }}
                            className="w-full flex items-center p-4 text-left bg-white hover:bg-gray-50 rounded-2xl transition-all group active:scale-[0.98]"
                        >
                            <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                <FileText className="h-6 w-6 text-indigo-650" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 text-base">New Payroll Requisition</div>
                                <div className="text-xs text-indigo-600/70 font-medium">Batch processing via spreadsheet upload</div>
                            </div>
                        </button>
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

                <div 
                    className={`fixed bottom-24 right-6 z-[140] flex items-center justify-center transition-all duration-300 ${
                        selectedRequisition || isRequisitionWizardOpen || isStaffLoanWizardOpen || isSalaryAdvanceWizardOpen || isPayrollWizardOpen 
                            ? 'opacity-0 pointer-events-none scale-0' 
                            : 'opacity-100 scale-100'
                    }`}
                    style={{ display: selectedRequisition || isRequisitionWizardOpen || isStaffLoanWizardOpen || isSalaryAdvanceWizardOpen || isPayrollWizardOpen ? 'none' : 'flex' }}
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
