import React, { useEffect, useState } from 'react';
import { X, PencilLine } from 'lucide-react';
import type { Account } from '../../services/account.service';

export interface CustomLine {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    incomeAccountId: string | null;
}

interface CustomItemModalProps {
    isOpen: boolean;
    /** 'receipt' = cash sale, 'invoice' = credit sale — only changes the wording. */
    kind: 'receipt' | 'invoice';
    incomeAccounts: Account[];
    initial?: CustomLine | null;
    onSave: (line: CustomLine) => void;
    onClose: () => void;
}

/** Pop-up for a one-off item that isn't in the product catalogue (e.g. "Delivery fee", "Consulting – 3 hrs"). */
export const CustomItemModal: React.FC<CustomItemModalProps> = ({ isOpen, kind, incomeAccounts, initial, onSave, onClose }) => {
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [price, setPrice] = useState('');
    const [incomeAccountId, setIncomeAccountId] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setName(initial?.name || '');
        setQuantity(String(initial?.quantity ?? 1));
        setPrice(initial ? String(initial.unitPrice) : '');
        setIncomeAccountId(initial?.incomeAccountId || '');
        setError(null);
    }, [isOpen, initial]);

    if (!isOpen) return null;

    const qty = Number(quantity), unit = Number(price);
    const total = Number.isFinite(qty) && Number.isFinite(unit) ? qty * unit : 0;
    const noun = kind === 'invoice' ? 'invoice' : 'receipt';

    const submit = () => {
        if (!name.trim()) return setError('Describe what you are selling.');
        if (!(qty > 0)) return setError('Enter a quantity greater than 0.');
        if (!(unit > 0)) return setError('Enter a price greater than 0.');
        onSave({ id: initial?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), quantity: qty, unitPrice: unit, incomeAccountId: incomeAccountId || null });
    };

    const field = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-slate-400';
    const label = 'text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5';

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><PencilLine size={18} /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-slate-900">Custom {noun}</h3>
                        <p className="text-[11px] font-semibold text-slate-400">Add an item that isn’t in your products</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className={label}>Description</label>
                        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Delivery fee, Consulting – 3 hrs" className={field} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={label}>Quantity</label>
                            <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className={field} />
                        </div>
                        <div>
                            <label className={label}>Unit price (K)</label>
                            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className={field} />
                        </div>
                    </div>
                    <div>
                        <label className={label}>Income account</label>
                        <select value={incomeAccountId} onChange={e => setIncomeAccountId(e.target.value)} className={`${field} appearance-none`}>
                            <option value="">{kind === 'invoice' ? 'Sales Revenue (default)' : 'Leave for classification later'}</option>
                            {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">Where this revenue is recorded in your books and reports.</p>
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 rounded-2xl px-4 py-3">
                        <span className="text-xs font-bold text-slate-500">Line total</span>
                        <span className="text-base font-black text-slate-900">K{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm">Cancel</button>
                    <button onClick={submit} className="flex-1 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-sm">{initial ? 'Save item' : 'Add to cart'}</button>
                </div>
            </div>
        </div>
    );
};

export default CustomItemModal;
