import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Smartphone, Mail, BadgeCheck, UserPlus, Loader2, Search } from 'lucide-react';
import { crmService, Customer } from '../../services/crm.service';

export interface PickedCustomer {
    customerId: string | null;
    name: string;
    phone: string;
    email: string;
}

interface CustomerPickerProps {
    organizationId?: string | null;
    value: PickedCustomer;
    onChange: (next: PickedCustomer) => void;
    /** Show the email field (needed to send an e-invoice). */
    showEmail?: boolean;
    phonePlaceholder?: string;
    /** Tailwind focus-border class so the picker matches the flow's accent colour. */
    focusClass?: string;
}

const digits = (s: string) => s.replace(/\D/g, '');
const money = (n: number) => `K${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/**
 * Customer details for a sale / invoice. Typing a name or number searches the CRM; picking a match fills the
 * contact details and links the sale to that customer. If nobody matches, the customer can be added to the CRM
 * on the spot (credit sales also add them automatically, since an invoice must belong to a CRM customer).
 */
export const CustomerPicker: React.FC<CustomerPickerProps> = ({
    organizationId, value, onChange, showEmail, phonePlaceholder = 'Phone number', focusClass = 'focus:border-emerald-400',
}) => {
    const queryClient = useQueryClient();
    const queryKey = ['crm', 'customers', organizationId];
    const { data: customers = [], isLoading } = useQuery<Customer[]>({
        queryKey,
        queryFn: () => crmService.listCustomers(),
        staleTime: 60_000,
        enabled: !!organizationId,
    });

    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const q = value.name.trim().toLowerCase();
    const qDigits = digits(value.phone);
    const matches = useMemo(() => {
        if (!q && qDigits.length < 3) return [];
        return customers.filter(c =>
            (q && (c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || digits(c.phone || '').includes(digits(q)) && digits(q).length >= 3)) ||
            (qDigits.length >= 3 && digits(c.phone || '').includes(qDigits))
        ).slice(0, 6);
    }, [customers, q, qDigits]);

    const picked = value.customerId ? customers.find(c => c.id === value.customerId) : undefined;
    // "Not in the CRM yet" = a name was typed, nothing is linked, and no existing customer has exactly that name.
    const exactExists = customers.some(c => c.name.trim().toLowerCase() === q);
    const canAdd = !!q && !value.customerId && !exactExists && !isLoading;

    const select = (c: Customer) => {
        onChange({ customerId: c.id, name: c.name, phone: c.phone || value.phone, email: c.email || value.email });
        setOpen(false);
    };

    const addToCrm = async () => {
        setAdding(true);
        setAddError(null);
        try {
            const created = await crmService.createCustomer({
                name: value.name.trim(),
                phone: value.phone.trim() || undefined,
                email: value.email.trim() || undefined,
            });
            onChange({ ...value, customerId: created.id });
            await queryClient.invalidateQueries({ queryKey });
        } catch (e: any) {
            setAddError(e?.message || 'Could not add the customer. Please try again.');
        } finally {
            setAdding(false);
        }
    };

    const input = `w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none ${focusClass}`;

    return (
        <div className="space-y-3" ref={wrapRef}>
            <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={value.name}
                    onChange={e => { onChange({ ...value, name: e.target.value, customerId: null }); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder="Customer name — search your CRM"
                    autoComplete="off"
                    className={`${input} pr-10`}
                />
                {value.customerId ? (
                    <BadgeCheck size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                ) : isLoading ? (
                    <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 animate-spin" />
                ) : (
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                )}

                {open && matches.length > 0 && !value.customerId && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                        <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">In your CRM</div>
                        {matches.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => select(c)}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                            >
                                <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black flex-shrink-0">
                                    {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-bold text-slate-800 truncate">{c.name}</div>
                                    <div className="text-[11px] font-medium text-slate-400 truncate">{[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
                                </div>
                                {c.owing_amount > 0 && (
                                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex-shrink-0">Owes {money(c.owing_amount)}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="relative">
                <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={value.phone}
                    onChange={e => { onChange({ ...value, phone: e.target.value, customerId: value.customerId }); setOpen(true); }}
                    placeholder={phonePlaceholder}
                    inputMode="tel"
                    className={input}
                />
            </div>

            {showEmail && (
                <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="email"
                        value={value.email}
                        onChange={e => onChange({ ...value, email: e.target.value })}
                        placeholder="Email address (to send the e-invoice)"
                        className={input}
                    />
                </div>
            )}

            {value.customerId && (
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 px-1">
                    <BadgeCheck size={13} />
                    {picked ? `${picked.name} is in your CRM` : 'Linked to your CRM'}
                    {picked && picked.owing_amount > 0 ? ` · currently owes ${money(picked.owing_amount)}` : ''}
                </p>
            )}

            {canAdd && (
                <button
                    type="button"
                    onClick={addToCrm}
                    disabled={adding}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors disabled:opacity-50"
                >
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    “{value.name.trim()}” isn’t in your CRM — add as new customer
                </button>
            )}
            {addError && <p className="text-[11px] font-semibold text-rose-600 px-1">{addError}</p>}
        </div>
    );
};

export default CustomerPicker;
