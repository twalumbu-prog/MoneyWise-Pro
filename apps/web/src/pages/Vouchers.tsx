import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { voucherService, Voucher } from '../services/voucher.service';
import { requisitionService } from '../services/requisition.service';
import { FileText, Eye, Clock, Download, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AccountingModal } from '../components/accounting/AccountingModal';

export const Vouchers: React.FC = () => {
    const navigate = useNavigate();
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'pending' | 'posted'>('pending');

    // Modal State
    const [isAccountingModalOpen, setIsAccountingModalOpen] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        loadVouchers();
    }, []);

    const loadVouchers = async () => {
        try {
            setLoading(true);
            const data = await voucherService.getAll();
            setVouchers(data);
        } catch (err) {
            console.error('Failed to load vouchers', err);
            setError('Failed to load vouchers');
        } finally {
            setLoading(false);
        }
    };

    const handleVoucherClick = async (voucher: Voucher) => {
        if (voucher.status === 'POSTED' || voucher.status === 'POSTED_TO_QB' as any) {
            navigate(`/vouchers/${voucher.id}`);
        } else {
            // Open Accounting Modal for Pending vouchers
            try {
                setLoadingDetails(true);
                const fullRequisition = await requisitionService.getById(voucher.requisition_id);
                setSelectedRequisition(fullRequisition);
                setIsAccountingModalOpen(true);
            } catch (err) {
                console.error('Failed to load requisition details', err);
                alert('Failed to load details for accounting.');
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const pendingVouchers = vouchers.filter(v => v.status !== 'POSTED' && v.status !== 'POSTED_TO_QB' as any);
    const postedVouchers = vouchers.filter(v => v.status === 'POSTED' || v.status === 'POSTED_TO_QB' as any);

    const displayVouchers = activeTab === 'pending' ? pendingVouchers : postedVouchers;

    if (loading) return <Layout><div className="flex justify-center p-12">Loading...</div></Layout>;

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-brand-navy">Vouchers</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage and post accounting vouchers to QuickBooks.</p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl">
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'pending'
                                ? 'bg-white text-brand-navy shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Pending Accounting
                        {pendingVouchers.length > 0 && (
                            <span className="ml-2 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">
                                {pendingVouchers.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('posted')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'posted'
                                ? 'bg-white text-brand-navy shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Posted
                    </button>
                </div>

                <div className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
                    <ul className="divide-y divide-gray-50">
                        {displayVouchers.length === 0 ? (
                            <li className="px-6 py-12 text-center text-gray-500 font-medium">
                                {activeTab === 'pending'
                                    ? 'No pending vouchers. All caught up!'
                                    : 'No posted vouchers yet.'}
                            </li>
                        ) : (
                            displayVouchers.map((voucher) => (
                                <li key={voucher.id}>
                                    <div
                                        onClick={() => handleVoucherClick(voucher)}
                                        className="px-6 py-5 hover:bg-gray-50/50 cursor-pointer transition-colors group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className={`p-3 rounded-xl mr-4 transition-all border border-gray-100 ${activeTab === 'pending' ? 'bg-amber-50 border-amber-100' : 'bg-brand-gray group-hover:bg-white'
                                                    }`}>
                                                    <FileText className={`h-6 w-6 ${activeTab === 'pending' ? 'text-amber-600' : 'text-brand-navy'
                                                        }`} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center">
                                                        <p className="text-sm font-bold text-brand-navy truncate">
                                                            {voucher.reference_number}
                                                        </p>
                                                        {activeTab === 'pending' && (
                                                            <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                                Action Required
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        <span className="font-medium text-gray-500">Ref:</span> {voucher.requisitions?.description || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-6">
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-brand-navy">
                                                        K{Number(voucher.total_debit).toLocaleString()}
                                                    </p>
                                                    <div className="flex items-center justify-end text-xs text-gray-400 mt-0.5">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        {new Date(voucher.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>

                                                {activeTab === 'pending' ? (
                                                    <button
                                                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-bold rounded-lg text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all shadow-sm"
                                                    >
                                                        Review & Post
                                                        <ArrowRight className="ml-1.5 h-3 w-3" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/vouchers/${voucher.id}`);
                                                        }}
                                                        className="p-2 text-gray-300 hover:text-brand-navy hover:bg-gray-100 rounded-lg transition-all"
                                                    >
                                                        <Eye className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>

            {/* Accounting Modal */}
            {selectedRequisition && (
                <AccountingModal
                    isOpen={isAccountingModalOpen}
                    onClose={() => {
                        setIsAccountingModalOpen(false);
                        setSelectedRequisition(null);
                    }}
                    requisition={selectedRequisition}
                    onSuccess={() => {
                        loadVouchers(); // Reload list to move item to 'Posted'
                    }}
                />
            )}

            {loadingDetails && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-xl shadow-lg flex items-center space-x-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-green"></div>
                        <span className="text-sm font-medium text-gray-700">Loading details...</span>
                    </div>
                </div>
            )}
        </Layout>
    );
};
