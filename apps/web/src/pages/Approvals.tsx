import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Check, X, Eye, ChevronRight } from 'lucide-react';
import { requisitionService, Requisition } from '../services/requisition.service';
import { useNavigate } from 'react-router-dom';

export const Approvals: React.FC = () => {
    const navigate = useNavigate();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        loadRequisitions();
    }, []);

    const loadRequisitions = async () => {
        try {
            setLoading(true);
            const data = await requisitionService.getAllAdmin();
            setRequisitions(data);
            setError(null);
        } catch (err: any) {
            console.error(err);
            let msg = `Failed to load requisitions`;
            try {
                const details = JSON.parse(err.message);
                if (details.debug) {
                    msg += `. User=${details.debug.userId}`;
                }
            } catch (e) {
                // Ignore
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: 'AUTHORISED' | 'REJECTED') => {
        try {
            setProcessingId(id);
            await requisitionService.updateStatus(id, status);
            // Reload list to get updated data
            await loadRequisitions();
        } catch (err) {
            console.error('Failed to update status', err);
            alert('Failed to update status');
        } finally {
            setProcessingId(null);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            DRAFT: 'bg-gray-100 text-gray-600 border border-gray-200',
            SUBMITTED: 'bg-amber-50 text-amber-700 border border-amber-200',
            AUTHORISED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            REJECTED: 'bg-red-50 text-red-700 border border-red-200',
        };
        return styles[status as keyof typeof styles] || styles.DRAFT;
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-navy">Approvals</h1>
                </div>

                {loading && (
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-brand-green mb-4"></div>
                        <p className="text-gray-500 font-medium">Loading requisitions...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center text-red-700">
                        <p className="font-medium">{error}</p>
                    </div>
                )}

                {!loading && !error && requisitions.length === 0 && (
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-12 text-center">
                        <p className="text-gray-500 font-medium">No requisitions to review.</p>
                    </div>
                )}

                {!loading && !error && requisitions.length > 0 && (
                    <>
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
                                            Description
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Amount
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {requisitions.map((req) => (
                                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                                                ...{req.id.slice(-4)}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                {req.requestor_name || 'Unknown'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-brand-navy font-medium">
                                                {req.description}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-brand-navy">
                                                K{Number(req.estimated_total).toLocaleString()}
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
                                                <div className="flex justify-end space-x-2">
                                                    {/* Only show actions for DRAFT or SUBMITTED */}
                                                    {(req.status === 'SUBMITTED' || req.status === 'DRAFT') && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(req.id, 'AUTHORISED')}
                                                                disabled={processingId === req.id}
                                                                className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                                                                title="Approve"
                                                            >
                                                                <Check className="h-5 w-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(req.id, 'REJECTED')}
                                                                disabled={processingId === req.id}
                                                                className="text-red-600 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                                                                title="Reject"
                                                            >
                                                                <X className="h-5 w-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => navigate(`/requisitions/${req.id}`)}
                                                        className="text-gray-400 hover:text-brand-navy p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                                    >
                                                        <Eye className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View */}
                        <div className="md:hidden space-y-4">
                            {requisitions.map((req) => (
                                <div
                                    key={req.id}
                                    onClick={() => navigate(`/requisitions/${req.id}`)}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 active:bg-gray-50 transition-colors"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-xs text-gray-400 font-mono mb-1">...{req.id.slice(-6)}</p>
                                            <h3 className="font-bold text-gray-900 leading-tight">{req.description}</h3>
                                            <p className="text-sm text-brand-navy mt-1 opacity-80">{req.requestor_name || 'Unknown'}</p>
                                        </div>
                                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] font-bold rounded-full uppercase tracking-wide shrink-0 ${getStatusBadge(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-end border-t border-gray-50 pt-3 mt-1">
                                        <div>
                                            <p className="text-xs text-gray-400 mb-0.5">{new Date(req.created_at).toLocaleDateString()}</p>
                                            <p className="font-black text-brand-green">K{Number(req.estimated_total).toLocaleString()}</p>
                                        </div>
                                        <div className="flex items-center text-gray-400">
                                            <span className="text-xs font-medium mr-1">View</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
};
