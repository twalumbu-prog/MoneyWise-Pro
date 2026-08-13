import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Loader2 } from 'lucide-react';
import type { PaymentLink, UpdateInvoiceLinkPayload } from '../services/product.service';
import { invoiceNumber } from './InvoiceInbox';

interface InvoiceEditModalProps {
    invoice: PaymentLink | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, payload: UpdateInvoiceLinkPayload) => Promise<void>;
}

const Field: React.FC<{
    label: string;
    icon: React.ReactNode;
    required?: boolean;
    children: React.ReactNode;
}> = ({ label, icon, required, children }) => (
    <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <span className="text-gray-400">{icon}</span>
            {label}
            {required && <span className="text-red-400">*</span>}
        </label>
        {children}
    </div>
);

const inputClass =
    'w-full px-3.5 py-2.5 rounded-xl border border-[#E8EEF8] bg-white text-sm text-gray-800 font-medium ' +
    'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] transition';

export const InvoiceEditModal: React.FC<InvoiceEditModalProps> = ({
    invoice,
    isOpen,
    onClose,
    onSave,
}) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync fields when the target invoice changes
    useEffect(() => {
        if (invoice) {
            setName(invoice.customer_name || '');
            setPhone(invoice.customer_phone || '');
            setEmail(invoice.customer_email || '');
            setError(null);
        }
    }, [invoice]);

    if (!invoice) return null;

    const isDirty =
        name.trim() !== invoice.customer_name ||
        phone.trim() !== invoice.customer_phone ||
        (email.trim() || null) !== (invoice.customer_email || null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Customer name is required'); return; }
        if (!phone.trim()) { setError('Customer phone is required'); return; }
        setError(null);
        setSaving(true);
        try {
            await onSave(invoice.id, {
                customer_name: name.trim(),
                customer_phone: phone.trim(),
                customer_email: email.trim() || null,
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-brand-navy/40 backdrop-blur-sm z-[320] transition-opacity duration-200 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Dialog */}
            <div
                className={`fixed z-[330] left-1/2 -translate-x-1/2 transition-all duration-200 ease-out
                    w-full max-w-md mx-auto
                    top-1/2 -translate-y-1/2
                    bg-white rounded-3xl shadow-2xl flex flex-col
                    ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Edit Invoice</p>
                        <h2 className="text-lg font-bold text-brand-navy">{invoiceNumber(invoice.token)}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <p className="text-xs text-gray-500 font-medium -mt-1">
                        Update customer contact details. Items and totals are fixed once an invoice is issued.
                    </p>

                    <Field label="Name" icon={<User size={11} />} required>
                        <input
                            className={inputClass}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Customer name"
                            required
                        />
                    </Field>

                    <Field label="Phone" icon={<Phone size={11} />} required>
                        <input
                            className={inputClass}
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="+260 9X XXX XXXX"
                            required
                        />
                    </Field>

                    <Field label="Email" icon={<Mail size={11} />}>
                        <input
                            className={inputClass}
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="customer@example.com"
                        />
                    </Field>

                    {error && (
                        <p className="text-xs text-red-500 font-medium bg-red-50 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    {/* Footer */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-2xl border border-[#E8EEF8] text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !isDirty}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0058DB] text-white text-sm font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
};
