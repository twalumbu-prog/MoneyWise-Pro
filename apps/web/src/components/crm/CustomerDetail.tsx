import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crmService, Customer, CustomerTransaction } from '../../services/crm.service';
import { ArrowLeft, Pencil, X, Loader2, Receipt, FileText } from 'lucide-react';

interface Props {
    customerId: string;
    onBack: () => void;
    onUpdated?: () => void;
}

type DetailTab = 'history' | 'profile';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

export const CustomerDetail: React.FC<Props> = ({ customerId, onBack, onUpdated }) => {
    const [activeTab, setActiveTab] = useState<DetailTab>('history');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const qc = useQueryClient();

    const { data: customer } = useQuery<Customer>({
        queryKey: ['crm-customer', customerId],
        queryFn: () => crmService.getCustomer(customerId),
    });

    const { data: transactions = [], isLoading: txLoading } = useQuery<CustomerTransaction[]>({
        queryKey: ['crm-customer-transactions', customerId],
        queryFn: () => crmService.getCustomerTransactions(customerId),
    });

    // Edit form state
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [notes, setNotes] = useState('');

    const openEdit = () => {
        if (!customer) return;
        setName(customer.name || '');
        setPhone(customer.phone || '');
        setEmail(customer.email || '');
        setNotes(customer.notes || '');
        setSaveError('');
        setEditing(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setSaveError('Customer name is required');
            return;
        }

        setSaving(true);
        setSaveError('');
        try {
            await crmService.updateCustomer(customerId, {
                name: name.trim(),
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                notes: notes.trim() || undefined,
            });
            await qc.invalidateQueries({ queryKey: ['crm-customer', customerId] });
            await qc.invalidateQueries({ queryKey: ['crm-customers'] });
            setEditing(false);
            onUpdated?.();
        } catch (err: any) {
            setSaveError(err?.response?.data?.error || err.message || 'Failed to update customer');
        } finally {
            setSaving(false);
        }
    };

    const fullName = customer?.name || 'Customer Details';
    const isOwing = customer?.owing_status === 'OWING';

    const tabs: { value: DetailTab; label: string }[] = [
        { value: 'history', label: 'Transaction History' },
        { value: 'profile', label: 'Profile' },
    ];

    return (
        <div className="flex-1 px-5 pb-5 flex flex-col gap-4 h-full overflow-hidden pt-0">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 flex flex-col overflow-hidden px-5 py-3.5 gap-4">

                {/* Top Header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onBack}
                            className="p-2.5 rounded-[50px] hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <span className="text-base font-semibold text-black font-['IBM_Plex_Sans_Devanagari']">{fullName}</span>
                        {customer && (
                            <span className={`ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1.5 ${
                                isOwing ? 'bg-red-100 text-red-800' : 'bg-lime-300/25 text-green-900'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isOwing ? 'bg-red-500' : 'bg-lime-600'}`} />
                                {isOwing ? `Owing K${fmt(customer.owing_amount)}` : 'Clear'}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={openEdit}
                        className="flex items-center gap-1.5 h-8 px-4 py-2 bg-white rounded-lg shadow-[0px_3px_3px_0px_rgba(0,0,0,0.05)] border border-zinc-100 text-xs font-semibold text-black font-['DM_Sans'] leading-5 hover:bg-gray-50 transition-colors"
                    >
                        <Pencil size={11} />
                        Edit Profile
                    </button>
                </div>

                {/* Bio Strip */}
                <div className="h-20 px-6 rounded-xl border border-gray-200 flex items-center gap-12 flex-shrink-0">
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5 uppercase tracking-wide">Customer Name</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5 truncate">{fullName}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5 uppercase tracking-wide">Contact</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">{customer?.phone || '—'}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5 uppercase tracking-wide">Email</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5 truncate">{customer?.email || '—'}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5 uppercase tracking-wide">Total Spent</span>
                        <span className="text-xs font-bold text-emerald-700 font-['IBM_Plex_Sans_Devanagari'] leading-5">K{fmt(customer?.total_spend || 0)}</span>
                    </div>
                </div>

                {/* Tab Strip */}
                <div className="p-1 bg-slate-100 rounded-[60px] shadow-[inset_0px_4px_4px_0px_rgba(0,0,0,0.05)] flex items-center gap-2 flex-shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`flex-1 px-4 py-1 rounded-[50px] flex items-center justify-center gap-2.5 text-[10px] font-['IBM_Plex_Sans_Devanagari'] leading-6 transition-all ${
                                activeTab === tab.value
                                    ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.15)] font-medium text-black'
                                    : 'font-normal text-zinc-800 hover:bg-white/50'
                            }`}
                        >
                            {activeTab === tab.value && (
                                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
                            )}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 py-3.5 bg-white rounded-xl flex flex-col gap-4 overflow-hidden">

                    {activeTab === 'history' && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5">Transaction History</span>
                                <span className="text-xs text-gray-400 font-medium">{transactions.length} record{transactions.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
                                {txLoading ? (
                                    <div className="flex items-center justify-center h-24 text-sm text-gray-400">Loading transactions…</div>
                                ) : transactions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-32 gap-1 text-gray-400">
                                        <Receipt size={24} className="text-gray-300 mb-1" />
                                        <p className="text-xs font-medium">No transaction history found for this customer</p>
                                    </div>
                                ) : (
                                    transactions.map(item => {
                                        const isOwingItem = item.status === 'OWING' || item.status === 'ACTIVE';
                                        const isInvoice = item.type === 'INVOICE';
                                        return (
                                            <div
                                                key={item.id}
                                                className={`p-4 rounded-xl border transition-colors flex items-center justify-between ${
                                                    isOwingItem
                                                        ? 'bg-red-50/40 border-red-100 hover:bg-red-50/70'
                                                        : 'bg-white border-gray-100 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                        isInvoice ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {isInvoice ? <FileText size={18} /> : <Receipt size={18} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-gray-900 truncate">{item.description}</span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase ${
                                                                isOwingItem
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-green-100 text-green-800'
                                                            }`}>
                                                                {isOwingItem ? 'Open Invoice (Owing)' : 'Receipt (Paid)'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                                            {fmtDate(item.date)} {item.reference ? `· Ref: ${item.reference}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-4">
                                                    <span className={`text-xs font-bold ${isOwingItem ? 'text-red-700' : 'text-gray-900'}`}>
                                                        K{fmt(item.amount)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}

                    {activeTab === 'profile' && customer && (
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-5 p-1">
                                {[
                                    { label: 'Customer Name', value: customer.name },
                                    { label: 'Phone Number', value: customer.phone },
                                    { label: 'Email Address', value: customer.email },
                                    { label: 'Status', value: customer.status },
                                    { label: 'Invoice Status', value: customer.owing_status === 'OWING' ? `Owing (K${fmt(customer.owing_amount)})` : 'Clear' },
                                    { label: 'Open Invoices', value: `${customer.open_invoices_count}` },
                                    { label: 'Total Spent', value: `K${fmt(customer.total_spend)}` },
                                    { label: 'Member Since', value: fmtDate(customer.created_at) },
                                ].map(field => (
                                    <div key={field.label} className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{field.label}</span>
                                        <span className="text-xs text-gray-900 font-medium">{field.value || '—'}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-100">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Notes & Context</span>
                                <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100 min-h-[60px]">
                                    {customer.notes || 'No notes added for this customer.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Profile Modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Edit Customer Profile</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{fullName}</p>
                            </div>
                            <button
                                onClick={() => setEditing(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <div>
                                <label className={LABEL}>Full Name *</label>
                                <input className={INPUT} value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Phone</label>
                                    <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>Email</label>
                                    <input type="email" className={INPUT} value={email} onChange={e => setEmail(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>Notes</label>
                                <textarea
                                    rows={3}
                                    className={`${INPUT} resize-none`}
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>

                            {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}

                            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setEditing(false)}
                                    className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="h-9 px-5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                >
                                    {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
