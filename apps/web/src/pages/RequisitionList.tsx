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
                    <h1 className="text-2xl font-bold text-gray-900">
                        {isRequestor
                            ? (currentView === 'active' ? 'Active Requisitions' : 'Requisition History')
                            : 'Requisitions'
                        }
                    </h1>
                    <div className={`relative ${isRequestor ? 'hidden md:block' : ''}`}>
                        <button
                            onClick={() => setIsNewRequisitionOpen(!isNewRequisitionOpen)}
                            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
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
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 z-20 overflow-hidden">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=EXPENSE');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors border-b border-gray-50"
                                        >
                                            <FileText className="h-4 w-4 mr-3 text-indigo-500" />
                                            New Expense
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=ADVANCE');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors border-b border-gray-50"
                                        >
                                            <History className="h-4 w-4 mr-3 text-emerald-500" />
                                            Salary Advance
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsNewRequisitionOpen(false);
                                                navigate('/requisitions/new?type=LOAN');
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"
                                        >
                                            <Plus className="h-4 w-4 mr-3 text-blue-500" />
                                            Staff Loan
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
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === status
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                )}

                {loading && (
                    <div className="bg-white shadow rounded-lg p-8 text-center">
                        <p className="text-gray-500">Loading requisitions...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-800">{error}</p>
                    </div>
                )}

                {!loading && !error && filteredRequisitions.length === 0 && (
                    <div className="bg-white shadow rounded-lg p-8 text-center">
                        <p className="text-gray-500">No requisitions found.</p>
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
                                    className="bg-white shadow rounded-lg p-4 space-y-3 relative cursor-pointer active:bg-gray-50 transition-colors"
                                    onClick={() => navigate(`/requisitions/${req.id}`)}
                                >
                                    {/* Top Row: Title | Amount | Kebab */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex-grow mr-2 min-w-0">
                                            <div className="text-xs text-gray-500 font-medium mb-0.5">{req.department}</div>
                                            <h3 className="text-base font-semibold text-gray-900 truncate">{req.description}</h3>
                                        </div>

                                        <div className="flex items-center space-x-3 flex-shrink-0">
                                            <span className="text-lg font-bold text-gray-900">K{req.estimated_total.toLocaleString()}</span>

                                            {/* Kebab Menu */}
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveDropdown(activeDropdown === req.id ? null : req.id);
                                                    }}
                                                    className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                                                >
                                                    <MoreVertical className="h-5 w-5" />
                                                </button>

                                                {activeDropdown === req.id && (
                                                    <div className="absolute right-0 mt-2 w-32 bg-white rounded-md shadow-lg z-20 border border-gray-100 py-1">
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveDropdown(null);
                                                                // Handle Edit
                                                            }}
                                                        >
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
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
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(
                                                    req.status
                                                )}`}
                                            >
                                                {req.status}
                                            </span>
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium text-xs">
                                                {req.requestor_name || 'Self'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(req.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {/* Footer: ID */}
                                    <div className="pt-2">
                                        <span className="text-xs text-gray-400">ID: ...{req.id.slice(-6)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block bg-white shadow rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            ID
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Requestor
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Department
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Type
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Description
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estimated Total
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Created
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredRequisitions.map((req) => (
                                        <tr key={req.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                                                ...{req.id.slice(-6)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900">
                                                {req.requestor_name || 'Self'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {req.department || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${req.type === 'LOAN' ? 'bg-blue-100 text-blue-700' :
                                                    req.type === 'ADVANCE' ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {req.type || 'EXPENSE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900">
                                                {req.description}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                K{req.estimated_total.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(
                                                        req.status
                                                    )}`}
                                                >
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end space-x-2">
                                                    <Link to={`/requisitions/${req.id}`} className="text-indigo-600 hover:text-indigo-900">
                                                        <Eye className="h-5 w-5" />
                                                    </Link>
                                                    <button className="text-yellow-600 hover:text-yellow-900">
                                                        <Edit className="h-5 w-5" />
                                                    </button>
                                                    <button className="text-red-600 hover:text-red-900">
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
                        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300 md:hidden ${isNewRequisitionOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
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
                            <h2 className="text-lg font-bold text-gray-900">New Requisition</h2>
                            <button
                                onClick={() => setIsNewRequisitionOpen(false)}
                                className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
                            >
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Sheet Content */}
                        <div className="p-5 space-y-3 overflow-y-auto pb-10">
                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=EXPENSE');
                                }}
                                className="w-full flex items-center p-4 text-left bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100/50 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-2.5 bg-indigo-600 rounded-xl mr-4 shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
                                    <FileText className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">General Expense</div>
                                    <div className="text-xs text-indigo-600/70 font-medium">Office items, services, or equipment</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=ADVANCE');
                                }}
                                className="w-full flex items-center p-4 text-left bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100/50 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-2.5 bg-emerald-600 rounded-xl mr-4 shadow-lg shadow-emerald-200 group-hover:scale-105 transition-transform">
                                    <History className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Salary Advance</div>
                                    <div className="text-xs text-emerald-600/70 font-medium">Quick funds from your next payroll</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setIsNewRequisitionOpen(false);
                                    navigate('/requisitions/new?type=LOAN');
                                }}
                                className="w-full flex items-center p-4 text-left bg-blue-50/50 hover:bg-blue-50 border border-blue-100/50 rounded-2xl transition-all group active:scale-[0.98]"
                            >
                                <div className="p-3 bg-blue-600 rounded-xl mr-4 shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
                                    <Plus className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Staff Loan</div>
                                    <div className="text-xs text-blue-600/70 font-medium">Long-term loan with fixed 15% interest</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {isRequestor && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-gray-100 p-4 px-6 space-x-4 flex z-[55] rounded-t-3xl">
                    <button
                        onClick={() => setIsNewRequisitionOpen(!isNewRequisitionOpen)}
                        className="flex-[2.5] flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-2xl transition-all font-bold text-base shadow-xl shadow-indigo-200 active:scale-95"
                    >
                        <Plus className={`h-5 w-5 mr-2 transition-transform duration-300 ${isNewRequisitionOpen ? 'rotate-45' : ''}`} />
                        New Requisition
                    </button>
                    <button
                        onClick={() => {
                            setCurrentView(currentView === 'active' ? 'history' : 'active');
                            setFilterStatus('ALL');
                        }}
                        className="flex-1 flex items-center justify-center p-3 bg-white text-gray-700 border-2 border-gray-100 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                    >
                        <History className="h-5 w-5" />
                    </button>
                </div>
            )}
        </Layout>
    );
};
