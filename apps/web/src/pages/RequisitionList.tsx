import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { FileText, History, XCircle } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { useAuth } from '../context/AuthContext';
import { RequisitionInbox } from '../components/RequisitionInbox';
import RequisitionModal from '../components/requisitions/RequisitionModal';
import { Search, RefreshCw, Plus } from 'lucide-react';
import { Requisition as RequisitionType, REQUISITION_STATUS_CONFIG, getStatusConfig } from '../services/requisition.service';

interface Requisition {
    id: string;
    description: string;
    estimated_total: number;
    status: string;
    created_at: string;
    requestor_name?: string;
    department?: string;
    type?: string;
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

export const RequisitionList: React.FC = () => {
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'active' | 'history'>('active');
    const [selectedRequisition, setSelectedRequisition] = useState<RequisitionType | null>(null);
    const [viewMode, setViewMode] = useState<'inbox' | 'scheduled'>('inbox');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');
    const [isNewRequisitionOpen, setIsNewRequisitionOpen] = useState(false); // State for mobile bottom sheet

    const isRequestor = userRole === 'REQUESTOR';

    useEffect(() => {
        loadRequisitions();
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



    // Determine completed statuses (for filtering active requisitions)
    

    const filteredRequisitions = requisitions.filter(req => {
        // Apply search filter
        const matchesSearch = req.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (req.requestor_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        // Apply tab filter
        const config = getStatusConfig(req.status);
        if (activeTab === 'REVIEWED') {
            if (!['AUTHORISED', 'REJECTED'].includes(req.status)) return false;
        } else if (activeTab === 'COMPLETED') {
            if (!config.isCompleted) return false;
        } else if (activeTab !== 'ALL') {
            if (config.tab !== activeTab) return false;
        }

        // For requestors in active view, exclude completed requisitions
        if (isRequestor && currentView === 'active' && COMPLETED_STATUSES.includes(req.status)) {
            return false;
        }

        return true;
    });

    return (
        <Layout>
            <div className={`space-y-8 ${isRequestor ? 'pb-32' : ''}`}>
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

                {/* Status Tabs Row (Stand-alone) */}
                <div className="hidden md:flex items-center space-x-2 pb-2">
                    {TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap border
                                ${activeTab === tab.value 
                                    ? 'bg-[#F0F7FF] text-[#006AFF] border-[#006AFF]/30 shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-transparent'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Page Header (Mobile Only) */}
                <div className="md:hidden px-4">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-brand-navy">
                            {isRequestor
                                ? (currentView === 'active' ? 'Active Requisitions' : 'Requisition History')
                                : 'Requisitions'
                            }
                        </h1>
                        <button
                            onClick={() => setIsNewRequisitionOpen(!isNewRequisitionOpen)}
                            className="flex items-center p-3 bg-brand-green text-white rounded-xl shadow-lg"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                </div>

                <div className="w-full">
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

                    {!loading && !error && filteredRequisitions.length === 0 && (
                        <div className="bg-white shadow-sm border border-gray-100 rounded-3xl p-24 text-center">
                            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 mb-6 border border-gray-100">
                                <FileText className="h-10 w-10 text-gray-200" />
                            </div>
                            <h3 className="text-xl font-bold text-brand-navy">No requisitions found</h3>
                            <p className="text-gray-400 mt-2 max-w-sm mx-auto font-medium">Your request list is currently empty.</p>
                        </div>
                    )}

                    {!loading && !error && filteredRequisitions.length > 0 && (
                        <>
                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {/* ... existing mobile logic remains ... */}
                                {filteredRequisitions.map((req) => (
                                    <div key={req.id} className="bg-white p-4 rounded-2xl border border-gray-100" onClick={() => navigate(`/requisitions/${req.id}`)}>
                                        <h3 className="font-bold text-brand-navy">{req.description}</h3>
                                        <p className="text-xs text-gray-400">{req.status}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop View (Overhauled Inbox) */}
                            <div className="hidden md:block">
                                <RequisitionInbox 
                                    requisitions={filteredRequisitions} 
                                    onRowClick={async (id) => {
                                        try {
                                            const fullReq = await requisitionService.getById(id);
                                            setSelectedRequisition(fullReq);
                                        } catch (err) {
                                            console.error('Failed to fetch requisition details:', err);
                                        }
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            <RequisitionModal 
                requisition={selectedRequisition} 
                isOpen={!!selectedRequisition} 
                onClose={() => setSelectedRequisition(null)}
                onStatusChange={handleStatusChange}
            />

            {/* Premium Bottom Sheet - Mobile Only */}
            {isRequestor && (
                <>
                    {/* Backdrop */}
                    <div
                        className={`fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[60] transition-opacity duration-300 md:hidden ${isNewRequisitionOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                            }`}
                        onClick={() => setIsNewRequisitionOpen(false)}
                    />

                    {/* Bottom Sheet Container */}
                    <div
                        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[70] transition-transform duration-500 ease-out md:hidden flex flex-col max-h-[85vh] ${isNewRequisitionOpen ? 'translate-y-0' : 'translate-y-full'
                            }`}
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
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Sheet Content */}
                        <div className="p-5 space-y-3 overflow-y-auto pb-10">
                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=EXPENSE');
                                }}
                                className="w-full flex items-center p-4 text-left bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                    <FileText className="h-6 w-6 text-brand-navy" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-base">General Expense</div>
                                    <div className="text-xs text-gray-500 font-medium">Office items, services, or equipment</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=ADVANCE');
                                }}
                                className="w-full flex items-center p-4 text-left bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100/30 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                    <History className="h-6 w-6 text-emerald-600" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-base">Salary Advance</div>
                                    <div className="text-xs text-emerald-600/70 font-medium">Quick funds from your next payroll</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=LOAN');
                                }}
                                className="w-full flex items-center p-4 text-left bg-blue-50/50 hover:bg-blue-50 border border-blue-100/30 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-3 bg-white rounded-xl mr-4 shadow-sm group-hover:shadow-md transition-shadow">
                                    <Plus className="h-6 w-6 text-blue-600" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-base">Staff Loan</div>
                                    <div className="text-xs text-blue-600/70 font-medium">Long-term loan with fixed 15% interest</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {isRequestor && (
                <div className="md:hidden fixed bottom-6 left-6 right-6 bg-brand-navy/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-2 flex z-[55] rounded-2xl border border-white/10">
                    <button
                        onClick={() => setIsNewRequisitionOpen(!isNewRequisitionOpen)}
                        className="flex-[2] flex items-center justify-center px-6 py-3 bg-brand-green text-white rounded-xl transition-all font-bold text-base shadow-lg active:scale-95"
                    >
                        <Plus className={`h-5 w-5 mr-2 transition-transform duration-300 ${isNewRequisitionOpen ? 'rotate-45' : ''}`} />
                        New Request
                    </button>
                    <button
                        onClick={() => {
                            setCurrentView(currentView === 'active' ? 'history' : 'active');
                            setActiveTab('ALL');
                        }}
                        className="flex-1 flex items-center justify-center p-3 text-white border-l border-white/10 active:scale-95 transition-all"
                    >
                        <History className="h-5 w-5" />
                    </button>
                </div>
            )}
        </Layout>
    );
};
