import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, FileText, User, Building2, Calendar, Banknote, History } from 'lucide-react';
import { requisitionService, Requisition } from '../services/requisition.service';
import { useNavigate } from 'react-router-dom';

interface RequisitionDetailOverlayProps {
    requisitionId: string | null;
    onClose: () => void;
}

export const RequisitionDetailOverlay: React.FC<RequisitionDetailOverlayProps> = ({ requisitionId, onClose }) => {
    const navigate = useNavigate();
    const [requisition, setRequisition] = useState<Requisition | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (requisitionId) {
            loadRequisition(requisitionId);
        } else {
            setRequisition(null);
        }
    }, [requisitionId]);

    const loadRequisition = async (id: string) => {
        try {
            setLoading(true);
            const data = await requisitionService.getById(id);
            setRequisition(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to load details');
        } finally {
            setLoading(false);
        }
    };

    if (!requisitionId) return null;

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'SUBMITTED': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'AUTHORISED': return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'DISBURSED': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'RECEIVED': return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'REJECTED': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    return (
        <div className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-300 ${requisitionId ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-brand-navy/20 backdrop-blur-sm" onClick={onClose} />
            
            {/* Panel */}
            <div className={`relative w-full max-w-xl bg-white h-full shadow-2xl transform transition-transform duration-500 ease-out flex flex-col ${requisitionId ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div>
                        <div className="flex items-center space-x-2 mb-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Requisition Details</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight border ${requisition ? getStatusStyles(requisition.status) : ''}`}>
                                {requisition?.status || 'Loading...'}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-brand-navy">
                            {requisition?.description || 'Loading requisition...'}
                        </h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-brand-navy border border-transparent hover:border-gray-100 shadow-sm hover:shadow"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006AFF]"></div>
                            <p className="text-gray-400 text-sm font-medium">Fetching details...</p>
                        </div>
                    ) : error ? (
                        <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-center">
                            <AlertCircle className="mx-auto text-red-500 mb-2" size={32} />
                            <p className="text-red-700 font-bold">{error}</p>
                            <button onClick={() => requisitionId && loadRequisition(requisitionId)} className="mt-4 text-sm font-bold text-red-600 underline">Try again</button>
                        </div>
                    ) : requisition && (
                        <>
                             {/* Key Stats Row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#F0F7FF] p-5 rounded-xl border border-blue-50">
                                    <div className="flex items-center space-x-2 text-[#006AFF] mb-1">
                                        <Banknote size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Total Amount</span>
                                    </div>
                                    <div className="text-2xl font-black text-brand-navy tracking-tight">
                                        K{requisition.estimated_total.toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100/50">
                                    <div className="flex items-center space-x-2 text-emerald-600 mb-1">
                                        <Calendar size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Created Date</span>
                                    </div>
                                    <div className="text-xl font-bold text-brand-navy tracking-tight">
                                        {new Date(requisition.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                            </div>

                            {/* Info Groups */}
                            <div className="space-y-6">
                                <div className="flex items-start space-x-4">
                                    <div className="p-3 bg-gray-50 rounded-xl text-gray-400">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Requestor</div>
                                        <div className="text-base font-bold text-brand-navy">{requisition.requestor_name || 'System User'}</div>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-4">
                                    <div className="p-3 bg-gray-50 rounded-xl text-gray-400">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Department</div>
                                        <div className="text-base font-bold text-brand-navy">{requisition.department || 'Not Assigned'}</div>
                                    </div>
                                </div>

                                 <div className="flex items-start space-x-4">
                                    <div className="p-3 bg-gray-50 rounded-xl text-gray-400">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Itemized Breakdown</div>
                                        <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 shadow-sm">
                                            {requisition.items?.map((item: any) => (
                                                <div key={item.id} className="p-4 flex justify-between items-center bg-white hover:bg-gray-50/50 transition-colors">
                                                    <div>
                                                        <div className="text-sm font-bold text-brand-navy">{item.description}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium">Qty: {item.quantity} | Unit: K{item.unit_price}</div>
                                                    </div>
                                                    <div className="text-sm font-black text-brand-navy">K{item.estimated_amount.toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                 {/* Footer: Actions */}
                {!loading && requisition && (
                    <div className="p-8 border-t border-gray-100 bg-gray-50/30 flex items-center space-x-4">
                        <button 
                            className="flex-1 bg-white border border-gray-200 text-brand-navy py-4 rounded-xl font-black text-sm hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center space-x-2"
                            onClick={() => navigate(`/requisitions?id=${requisition.id}`)}
                        >
                            <History size={18} />
                            <span>View Timeline</span>
                        </button>
                        <button className="flex-1 bg-[#006AFF] text-white py-4 rounded-xl font-black text-sm hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2">
                            <CheckCircle2 size={18} />
                            <span>Approve Now</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
