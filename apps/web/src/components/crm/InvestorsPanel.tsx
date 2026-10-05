import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { investmentService, INVESTOR_STATUS_LABEL } from 'core';
import type { InvestorAccountStatus, InvestorApplicationSummary } from 'core';
import {
    Search, X, FileText, Download, AlertTriangle, Loader2, CheckCircle2, Mail, Link2, ExternalLink,
} from 'lucide-react';

const STATUS_STYLE: Record<string, { pill: string; dot: string }> = {
    PENDING_REVIEW: { pill: 'bg-blue-50 text-blue-800', dot: 'bg-blue-500' },
    INFO_REQUESTED: { pill: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
    ACTIVE: { pill: 'bg-lime-300/25 text-green-900', dot: 'bg-lime-600' },
    REJECTED: { pill: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
    SUSPENDED: { pill: 'bg-gray-200 text-gray-700', dot: 'bg-gray-500' },
};

const FILTERS: { id: 'ALL' | InvestorAccountStatus; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'PENDING_REVIEW', label: 'Under review' },
    { id: 'INFO_REQUESTED', label: 'Info requested' },
    { id: 'ACTIVE', label: 'Active' },
    { id: 'REJECTED', label: 'Rejected' },
    { id: 'SUSPENDED', label: 'Suspended' },
];

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
    const s = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING_REVIEW;
    return (
        <span className={`pl-2 pr-2.5 py-1 rounded-[20px] inline-flex items-center gap-1.5 ${s.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className="text-[10px] font-semibold">{INVESTOR_STATUS_LABEL[status] ?? status}</span>
        </span>
    );
};

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * CRM → Investors. Every account an investor holds (or is applying for) with this company:
 * applications submitted from the app, and account numbers investors linked themselves.
 * Staff open one, review it and set the status — which is what unlocks investing for the customer.
 */
export const InvestorsPanel: React.FC<{ initialOpenId?: string | null }> = ({ initialOpenId }) => {
    const [filter, setFilter] = useState<'ALL' | InvestorAccountStatus>('ALL');
    const [search, setSearch] = useState('');
    const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);

    const { data: rows = [], isLoading, isError } = useQuery({
        queryKey: ['investor-applications'],
        queryFn: () => investmentService.listApplications(),
        refetchInterval: 60_000,
    });

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: rows.length };
        rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
        return c;
    }, [rows]);

    const visible = rows.filter(r => {
        if (filter !== 'ALL' && r.status !== filter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)
            || (r.phone || '').toLowerCase().includes(q) || (r.accountNumber || '').toLowerCase().includes(q);
    });

    return (
        <>
            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                <div className="p-1 bg-slate-100 rounded-[10px] flex items-center gap-1 overflow-x-auto">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 h-7 rounded-lg text-[10px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                filter === f.id ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900' : 'text-gray-900 hover:bg-white/50'
                            }`}
                        >
                            {f.label}
                            {!!counts[f.id] && <span className="text-[9px] text-gray-500">{counts[f.id]}</span>}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 h-8 px-3 bg-gray-50 border border-gray-200 rounded-lg w-full sm:w-64">
                    <Search size={13} className="text-gray-400 flex-shrink-0" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, account no…"
                        className="flex-1 text-xs bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                    />
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-violet-100 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2.5">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading investors…</div>
                    ) : isError ? (
                        <div className="flex items-center justify-center h-32 text-sm text-red-500 font-medium">Failed to load investors</div>
                    ) : visible.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 gap-1 text-center">
                            <p className="text-sm text-gray-400 font-medium">{rows.length === 0 ? 'No investor accounts yet' : 'Nothing matches'}</p>
                            {rows.length === 0 && <p className="text-xs text-gray-400">Applications and linked accounts from the app appear here.</p>}
                        </div>
                    ) : visible.map(r => <Row key={r.id} row={r} onOpen={() => setOpenId(r.id)} />)}
                </div>
            </div>

            {openId && <ApplicationDrawer id={openId} onClose={() => setOpenId(null)} />}
        </>
    );
};

const Row: React.FC<{ row: InvestorApplicationSummary; onOpen: () => void }> = ({ row, onOpen }) => {
    const initial = (row.name?.[0] || (row.source === 'CONNECTED' ? '#' : '?')).toUpperCase();
    return (
        <button onClick={onOpen} className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-slate-50 rounded-xl border border-gray-100 transition-colors text-left">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{initial}</div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">
                        {row.name || (row.accountNumber ? `Account ${row.accountNumber}` : 'Investor')}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                        {row.source === 'CONNECTED'
                            ? 'Linked an existing account number'
                            : `${row.phone || 'No phone'} · ${row.email || 'No email'}`}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
                {row.emailError && <span title={row.emailError}><AlertTriangle size={14} className="text-amber-500" /></span>}
                {row.source === 'CONNECTED' && row.status === 'ACTIVE' && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"><Link2 size={10} /> Self-linked</span>
                )}
                <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-gray-400 block">{row.accountNumber ? 'Account no.' : 'Submitted'}</span>
                    <span className="text-xs font-bold text-gray-800">{row.accountNumber || fmtDate(row.createdAt)}</span>
                </div>
                <StatusPill status={row.status} />
            </div>
        </button>
    );
};

const SECTIONS: { title: string; rows: [string, string][] }[] = [
    { title: 'Personal details', rows: [['First name', 'first_name'], ['Middle name', 'middle_name'], ['Last name', 'last_name'], ['Date of birth', 'date_of_birth'], ['Gender', 'gender'], ['Nationality', 'nationality']] },
    { title: 'Contact', rows: [['Email', 'email'], ['Phone', 'phone'], ['Address', 'physical_address']] },
    { title: 'Identification', rows: [['ID type', 'id_type'], ['ID number', 'id_number']] },
    { title: 'Occupation & funds', rows: [['Occupation', 'occupation'], ['Source of income', 'source_of_income']] },
    { title: 'Banking (account name verified with the bank)', rows: [['Bank', 'bank_name'], ['Account number', 'bank_account_number'], ['Account name', 'bank_account_name']] },
    { title: 'Sales & next of kin', rows: [['Sales person', 'sales_person'], ['Full name', 'nok_full_name'], ['ID / NRC / passport', 'nok_id_number'], ['Date of birth', 'nok_date_of_birth'], ['Contact', 'nok_phone'], ['Relationship', 'nok_relationship']] },
];

const ApplicationDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
    const qc = useQueryClient();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['investor-application', id],
        queryFn: () => investmentService.getApplication(id),
    });

    const [accountNumber, setAccountNumber] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (data) setAccountNumber(data.accountNumber ?? ''); }, [data]);

    const review = useMutation({
        mutationFn: (status: InvestorAccountStatus) => investmentService.reviewApplication(id, {
            status, accountNumber: accountNumber.trim() || undefined, note: note.trim() || undefined,
        }),
        onSuccess: () => {
            setError(null); setNote('');
            qc.invalidateQueries({ queryKey: ['investor-applications'] });
            qc.invalidateQueries({ queryKey: ['investor-application', id] });
        },
        onError: (e: any) => setError(e?.message || 'Could not update the application.'),
    });

    const a = (data?.applicant ?? {}) as Record<string, string>;
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || (data?.accountNumber ? `Account ${data.accountNumber}` : 'Investor');
    const busy = review.isPending;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <aside className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col">
                <header className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-gray-900 truncate font-['DM_Sans']">{name}</h2>
                        {data && <div className="mt-1.5 flex items-center gap-2"><StatusPill status={data.status} /><span className="text-[11px] text-gray-400">{data.source === 'CONNECTED' ? 'Self-linked account' : `Applied ${fmtDate(data.createdAt)}`}</span></div>}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
                </header>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {isLoading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
                    {isError && <p className="text-sm text-red-500">Could not load this application.</p>}

                    {data && (
                        <>
                            {data.source === 'CONNECTED' && (
                                <div className="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs leading-relaxed">
                                    This investor typed in account number <strong>{data.accountNumber}</strong> themselves; no application was submitted.
                                    Confirm it belongs to them, or suspend it.
                                </div>
                            )}

                            {data.status === 'PENDING_REVIEW' && !data.emailSentAt && data.emailError && (
                                <div className="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs flex gap-2"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {data.emailError}</div>
                            )}
                            {data.emailSentAt && (
                                <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><Mail size={12} /> Application emailed to your organization on {fmtDate(data.emailSentAt)}</p>
                            )}

                            {data.pdfUrl && (
                                <a href={data.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm">
                                    <span className="flex items-center gap-2 font-semibold text-gray-900"><FileText size={16} className="text-blue-600" /> Application form (PDF)</span>
                                    <Download size={15} className="text-gray-400" />
                                </a>
                            )}

                            {data.applicant && SECTIONS.map(sec => (
                                <section key={sec.title}>
                                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">{sec.title}</h3>
                                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {sec.rows.map(([label, key]) => (
                                            <div key={key} className="flex justify-between gap-4 px-3 py-2 text-xs">
                                                <span className="text-gray-500">{label}</span>
                                                <span className="text-gray-900 font-medium text-right break-words">{a[key] || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}

                            {Object.keys(data.documents).length > 0 && (
                                <section>
                                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Documents</h3>
                                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {Object.entries(data.documents).map(([key, d]) => (
                                            <div key={key} className="flex items-center justify-between px-3 py-2 text-xs">
                                                <span className="text-gray-900 font-medium flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> {d.label}</span>
                                                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold flex items-center gap-1 hover:underline">View <ExternalLink size={11} /></a> : <span className="text-gray-400">Unavailable</span>}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Links expire after an hour; reopen this page for fresh ones.</p>
                                </section>
                            )}

                            {data.investments.length > 0 && (
                                <section>
                                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Investments</h3>
                                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {data.investments.map(inv => (
                                            <div key={inv.id} className="flex items-center justify-between px-3 py-2 text-xs">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">{inv.product_name || 'Investment'}</p>
                                                    <p className="text-[10px] text-gray-400">{fmtDate(inv.created_at)} · {inv.method === 'WALLET' ? 'MoneyWise wallet' : 'Mobile money'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-gray-900">K{Number(inv.amount_received ?? inv.amount_paid).toLocaleString('en-ZM', { minimumFractionDigits: 2 })}</p>
                                                    <p className="text-[10px] text-gray-400">{inv.status}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {data.reviewNote && (
                                <div className="p-3 rounded-xl bg-gray-50 text-xs text-gray-700"><span className="font-semibold">Last note:</span> {data.reviewNote}</div>
                            )}
                        </>
                    )}
                </div>

                {data && (
                    <footer className="border-t border-gray-100 p-4 space-y-3 bg-white">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Account number</label>
                                <input
                                    value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Issue a number to approve"
                                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Note to investor</label>
                                <input
                                    value={note} onChange={e => setNote(e.target.value)} placeholder="Needed to reject / request info"
                                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        </div>
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <div className="flex flex-wrap gap-2">
                            {data.status !== 'ACTIVE' && (
                                <button disabled={busy} onClick={() => review.mutate('ACTIVE')} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60">
                                    {data.status === 'SUSPENDED' ? 'Reactivate' : data.source === 'CONNECTED' ? 'Confirm' : 'Approve'}
                                </button>
                            )}
                            {data.status !== 'PENDING_REVIEW' && data.status !== 'ACTIVE' && (
                                <button disabled={busy} onClick={() => review.mutate('PENDING_REVIEW')} className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Mark under review</button>
                            )}
                            {(data.status === 'PENDING_REVIEW' || data.status === 'INFO_REQUESTED') && (
                                <button disabled={busy} onClick={() => review.mutate('INFO_REQUESTED')} className="h-9 px-4 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">Request info</button>
                            )}
                            {data.status !== 'REJECTED' && data.status !== 'ACTIVE' && (
                                <button disabled={busy} onClick={() => review.mutate('REJECTED')} className="h-9 px-4 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Reject</button>
                            )}
                            {data.status === 'ACTIVE' && (
                                <button disabled={busy} onClick={() => review.mutate('SUSPENDED')} className="h-9 px-4 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Suspend</button>
                            )}
                            {busy && <Loader2 className="w-4 h-4 animate-spin self-center text-gray-400" />}
                        </div>
                    </footer>
                )}
            </aside>
        </div>
    );
};
