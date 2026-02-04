import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Check, X, Eye } from 'lucide-react';
import { requisitionService, Requisition } from '../services/requisition.service';

export const Approvals: React.FC = () => {
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
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            let msg = `Failed to load requisitions (API: ${apiUrl}). `;
            try {
                const details = JSON.parse(err.message);
                if (details.debug) {
                    msg += ` Debug: User=${details.debug.userId}, Role=${details.debug.foundRole}`;
                } else {
                    msg += ` Details: ${JSON.stringify(details)}`;
                }
            } catch (e) {
                // If it's not JSON, append the raw message so we see if it's 500 or Network Error
                msg += ` (Raw: ${err.message || err})`;
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
            DRAFT: 'bg-gray-100 text-gray-800',
            SUBMITTED: 'bg-yellow-100 text-yellow-800',
            AUTHORISED: 'bg-green-100 text-green-800',
            REJECTED: 'bg-red-100 text-red-800',
        };
        return styles[status as keyof typeof styles] || styles.DRAFT;
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900">Requisitions for Approval</h1>
                </div>

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

                {!loading && !error && requisitions.length === 0 && (
                    <div className="bg-white shadow rounded-lg p-8 text-center">
                        <p className="text-gray-500">No requisitions to review.</p>
                    </div>
                )}

                {!loading && !error && requisitions.length > 0 && (
                    <div className="bg-white shadow rounded-lg overflow-hidden">
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
                                        Description
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Amount
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {requisitions.map((req) => (
                                    <tr key={req.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            #{req.id.slice(0, 8)}...
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {req.requestor_name || 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {req.description}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            ${Number(req.estimated_total).toLocaleString()}
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
                                                {/* Only show actions for DRAFT or SUBMITTED */}
                                                {(req.status === 'SUBMITTED' || req.status === 'DRAFT') && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusUpdate(req.id, 'AUTHORISED')}
                                                            disabled={processingId === req.id}
                                                            className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 disabled:opacity-50"
                                                            title="Approve"
                                                        >
                                                            <Check className="h-5 w-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(req.id, 'REJECTED')}
                                                            disabled={processingId === req.id}
                                                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 disabled:opacity-50"
                                                            title="Reject"
                                                        >
                                                            <X className="h-5 w-5" />
                                                        </button>
                                                    </>
                                                )}
                                                <button className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-50">
                                                    <Eye className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
};
