import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit, Trash2, MoreVertical, FileText, History, ChevronDown, XCircle } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { useAuth } from '../context/AuthContext';

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

const TAB_FILTERS = ['ALL', 'DRAFT', 'SUBMITTED', 'AUTHORISED', 'DISBURSED', 'RECEIVED', 'REJECTED'];

export const RequisitionList: React.FC = () => {
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'active' | 'history'>('active');
    const [isNewRequisitionOpen, setIsNewRequisitionOpen] = useState(false);

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

    const getStatusBadge = (status: string) => {
        const styles = {
            DRAFT: 'bg-gray-100 text-gray-800',
            AUTHORISED: 'bg-green-100 text-green-800',
            DISBURSED: 'bg-blue-100 text-blue-800',
            RECEIVED: 'bg-purple-100 text-purple-800',
            REJECTED: 'bg-red-100 text-red-800',
        };
        return styles[status as keyof typeof styles] || styles.DRAFT;
    };

    // Determine completed statuses (for filtering active requisitions)
    const COMPLETED_STATUSES = ['RECEIVED', 'REJECTED'];

    const filteredRequisitions = requisitions.filter(req => {
        // For requestors in active view, exclude completed requisitions
        if (isRequestor && currentView === 'active' && COMPLETED_STATUSES.includes(req.status)) {
            return false;
        }

        // Apply status filter
        return filterStatus === 'ALL' ? true : req.status === filterStatus;
    });

    return (
        <Layout>
            <div className={`space-y-6 ${isRequestor ? 'pb-32' : ''}`}>
                {/* Page Header */}
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-navy">
                        {isRequestor
                            ? (currentView === 'active' ? 'Active Requisitions' : 'Requisition History')
                            : 'Requisitions'
                        }
                    </h1>
                    <div className={`relative ${isRequestor ? 'hidden md:block' : ''}`}>
                        <button
                            onClick={() => setIsNewRequisitionOpen(!isNewRequisitionOpen)}
                            className="flex items-center px-4 py-2.5 bg-brand-green text-white font-bold rounded-xl hover:bg-green-600 transition-all shadow-lg shadow-green-200 transform hover:-translate-y-0.5"
                        >
                            <Plus className="h-5 w-5 mr-2" />
                            <span className="hidden sm:inline">New Requisition</span>
                            <span className="sm:hidden text-xs">New</span>
                            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isNewRequisitionOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isNewRequisitionOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setIsNewRequisitionOpen(false)}
                                ></div>
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl ring-1 ring-black ring-opacity-5 z-20 overflow-hidden border border-gray-100">
                                    <div className="py-2">
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=EXPENSE');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors border-b border-gray-50"
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-brand-gray flex items-center justify-center mr-3 text-brand-navy">
                                                <FileText className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-brand-navy">New Expense</div>
                                                <div className="text-xs text-gray-500">General office expenses</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=ADVANCE');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors border-b border-gray-50"
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center mr-3 text-emerald-600">
                                                <History className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-brand-navy">Salary Advance</div>
                                                <div className="text-xs text-gray-500">Quick funds request</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=LOAN');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors"
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center mr-3 text-blue-600">
                                                <Plus className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-brand-navy">Staff Loan</div>
                                                <div className="text-xs text-gray-500">Long-term financing</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Status Filters - Hide for requestors in active view */}
                {!(isRequestor && currentView === 'active') && (
                    <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
                        {TAB_FILTERS.map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors border ${filterStatus === status
                                    ? 'bg-brand-navy text-white border-brand-navy shadow-md'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                    }`}
                            >
                                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                )}

                {loading && (
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-brand-green mb-4"></div>
                        <p className="text-gray-500 font-medium">Loading requisitions...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center text-red-700">
                        <div className="p-2 bg-red-100 rounded-lg mr-3">
                            <XCircle className="h-5 w-5" />
                        </div>
                        <p className="font-medium">{error}</p>
                    </div>
                )}

                {!loading && !error && filteredRequisitions.length === 0 && (
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-12 text-center">
                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 mb-4">
                            <FileText className="h-8 w-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">No requisitions found</h3>
                        <p className="text-gray-500 mt-1 max-w-sm mx-auto">There are no requisitions matching your current filters.</p>
                    </div>
                )}

                {!loading && !error && filteredRequisitions.length > 0 && (
                    <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                            {/* Backdrop for closing dropdowns */}
                            {activeDropdown && (
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setActiveDropdown(null)}
                                ></div>
                            )}

                            {filteredRequisitions.map((req) => (
                                <div
                                    key={req.id}
                                    className="bg-white shadow-sm border border-gray-100 rounded-xl p-5 space-y-3 relative cursor-pointer active:bg-gray-50 transition-colors"
                                    onClick={() => navigate(`/requisitions/${req.id}`)}
                                >
                                    {/* Top Row: Title | Amount | Kebab */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex-grow mr-2 min-w-0">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{req.department}</div>
                                            <h3 className="text-base font-bold text-brand-navy truncate">{req.description}</h3>
                                        </div>

                                        <div className="flex items-center space-x-3 flex-shrink-0">
                                            <span className="text-lg font-bold text-brand-green">K{req.estimated_total.toLocaleString()}</span>

                                            {/* Kebab Menu */}
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveDropdown(activeDropdown === req.id ? null : req.id);
                                                    }}
                                                    className="p-1 text-gray-300 hover:text-brand-navy rounded-full hover:bg-gray-50 transition-colors"
                                                >
                                                    <MoreVertical className="h-5 w-5" />
                                                </button>

                                                {activeDropdown === req.id && (
                                                    <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-xl z-20 border border-gray-100 py-1 overflow-hidden">
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center font-medium"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveDropdown(null);
                                                                // Handle Edit
                                                            }}
                                                        >
                                                            <Edit className="h-4 w-4 mr-2 text-gray-400" />
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center font-medium"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveDropdown(null);
                                                                // Handle Delete
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Second Row: Status | Requestor | Date */}
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide border ${getStatusBadge(
                                                    req.status
                                                ).replace('bg-', 'border-').replace('text-', 'text-').replace('100', '200')}`}
                                            >
                                                {req.status}
                                            </span>
                                            <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-full font-bold text-[10px] uppercase tracking-wide border border-gray-100">
                                                {req.requestor_name || 'Self'}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-medium text-gray-400">
                                            {new Date(req.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {/* Decorative type indicator */}
                                    {req.type && (
                                        <div className={`absolute left-0 top-6 w-1 h-8 rounded-r-full ${req.type === 'LOAN' ? 'bg-blue-400' :
                                            req.type === 'ADVANCE' ? 'bg-emerald-400' :
                                                'bg-brand-navy'
                                            }`}></div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            ID
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Requestor
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Department
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Type
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Description
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Total
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Created
                                        </th>
                                        <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {filteredRequisitions.map((req) => (
                                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                                                ...{req.id.slice(-4)}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                {req.requestor_name || 'Self'}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-medium text-gray-500">
                                                {req.department || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border ${req.type === 'LOAN' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                    req.type === 'ADVANCE' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                        'bg-gray-50 text-gray-600 border-gray-100'
                                                    }`}>
                                                    {req.type || 'EXPENSE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-brand-navy font-medium">
                                                {req.description}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-brand-navy">
                                                K{req.estimated_total.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`px-2.5 py-0.5 inline-flex text-[10px] font-bold rounded-full uppercase tracking-wide ${getStatusBadge(
                                                        req.status
                                                    )}`}
                                                >
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link to={`/requisitions/${req.id}`} className="p-1 text-gray-400 hover:text-brand-navy rounded hover:bg-gray-100 transition-colors">
                                                        <Eye className="h-5 w-5" />
                                                    </Link>
                                                    <button className="p-1 text-gray-400 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors">
                                                        <Edit className="h-5 w-5" />
                                                    </button>
                                                    <button className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors">
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

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
                        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl z-[70] transition-transform duration-500 ease-out md:hidden flex flex-col max-h-[85vh] ${isNewRequisitionOpen ? 'translate-y-0' : 'translate-y-full'
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
                            setFilterStatus('ALL');
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
