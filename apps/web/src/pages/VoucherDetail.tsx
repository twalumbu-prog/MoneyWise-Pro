import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ArrowLeft, Printer } from 'lucide-react';
import { voucherService, Voucher } from '../services/voucher.service';

export const VoucherDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [voucher, setVoucher] = useState<Voucher | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            loadVoucher(id);
        }
    }, [id]);

    const loadVoucher = async (voucherId: string) => {
        try {
            setLoading(true);
            const data = await voucherService.getById(voucherId);
            setVoucher(data);
        } catch (err) {
            console.error('Failed to load voucher', err);
            setError('Failed to load voucher details');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Layout><div className="flex justify-center p-12">Loading...</div></Layout>;
    if (error || !voucher) return <Layout><div className="p-12 text-center text-red-600">Error: {error || 'Voucher not found'}</div></Layout>;

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center print:hidden">
                    <button
                        onClick={() => navigate('/vouchers')}
                        className="flex items-center text-gray-500 hover:text-brand-navy transition-colors font-medium"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Vouchers
                    </button>
                    <div className="flex space-x-3">
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                        </button>
                        {/* Download functionality can be added later */}
                    </div>
                </div>

                <div className="bg-white shadow overflow-hidden sm:rounded-lg" id="voucher-print">
                    <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg leading-6 font-bold text-brand-navy">
                                Payment Voucher
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                {voucher.reference_number}
                            </p>
                        </div>
                        <div className="text-right flex items-center space-x-3">
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-500">Status</p>
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                    ${voucher.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {voucher.status}
                                </span>
                            </div>
                            {voucher.status === 'DRAFT' && (
                                <button
                                    onClick={async () => {
                                        if (confirm('Are you sure you want to POST this voucher? This cannot be undone.')) {
                                            try {
                                                setLoading(true); // Reuse loading or add processing state
                                                await voucherService.post(voucher.id);
                                                loadVoucher(voucher.id);
                                            } catch (err: any) {
                                                alert('Failed to post voucher: ' + err.message);
                                                setLoading(false);
                                            }
                                        }
                                    }}
                                    className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-bold rounded-lg shadow-sm text-white bg-brand-green hover:bg-green-600 focus:outline-none"
                                >
                                    Post to Ledger
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="px-4 py-5 sm:px-6">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Payee / Description</dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {voucher.requisitions?.description || 'N/A'}
                                </dd>
                            </div>
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Date</dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {new Date(voucher.created_at).toLocaleDateString()}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <div className="flex flex-col">
                        <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                            <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                                <div className="shadow overflow-hidden border-b border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Account
                                                </th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Description
                                                </th>
                                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Debit
                                                </th>
                                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Credit
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {voucher.voucher_lines?.map((line) => (
                                                <tr key={line.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {line.accounts ? `${line.accounts.code} - ${line.accounts.name}` : 'Unknown Account'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {line.description}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                        {Number(line.debit) > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                        {Number(line.credit) > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Totals Row */}
                                            <tr className="bg-gray-50 font-bold">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan={2}>
                                                    Totals
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                    {Number(voucher.total_debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                    {Number(voucher.total_credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-5 sm:px-6 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-8 mt-8">
                            <div className="border-t border-black pt-2">
                                <p className="text-sm font-medium text-gray-500">Prepared By</p>
                            </div>
                            <div className="border-t border-black pt-2">
                                <p className="text-sm font-medium text-gray-500">Approved By</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};
