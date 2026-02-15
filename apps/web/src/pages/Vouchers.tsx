import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { voucherService, Voucher } from '../services/voucher.service';
import { FileText, Eye, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Vouchers: React.FC = () => {
    const navigate = useNavigate();
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    if (loading) return <Layout><div className="flex justify-center p-12">Loading...</div></Layout>;

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-navy">Vouchers</h1>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl">
                        {error}
                    </div>
                )}

                <div className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
                    <ul className="divide-y divide-gray-50">
                        {vouchers.length === 0 ? (
                            <li className="px-6 py-12 text-center text-gray-500 font-medium">
                                No vouchers found.
                            </li>
                        ) : (
                            vouchers.map((voucher) => (
                                <li key={voucher.id}>
                                    <div
                                        onClick={() => navigate(`/vouchers/${voucher.id}`)}
                                        className="px-6 py-5 hover:bg-gray-50/50 cursor-pointer transition-colors group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="bg-brand-gray p-3 rounded-xl mr-4 group-hover:bg-white group-hover:shadow-sm transition-all border border-gray-100">
                                                    <FileText className="h-6 w-6 text-brand-navy" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-brand-navy truncate">
                                                        {voucher.reference_number}
                                                    </p>
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
                                                <span className={`px-2.5 py-0.5 text-[10px] rounded-full font-bold uppercase tracking-wide border
                                                    ${voucher.status === 'POSTED'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                        : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                    {voucher.status}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/vouchers/${voucher.id}`);
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-brand-navy hover:bg-gray-100 rounded-lg transition-all"
                                                >
                                                    <Eye className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </Layout>
    );
};
