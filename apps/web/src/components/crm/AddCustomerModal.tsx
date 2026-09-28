import React, { useState } from 'react';
import { crmService } from '../../services/crm.service';
import { X, Loader2, UserPlus } from 'lucide-react';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

export const AddCustomerModal: React.FC<Props> = ({ onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Customer name is required');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await crmService.createCustomer({
                name: name.trim(),
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                notes: notes.trim() || undefined,
            });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to add customer');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <UserPlus size={16} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Add New Customer</h2>
                            <p className="text-xs text-gray-500">Create a customer profile manually</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 p-6 flex flex-col gap-4">
                    <div>
                        <label className={LABEL}>Full Name *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Mary Banda"
                            className={INPUT}
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LABEL}>Phone Number</label>
                            <input
                                type="tel"
                                placeholder="0971234567"
                                className={INPUT}
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className={LABEL}>Email Address</label>
                            <input
                                type="email"
                                placeholder="mary@example.com"
                                className={INPUT}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={LABEL}>Notes / Description</label>
                        <textarea
                            rows={3}
                            placeholder="Add any internal notes about this customer..."
                            className={`${INPUT} resize-none`}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="h-9 px-5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Add Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
