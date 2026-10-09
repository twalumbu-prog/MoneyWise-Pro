import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Building2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

/**
 * Shown once, right after someone's FIRST Google/Apple sign-in. The login already created their account;
 * this picks what kind of MoneyWise they are setting up (same two choices as email sign-up) and creates it.
 */
export const CompleteProfile: React.FC = () => {
    const navigate = useNavigate();
    const { userName, refreshUserOrganizations, switchOrganization, signOut } = useAuth();
    const [type, setType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
    const [businessName, setBusinessName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [suggestion, setSuggestion] = useState('');

    const first = (userName || '').split(' ')[0];
    const canContinue = !busy && (type === 'INDIVIDUAL' || businessName.trim().length >= 2);

    const submit = async (nameOverride?: string) => {
        setBusy(true); setError(''); setSuggestion('');
        try {
            const response = await apiFetch('/auth/complete-social-signup', {
                method: 'POST',
                body: JSON.stringify({ accountType: type, organizationName: nameOverride ?? businessName.trim() }),
            });
            const data = await response.json();
            await refreshUserOrganizations();
            await switchOrganization(data.organizationId);
            navigate('/', { replace: true });
        } catch (e: any) {
            setError(e?.message || 'Something went wrong. Please try again.');
            if (e?.data?.suggestion) setSuggestion(String(e.data.suggestion));
        } finally {
            setBusy(false);
        }
    };

    const options = [
        { value: 'INDIVIDUAL' as const, title: 'Personal', body: 'Track your own money, savings and goals.', Icon: User },
        { value: 'BUSINESS' as const, title: 'Business', body: 'Run payments, requests and reporting for a business.', Icon: Building2 },
    ];

    return (
        <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
                <h1 className="text-2xl font-bold text-brand-navy">{first ? `Welcome, ${first}` : 'Welcome to MoneyWise'}</h1>
                <p className="text-sm text-gray-500 mt-1 mb-6">How will you use MoneyWise? You can add more later.</p>

                <div className="space-y-3">
                    {options.map(({ value, title, body, Icon }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { setType(value); setError(''); setSuggestion(''); }}
                            className={`w-full flex items-center gap-4 text-left p-4 rounded-2xl border-2 transition-all ${type === value ? 'border-[#006AFF] bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <span className={`w-11 h-11 rounded-full flex items-center justify-center ${type === value ? 'bg-[#006AFF] text-white' : 'bg-blue-50 text-[#006AFF]'}`}><Icon size={20} /></span>
                            <span className="flex-1">
                                <span className="block font-bold text-brand-navy">{title}</span>
                                <span className="block text-sm text-gray-500">{body}</span>
                            </span>
                            {type === value && <Check size={18} className="text-[#006AFF]" />}
                        </button>
                    ))}
                </div>

                {type === 'BUSINESS' && (
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-gray-600 mb-2">Business name</label>
                        <input
                            value={businessName}
                            onChange={(e) => { setBusinessName(e.target.value); setError(''); setSuggestion(''); }}
                            placeholder="e.g. Kapambwe Traders"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#006AFF]"
                        />
                    </div>
                )}

                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                {suggestion && (
                    <button type="button" onClick={() => { setBusinessName(suggestion); void submit(suggestion); }} className="mt-2 px-4 py-2 rounded-full bg-blue-50 text-[#006AFF] text-sm font-bold">
                        Use “{suggestion}” instead
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => submit()}
                    disabled={!canContinue}
                    className="mt-6 w-full flex justify-center py-3.5 rounded-xl text-sm font-bold text-white bg-[#006AFF] hover:bg-[#0052CC] disabled:opacity-50 transition-all"
                >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue'}
                </button>
                <button type="button" onClick={() => signOut()} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">Use a different account</button>
            </div>
        </div>
    );
};
