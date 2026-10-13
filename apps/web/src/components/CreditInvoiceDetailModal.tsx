import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, User, Phone, Mail, Calendar, Download, Send, Ban, Loader2, Receipt, Wallet, Link2, Copy, Check } from 'lucide-react';
import { invoiceService, CustomerInvoice, InvoicePayLink } from '../services/invoice.service';
import { InvoiceStatusPill, formatInvoiceDate } from './CreditInvoiceInbox';

interface Props {
    invoice: CustomerInvoice | null;
    isOpen: boolean;
    onClose: () => void;
    /** Refresh whatever list shows this invoice after a change (void / send). */
    onChanged?: () => void;
}

const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const CreditInvoiceDetailModal: React.FC<Props> = ({ invoice, isOpen, onClose, onChanged }) => {
    const queryClient = useQueryClient();
    const { data: detail } = useQuery({
        queryKey: ['credit-invoice', invoice?.id],
        queryFn: () => invoiceService.get(invoice!.id),
        enabled: isOpen && !!invoice?.id,
    });
    const inv = detail || invoice;

    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState<'send' | 'pdf' | 'void' | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmVoid, setConfirmVoid] = useState(false);
    const [createdLink, setCreatedLink] = useState<InvoicePayLink | null>(null);
    const [linkBusy, setLinkBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setEmail(invoice?.customer_email || '');
        setNotice(null);
        setConfirmVoid(false);
        setCreatedLink(null);
    }, [invoice?.id]);

    if (!isOpen || !inv) return null;

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['credit-invoice', inv.id] });
        onChanged?.();
    };

    const send = async () => {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setNotice('Enter a valid email address.');
        setBusy('send'); setNotice(null);
        try { await invoiceService.send(inv.id, email.trim()); setNotice(`Invoice sent to ${email.trim()}.`); await refresh(); }
        catch (e: any) { setNotice(e?.message || 'Could not send the invoice.'); }
        finally { setBusy(null); }
    };

    const download = async () => {
        setBusy('pdf'); setNotice(null);
        try {
            const blob = await invoiceService.downloadPdf(inv.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${inv.invoice_number}.pdf`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: any) { setNotice(e?.message || 'Could not download the invoice.'); }
        finally { setBusy(null); }
    };

    const payLink: InvoicePayLink | null = createdLink || (detail as any)?.pay_link || null;
    const makeLink = async () => {
        setLinkBusy(true); setNotice(null);
        try { setCreatedLink(await invoiceService.payLink(inv.id)); await refresh(); }
        catch (e: any) { setNotice(e?.message || 'Could not create the payment link.'); }
        finally { setLinkBusy(false); }
    };
    const copyLink = async () => {
        if (!payLink) return;
        try { await navigator.clipboard.writeText(payLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select-all fallback */ }
    };

    const voidIt = async () => {
        setBusy('void'); setNotice(null);
        try { await invoiceService.void(inv.id); await refresh(); onClose(); }
        catch (e: any) { setNotice(e?.message || 'Could not void the invoice.'); setConfirmVoid(false); }
        finally { setBusy(null); }
    };

    const payments = (detail as any)?.payments || [];
    const canVoid = inv.status !== 'VOID' && inv.status !== 'PAID' && payments.length === 0;

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                    <div className="h-10 w-10 rounded-xl bg-[#F0F7FF] text-[#0058DB] flex items-center justify-center"><Receipt size={20} /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-[#111827]">{inv.invoice_number}</h3>
                        <InvoiceStatusPill invoice={inv} />
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-6">
                    <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center">
                        <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total</p><p className="text-sm font-bold text-[#111827] mt-1">{money(inv.total)}</p></div>
                        <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Paid</p><p className="text-sm font-bold text-emerald-600 mt-1">{money(inv.amount_paid)}</p></div>
                        <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Balance</p><p className={`text-sm font-bold mt-1 ${inv.balance > 0 ? 'text-[#0058DB]' : 'text-gray-400'}`}>{money(inv.balance)}</p></div>
                    </div>

                    <div className="space-y-2.5 text-sm">
                        <div className="flex items-center gap-3 text-gray-600"><User size={15} className="text-gray-400" /> <span className="font-semibold">{inv.customer_name}</span></div>
                        {inv.customer_phone && <div className="flex items-center gap-3 text-gray-600"><Phone size={15} className="text-gray-400" /> {inv.customer_phone}</div>}
                        {inv.customer_email && <div className="flex items-center gap-3 text-gray-600"><Mail size={15} className="text-gray-400" /> {inv.customer_email}</div>}
                        <div className="flex items-center gap-3 text-gray-600"><Calendar size={15} className="text-gray-400" /> Issued {formatInvoiceDate(inv.issue_date)} · follow up <span className="font-semibold">{formatInvoiceDate(inv.follow_up_date)}</span></div>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Items</h4>
                        <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                            {inv.items.map((it, i) => (
                                <div key={i} className="flex justify-between gap-3 px-4 py-3 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-[#111827] truncate">{it.name}</p>
                                        <p className="text-xs text-gray-400">{it.check_in && it.check_out ? `${it.check_in} → ${it.check_out} · ${it.quantity} night(s)` : `${it.quantity} × ${money(it.unit_price)}`}</p>
                                    </div>
                                    <p className="font-bold text-[#111827] flex-shrink-0">{money(it.quantity * it.unit_price)}</p>
                                </div>
                            ))}
                        </div>
                        {inv.notes && <p className="text-xs text-gray-500 mt-2 px-1">{inv.notes}</p>}
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Payments applied</h4>
                        {payments.length === 0 ? (
                            <p className="text-xs text-gray-400 font-medium leading-relaxed bg-gray-50 rounded-2xl px-4 py-3 flex gap-2">
                                <Wallet size={14} className="mt-0.5 flex-shrink-0" />
                                None yet. When the customer pays, open the money in your wallet, classify it as Accounts Receivable and pick this invoice.
                            </p>
                        ) : (
                            <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                                {payments.map((p: any) => (
                                    <div key={p.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-[#111827] truncate">{p.cashbook_entries?.reference_number || 'Payment'}</p>
                                            <p className="text-xs text-gray-400">{p.cashbook_entries?.date ? formatInvoiceDate(p.cashbook_entries.date) : ''}</p>
                                        </div>
                                        <p className="font-bold text-emerald-600 flex-shrink-0">{money(p.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {inv.status !== 'VOID' && inv.status !== 'PAID' && (
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pay-by-link link</h4>
                            {payLink ? (
                                <div className="relative flex items-center">
                                    <input readOnly value={payLink.url} onFocus={e => e.currentTarget.select()} className="w-full pl-4 pr-24 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 outline-none" />
                                    <button onClick={copyLink} className={`absolute right-1.5 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${copied ? 'bg-[#0058DB] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                        {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                                    </button>
                                </div>
                            ) : (
                                <button onClick={makeLink} disabled={linkBusy} className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-50">
                                    {linkBusy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Create pay-by-link link
                                </button>
                            )}
                            <p className="text-[11px] text-gray-400 font-medium">Charges the current balance and applies the payment to this invoice automatically.</p>
                        </div>
                    )}

                    {inv.status !== 'VOID' && (
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                Send e-invoice {inv.sent_count > 0 && <span className="normal-case tracking-normal font-semibold text-gray-400">· sent {inv.sent_count}×</span>}
                            </h4>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="customer@email.com"
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0058DB]"
                                />
                                <button onClick={send} disabled={busy !== null} className="px-4 rounded-xl bg-[#0058DB] text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
                                    {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
                                </button>
                            </div>
                        </div>
                    )}
                    {notice && <p className="text-xs font-semibold text-gray-600">{notice}</p>}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                    {canVoid && (confirmVoid ? (
                        <button onClick={voidIt} disabled={busy !== null} className="px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
                            {busy === 'void' ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Confirm void
                        </button>
                    ) : (
                        <button onClick={() => setConfirmVoid(true)} className="px-4 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-bold flex items-center gap-1.5 hover:bg-red-50">
                            <Ban size={15} /> Void
                        </button>
                    ))}
                    <button onClick={download} disabled={busy !== null} className="flex-1 py-3 rounded-xl bg-[#111827] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                        {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreditInvoiceDetailModal;
