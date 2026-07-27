import React, { useState, useEffect } from 'react';
import { 
    User, 
    Building2, 
    Smartphone, 
    CheckCircle, 
    AlertCircle, 
    Loader2, 
    Save
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface PaymentInfo {
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    mobile_money_name?: string;
}

const BANK_OPTIONS = ['Absa Bank', 'Access Bank', 'Atlas Mara', 'Ecobank', 'FNB', 'Indo-Zambia Bank', 'Investrust', 'Stanbic Bank', 'Standard Chartered', 'ZANACO', 'Zambia Industrial Commercial Bank'];
const MOBILE_MONEY_PROVIDERS = ['Airtel Money', 'MTN Mobile Money', 'Zamtel Kwacha'];

export const MyProfileSettings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    const [formData, setFormData] = useState({
        name: '',
        employee_id: '',
        role: ''
    });

    const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
        bank_name: '',
        bank_account_number: '',
        bank_account_name: '',
        mobile_money_provider: '',
        mobile_money_number: '',
        mobile_money_name: ''
    });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await apiFetch('/users/me');
            const data = await response.json();
            
            setFormData({
                name: data.name || '',
                employee_id: data.employee_id || '',
                role: data.role || ''
            });

            if (data.payment_info) {
                setPaymentInfo({
                    bank_name: data.payment_info.bank_name || '',
                    bank_account_number: data.payment_info.bank_account_number || '',
                    bank_account_name: data.payment_info.bank_account_name || '',
                    mobile_money_provider: data.payment_info.mobile_money_provider || '',
                    mobile_money_number: data.payment_info.mobile_money_number || '',
                    mobile_money_name: data.payment_info.mobile_money_name || ''
                });
            }
        } catch (err: any) {
            console.error('Failed to load profile:', err);
            setError('Failed to load profile details.');
        } finally {
            setLoading(false);
        }
    };

    const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setPaymentInfo(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);

            const response = await apiFetch('/users/me/payment-info', {
                method: 'PUT',
                body: JSON.stringify({ payment_info: paymentInfo })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update payment info');
            }

            setSuccessMessage('Payment information updated successfully.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Update failed:', err);
            setError(err.message || 'Failed to update payment information.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
                <span className="ml-3 text-gray-500 font-medium">Loading profile...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="overflow-hidden">
                <div className="pb-6 border-b border-gray-100 mb-8">
                    <h3 className="justify-center text-gray-900 text-base font-semibold font-['DM_Sans'] leading-5">
                        My Profile
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase mt-1">
                        Personal information and disbursement details.
                    </p>
                </div>

                <div className="py-6">


                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center">
                            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="mb-6 bg-green-50 border border-brand-green text-green-700 px-4 py-3 rounded-xl text-sm flex items-center">
                            <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                            {successMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Bank Account Section */}
                        <div className="border-2 border-gray-200 bg-gray-50/30 rounded-xl p-6">
                            <h4 className="text-sm font-black text-brand-navy uppercase tracking-widest mb-4 flex items-center">
                                <Building2 className="h-4 w-4 mr-2 text-[#006AFF]" />
                                Bank Account Details
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Bank Name</label>
                                    <select
                                        name="bank_name"
                                        value={paymentInfo.bank_name}
                                        onChange={handlePaymentChange}
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] outline-none transition-all"
                                    >
                                        <option value="">Select a bank...</option>
                                        {BANK_OPTIONS.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Account Number</label>
                                    <input
                                        type="text"
                                        name="bank_account_number"
                                        value={paymentInfo.bank_account_number}
                                        onChange={handlePaymentChange}
                                        placeholder="Enter account number"
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] outline-none transition-all"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Account Holder Name</label>
                                    <input
                                        type="text"
                                        name="bank_account_name"
                                        value={paymentInfo.bank_account_name}
                                        onChange={handlePaymentChange}
                                        placeholder="Name as it appears on bank statement"
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Mobile Money Section */}
                        <div className="border-2 border-gray-200 bg-gray-50/30 rounded-xl p-6">
                            <h4 className="text-sm font-black text-brand-navy uppercase tracking-widest mb-4 flex items-center">
                                <Smartphone className="h-4 w-4 mr-2 text-emerald-600" />
                                Mobile Money Details
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Network Provider</label>
                                    <select
                                        name="mobile_money_provider"
                                        value={paymentInfo.mobile_money_provider}
                                        onChange={handlePaymentChange}
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    >
                                        <option value="">Select a provider...</option>
                                        {MOBILE_MONEY_PROVIDERS.map(provider => (
                                            <option key={provider} value={provider}>{provider}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Phone Number</label>
                                    <input
                                        type="tel"
                                        name="mobile_money_number"
                                        value={paymentInfo.mobile_money_number}
                                        onChange={handlePaymentChange}
                                        placeholder="e.g. 097..."
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">Registered Name</label>
                                    <input
                                        type="text"
                                        name="mobile_money_name"
                                        value={paymentInfo.mobile_money_name}
                                        onChange={handlePaymentChange}
                                        placeholder="Name registered on Mobile Money"
                                        className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-start border-t border-gray-100 mt-6 max-w-4xl">
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center px-5 py-2 border border-transparent shadow-sm text-sm font-semibold rounded-lg text-white bg-[#10A34A] hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
