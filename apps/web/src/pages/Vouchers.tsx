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
                    <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                        {error}
                    </div>
                )}

                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {vouchers.length === 0 ? (
                            <li className="px-6 py-12 text-center text-gray-500">
                                No vouchers found.
                            </li>
                        ) : (
                            vouchers.map((voucher) => (
                                <li key={voucher.id}>
                                    <div
                                        onClick={() => navigate(`/vouchers/${voucher.id}`)}
                                        className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="bg-indigo-100 p-2 rounded-lg mr-4">
                                                    <FileText className="h-6 w-6 text-indigo-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-indigo-600 truncate">
                                                        {voucher.reference_number}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Req: {voucher.requisitions?.description || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-4">
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-gray-900">
                                                        ${Number(voucher.total_debit).toLocaleString()}
                                                    </p>
                                                    <div className="flex items-center text-xs text-gray-500">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        {new Date(voucher.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-1 text-xs rounded-full font-semibold
                                                    ${voucher.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {voucher.status}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/vouchers/${voucher.id}`);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-indigo-600"
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
