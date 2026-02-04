import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit, Trash2, MoreVertical, FileText, History } from 'lucide-react';
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
                {isRequestor ? (
                    <div className="md:hidden">
                        <h1 className="text-2xl font-bold text-gray-900">
                            {currentView === 'active' ? 'Active Requisitions' : 'Requisition History'}
                        </h1>
                    </div>
                ) : (
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900">Requisitions</h1>
                        <Link
                            to="/requisitions/new"
                            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                        >
                            <Plus className="h-5 w-5 mr-2" />
                            New Requisition
                        </Link>
                    </div>
                )}

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

            {/* Fixed Bottom Bar - Requestor Mobile Only */}
            {isRequestor && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 p-4 space-y-2 z-30">
                    <button
                        onClick={() => navigate('/requisitions/new')}
                        className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
                    >
                        <FileText className="h-5 w-5 mr-2" />
                        New Requisition
                    </button>
                    <button
                        onClick={() => {
                            setCurrentView(currentView === 'active' ? 'history' : 'active');
                            setFilterStatus('ALL');
                        }}
                        className="w-full flex items-center justify-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                    >
                        <History className="h-5 w-5 mr-2" />
                        {currentView === 'active' ? 'Requisition History' : 'Active Requisitions'}
                    </button>
                </div>
            )}
        </Layout>
    );
};
