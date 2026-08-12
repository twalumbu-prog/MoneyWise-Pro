import React, { useState, useEffect, useCallback } from 'react';
import {
    CreditCard, Download, ArrowUpCircle,
    ChevronRight, CheckCircle2, Clock, AlertCircle, RefreshCw, Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function apiFetch(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
            ...(options.headers || {}),
        },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Plan {
    id: string;
    name: string;
    price_zmw: number;
    max_members: number | null;
}

interface Subscription {
    id: string;
    plan_id: string;
    plan: Plan;
    status: string;
    current_period_start: string;
    current_period_end: string;
    fee_credits_zmw: number;
    auto_pay_enabled: boolean;
    amountDue: number;
    daysLeft: number;
    totalDays: number;
    periodPercent: number;
}

interface Invoice {
    id: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    gross_zmw: number;
    credits_zmw: number;
    net_zmw: number;
    status: 'pending' | 'paid' | 'voided' | 'free';
    due_date: string;
    paid_at: string | null;
    paid_via: string | null;
    created_at: string;
}

interface FeeCredit {
    amount_zmw: number;
    created_at: string;
    source_type: string;
    reference: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Invoice['status'] }> = ({ status }) => {
    const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
        paid:    { label: 'Paid',    cls: 'bg-lime-50 text-green-800',   icon: <CheckCircle2 size={9} className="text-green-700" /> },
        free:    { label: 'Free',    cls: 'bg-blue-50 text-blue-700',    icon: <Zap size={9} className="text-blue-600" /> },
        pending: { label: 'Pending', cls: 'bg-red-50 text-red-700',      icon: <Clock size={9} className="text-red-500" /> },
        voided:  { label: 'Voided', cls: 'bg-gray-100 text-gray-500',   icon: <AlertCircle size={9} className="text-gray-400" /> },
    };
    const c = cfg[status] || cfg.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${c.cls}`}>
            {c.icon}{c.label}
        </span>
    );
};

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatShort(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function sourceLabel(s: string) {
    return ({ PAYMENT_LINK: 'Payment Link', QUICK_LINK: 'Quick Link', DIRECT_DEPOSIT: 'Direct Deposit', OTHER: 'Other' })[s] || s;
}

// ── Receipt download (client-side PDF via canvas/print) ───────────────────────

async function downloadReceipt(invoice: Invoice) {
    // Build a printable HTML receipt in a new window
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const statusText = invoice.status === 'free' ? 'PAID (via Fee Credits)'
        : invoice.status === 'paid' ? 'PAID'
        : invoice.status.toUpperCase();
    w.document.write(`
        <!DOCTYPE html><html><head>
        <title>MoneyWise Receipt ${invoice.invoice_number}</title>
        <style>
            body { font-family: system-ui, sans-serif; padding: 48px; color: #111; }
            .logo { font-size: 22px; font-weight: 900; letter-spacing: -1px; margin-bottom: 32px; }
            .title { font-size: 14px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; }
            .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
            .row .key { color: #666; }
            .row .val { font-weight: 600; }
            .total-row { display: flex; justify-content: space-between; padding: 14px 0; font-size: 16px; font-weight: 800; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
                      background: ${invoice.status === 'paid' || invoice.status === 'free' ? '#f0fdf4' : '#fef2f2'};
                      color: ${invoice.status === 'paid' || invoice.status === 'free' ? '#166534' : '#991b1b'}; }
            .footer { margin-top: 48px; font-size: 11px; color: #aaa; text-align: center; }
            @media print { button { display: none; } }
        </style>
        </head><body>
        <div class="logo">MoneyWise</div>
        <div class="title">Subscription Receipt</div>
        <div class="row"><span class="key">Invoice No.</span><span class="val">${invoice.invoice_number}</span></div>
        <div class="row"><span class="key">Period</span><span class="val">${formatShort(invoice.period_start)} – ${formatShort(invoice.period_end)}</span></div>
        <div class="row"><span class="key">Due Date</span><span class="val">${formatDate(invoice.due_date)}</span></div>
        <div class="row"><span class="key">Status</span><span><span class="status">${statusText}</span></span></div>
        ${invoice.paid_at ? `<div class="row"><span class="key">Paid On</span><span class="val">${formatDate(invoice.paid_at)}</span></div>` : ''}
        <div class="row"><span class="key">Plan</span><span class="val">MoneyWise Premium</span></div>
        <div class="row"><span class="key">Base Price</span><span class="val">ZMW ${invoice.gross_zmw.toFixed(2)}</span></div>
        ${invoice.credits_zmw > 0 ? `<div class="row"><span class="key">Fee Credits</span><span class="val" style="color:#16a34a">– ZMW ${invoice.credits_zmw.toFixed(2)}</span></div>` : ''}
        <hr style="margin: 16px 0; border: none; border-top: 2px solid #111;" />
        <div class="total-row"><span>Total Paid</span><span>ZMW ${invoice.net_zmw.toFixed(2)}</span></div>
        <div class="footer">MoneyWise Pro · Powered by Blue Opus Software Technology<br/>This is an official subscription receipt.</div>
        <br/><button onclick="window.print()">Print / Save as PDF</button>
        </body></html>
    `);
    w.document.close();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const SubscriptionBilling: React.FC = () => {
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [credits, setCredits] = useState<FeeCredit[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCredits, setShowCredits] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/billing/subscription');
            setSubscription(data.subscription);
            setInvoices(data.invoices || []);
            setCredits(data.credits || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleUpgrade = async () => {
        setActionLoading('upgrade');
        try {
            await apiFetch('/billing/upgrade', { method: 'POST' });
            await load();
        } catch (e: any) { alert(e.message); }
        finally { setActionLoading(null); }
    };

    const handleDowngrade = async () => {
        if (!confirm('Downgrade to Free? You will lose team member access at end of current period.')) return;
        setActionLoading('downgrade');
        try {
            await apiFetch('/billing/downgrade', { method: 'POST' });
            await load();
        } catch (e: any) { alert(e.message); }
        finally { setActionLoading(null); }
    };

    const handlePayInvoice = async (invoiceId: string) => {
        setActionLoading(`pay-${invoiceId}`);
        try {
            await apiFetch(`/billing/pay/${invoiceId}`, { method: 'POST' });
            await load();
        } catch (e: any) {
            if (e.message.includes('Insufficient')) {
                alert('Insufficient wallet balance. Please deposit funds into your MoneyWise wallet first, then try again.');
            } else {
                alert(e.message);
            }
        }
        finally { setActionLoading(null); }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <RefreshCw size={28} className="animate-spin" />
                    <span className="text-sm">Loading billing info…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center py-24 gap-4 text-center">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm text-red-500">{error}</p>
                <button onClick={load} className="text-xs text-blue-600 underline">Retry</button>
            </div>
        );
    }

    if (!subscription) return null;

    const isPremium = subscription.plan_id === 'premium';
    const creditsPct = Math.min(100, (subscription.fee_credits_zmw / 250) * 100);
    const periodPct = subscription.periodPercent;
    const nextPaymentDate = formatDate(subscription.current_period_end);

    return (
        <div className="self-stretch p-5 rounded-2xl outline outline-[1.5px] outline-offset-[-1.5px] outline-zinc-100 flex flex-col gap-6">

            {/* ── Section: Usage & Billing ───────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <h2 className="text-black text-lg font-bold font-['Hanken_Grotesk'] leading-6">Usage &amp; Billing</h2>

                <div className="flex flex-col lg:flex-row gap-4">

                    {/* Current Plan card */}
                    <div className="flex-1 p-6 bg-white rounded-xl shadow-[0px_3px_4px_0px_rgba(0,0,0,0.15)] outline outline-1 outline-offset-[-1px] outline-zinc-100 flex flex-col gap-4 min-h-[192px]">
                        <div className="flex flex-col gap-3">
                            {/* Plan name + price */}
                            <div className="flex items-end gap-0.5">
                                <div className="flex flex-col gap-1 flex-1">
                                    <p className="text-neutral-700 text-xs font-light leading-4">You are currently subscribed to the</p>
                                    <p className="text-black text-3xl font-bold leading-7">
                                        {isPremium ? 'Premium' : 'Free'}
                                    </p>
                                </div>
                                {isPremium && (
                                    <div className="flex items-end gap-2">
                                        <span className="text-black text-3xl font-bold leading-7">ZMW250</span>
                                        <span className="text-black text-base font-light leading-6">/month</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 h-7">
                                {!isPremium ? (
                                    <button
                                        onClick={handleUpgrade}
                                        disabled={actionLoading === 'upgrade'}
                                        className="px-3 py-1.5 bg-[#00347C] text-white rounded-md text-[10px] font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[#002460] transition-colors disabled:opacity-60"
                                    >
                                        <ArrowUpCircle size={11} />
                                        {actionLoading === 'upgrade' ? 'Upgrading…' : 'Upgrade to Premium'}
                                    </button>
                                ) : (
                                    <>
                                        <button className="px-2.5 py-1.5 bg-white rounded-md shadow-[0px_1px_2px_0px_rgba(0,0,0,0.10)] outline outline-[0.5px] outline-zinc-100 text-[10px] font-normal hover:shadow-md transition-all">
                                            Adjust Plan
                                        </button>
                                        <button
                                            onClick={handleDowngrade}
                                            disabled={actionLoading === 'downgrade'}
                                            className="px-2.5 py-1.5 bg-white rounded-md shadow-[0px_1px_2px_0px_rgba(0,0,0,0.10)] outline outline-[0.5px] outline-zinc-100 text-[10px] font-normal hover:shadow-md transition-all disabled:opacity-60"
                                        >
                                            {actionLoading === 'downgrade' ? 'Processing…' : 'Downgrade'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {isPremium && (
                            <div className="flex flex-col gap-1.5">
                                {/* Period progress */}
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-700 text-xs font-light leading-4">
                                        {subscription.daysLeft} Day{subscription.daysLeft !== 1 ? 's' : ''} Left
                                    </span>
                                    <span className="text-neutral-700 text-xs font-bold leading-4">{periodPct}%</span>
                                </div>
                                <div className="h-[3px] bg-gray-300 rounded-xl outline outline-1 outline-offset-[-1px] overflow-hidden">
                                    <div
                                        className="h-full bg-green-600 rounded-l-[60px] transition-all duration-500"
                                        style={{ width: `${periodPct}%` }}
                                    />
                                </div>

                                {/* Fee credit progress */}
                                {subscription.fee_credits_zmw > 0 && (
                                    <div className="mt-1 flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-400 text-[10px] font-normal">
                                                Fee credits earned: ZMW {subscription.fee_credits_zmw.toFixed(2)} of ZMW 250
                                            </span>
                                            <span className="text-[10px] font-semibold text-emerald-600">
                                                –{creditsPct.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="h-[3px] bg-gray-200 rounded-xl overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-l-[60px] transition-all duration-500"
                                                style={{ width: `${creditsPct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* See usage details */}
                                <button
                                    onClick={() => setShowCredits(v => !v)}
                                    className="flex items-center gap-1 mt-0.5 group"
                                >
                                    <span className="text-neutral-400 text-[10px] font-normal group-hover:text-neutral-600 transition-colors">
                                        {showCredits ? 'Hide usage details' : 'See usage details'}
                                    </span>
                                    <ChevronRight size={12} className={`text-neutral-500 transition-transform ${showCredits ? 'rotate-90' : ''}`} />
                                </button>
                            </div>
                        )}

                        {/* Free plan hint */}
                        {!isPremium && (
                            <p className="text-xs text-gray-400">
                                Free plan is limited to <strong>1 team member</strong>. Upgrade to add your team and unlock all features.
                            </p>
                        )}
                    </div>

                    {/* Next Payment card */}
                    {isPremium && (
                        <div className="flex-1 p-6 bg-white rounded-xl shadow-[0px_3px_4px_0px_rgba(0,0,0,0.15)] outline outline-1 outline-offset-[-1px] outline-zinc-100 flex flex-col gap-3 min-h-[192px]">
                            <div className="flex flex-col gap-2">
                                <p className="px-2.5 text-neutral-700 text-xs font-light leading-4">Next Payment</p>
                                <p className="px-2.5 text-black text-3xl font-bold leading-7">{nextPaymentDate}</p>
                            </div>

                            <div className="h-px bg-gray-200" />

                            <div className="pl-2.5 pr-1 py-1 flex flex-col gap-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-neutral-700 text-xs font-normal">Amount Due</span>
                                    <span className="text-blue-600 text-sm font-bold">
                                        ZMW {subscription.amountDue.toFixed(2)}
                                    </span>
                                </div>
                                {subscription.fee_credits_zmw > 0 && (
                                    <p className="text-[10px] text-emerald-600">
                                        ZMW {subscription.fee_credits_zmw.toFixed(2)} already covered by platform fees your customers paid this period.
                                    </p>
                                )}
                                {subscription.amountDue <= 0 && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <CheckCircle2 size={14} className="text-emerald-500" />
                                        <span className="text-xs text-emerald-600 font-medium">
                                            Subscription fully covered this month 🎉
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 mt-1">
                                    <CreditCard size={12} className="text-gray-400" />
                                    <span className="text-xs text-neutral-500">Auto-deducted from MoneyWise wallet</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Fee credits detail panel */}
                {showCredits && credits.length > 0 && (
                    <div className="bg-white rounded-xl outline outline-1 outline-zinc-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">Fee Credits This Period</span>
                            <span className="text-xs text-emerald-600 font-bold">
                                ZMW {credits.reduce((s, c) => s + c.amount_zmw, 0).toFixed(2)} total
                            </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {credits.map((cr, i) => (
                                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-gray-700">{sourceLabel(cr.source_type)}</p>
                                        <p className="text-[10px] text-gray-400 font-mono">{cr.reference}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-emerald-600">+ZMW {cr.amount_zmw.toFixed(2)}</p>
                                        <p className="text-[10px] text-gray-400">{formatShort(cr.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {showCredits && credits.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No fee credits recorded yet this period.</p>
                )}
            </div>

            {/* ── Section: Invoices & Payments ───────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <h2 className="text-black text-lg font-bold font-['Hanken_Grotesk'] leading-6">Invoices &amp; Payments</h2>

                <div className="bg-white rounded-xl outline outline-1 outline-zinc-100 overflow-hidden">
                    {invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <CreditCard size={28} className="text-gray-200 mb-3" />
                            <p className="text-sm font-medium text-gray-400">No invoices yet</p>
                            <p className="text-xs text-gray-300 mt-1">Your first invoice will appear here at the end of your billing period.</p>
                        </div>
                    ) : (
                        <>
                            {/* Header row */}
                            <div className="px-4 py-2.5 flex items-center border-b border-gray-100 bg-gray-50/60">
                                <span className="w-44 text-xs font-light text-black">Date of Invoice</span>
                                <span className="flex-1 text-xs font-light text-black">Invoice No.</span>
                                <span className="w-48 text-xs font-light text-black">Period</span>
                                <span className="w-28 text-xs font-light text-black">Amount</span>
                                <span className="w-24 text-xs font-light text-black">Status</span>
                                <span className="w-28" />
                            </div>
                            {/* Invoice rows */}
                            <div className="divide-y divide-gray-50">
                                {invoices.map(inv => (
                                    <div key={inv.id} className="px-4 py-3 flex items-center hover:bg-gray-50/50 transition-colors">
                                        <span className="w-44 text-xs text-black font-light">{formatShort(inv.created_at)}</span>
                                        <span className="flex-1 text-xs text-black font-mono">{inv.invoice_number}</span>
                                        <span className="w-48 text-[10px] text-gray-500">
                                            {formatShort(inv.period_start)} – {formatShort(inv.period_end)}
                                        </span>
                                        <div className="w-28">
                                            <p className="text-xs font-bold text-black">ZMW {inv.net_zmw.toFixed(2)}</p>
                                            {inv.credits_zmw > 0 && (
                                                <p className="text-[9px] text-emerald-600">–{inv.credits_zmw.toFixed(2)} credits</p>
                                            )}
                                        </div>
                                        <div className="w-24">
                                            <StatusBadge status={inv.status} />
                                        </div>
                                        <div className="w-28 flex items-center justify-end gap-2">
                                            {inv.status === 'pending' && (
                                                <button
                                                    onClick={() => handlePayInvoice(inv.id)}
                                                    disabled={actionLoading === `pay-${inv.id}`}
                                                    className="px-2.5 py-1 bg-[#00347C] text-white rounded-md text-[9px] font-semibold hover:bg-[#002460] transition-colors disabled:opacity-60"
                                                >
                                                    {actionLoading === `pay-${inv.id}` ? 'Paying…' : 'Pay Now'}
                                                </button>
                                            )}
                                            {(inv.status === 'paid' || inv.status === 'free') && (
                                                <button
                                                    onClick={() => downloadReceipt(inv)}
                                                    className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100"
                                                    title="Download receipt"
                                                >
                                                    <Download size={13} />
                                                </button>
                                            )}
                                            <button className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors rounded-lg hover:bg-gray-100 rotate-90">
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── How it works info box ──────────────────────────────────────── */}
            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <div className="flex items-start gap-3">
                    <Zap size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-[#00347C] mb-1">Dynamic Pricing — How it works</p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Every time your customers make a payment through MoneyWise (catalogue, QuickPay, payment links, or direct deposits),
                            a platform fee is earned. <strong>These fees are automatically credited toward your monthly subscription.</strong>{' '}
                            If your customers generate enough activity to cover the full ZMW 250, your subscription for that month is completely free.
                            Unused credits reset at the start of each billing period.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
