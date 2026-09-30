/**
 * AutomationsTab.tsx — Automations list + detail drawer.
 *
 * Deliberately mirrors the Schedules list (icon tile · title · meta line ·
 * right-hand value · menu) and its slide-in detail panel (Run Now card, then
 * Run History) so the two features read as one family. Creation is done by
 * talking to the Assistant, which is why "New automation" hands off to the chat
 * instead of opening a form.
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowRight, Check, ChevronDown, Clock, Loader2, Mail, MoreVertical,
    Play, Plus, RotateCcw, Send, Sparkles, Wallet, X, Zap,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { automationService } from 'core';
import type { Automation, AutomationRun, AutomationRunStatus } from 'core';
import { useAuth } from '../../context/AuthContext';

const RUN_STATUS: Record<AutomationRunStatus, { label: string; cls: string }> = {
    RUNNING:               { label: 'Running',        cls: 'bg-yellow-100 text-yellow-700' },
    AWAITING_CONFIRMATION: { label: 'Awaiting bank',  cls: 'bg-blue-100 text-blue-700' },
    COMPLETED:             { label: 'Completed',      cls: 'bg-emerald-100 text-emerald-700' },
    FAILED:                { label: 'Failed',         cls: 'bg-red-100 text-red-700' },
    SKIPPED:               { label: 'Nothing to do',  cls: 'bg-gray-100 text-gray-600' },
};

const money = (n: number | string | null | undefined) =>
    `K${Number(n ?? 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (iso?: string | null) => {
    if (!iso) return '';
    try { return format(parseISO(iso), 'd MMM, h:mm a'); } catch { return iso; }
};

function forwardTarget(a: Automation) {
    return a.actions.find(x => x.type === 'FORWARD_PAYMENT');
}
function popEmail(a: Automation) {
    return a.actions.find(x => x.type === 'SEND_POP_EMAIL')?.to;
}

// ── Row menu ──────────────────────────────────────────────────────────────────

const RowMenu: React.FC<{ automation: Automation; onToggle: () => void; onDelete: () => void }> = ({ automation, onToggle, onDelete }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(v => !v)} aria-label="More actions"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
                <MoreVertical size={15} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-[110] w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden text-xs">
                        <button type="button" onClick={() => { setOpen(false); onToggle(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-700 font-medium transition">
                            {automation.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                        </button>
                        <button type="button" onClick={() => { setOpen(false); onDelete(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 font-medium transition">
                            Stop &amp; remove
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// ── Run history row ───────────────────────────────────────────────────────────

const RunRow: React.FC<{ run: AutomationRun; canRetry: boolean; retrying: boolean; onRetry: () => void }> = ({ run, canRetry, retrying, onRetry }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const cfg = RUN_STATUS[run.status] ?? { label: run.status, cls: 'bg-gray-100 text-gray-600' };

    return (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 transition">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                        {run.amount ? money(run.amount) : 'Manual check'}
                        {run.trigger_summary && run.amount ? <span className="font-normal text-gray-500"> · {run.trigger_summary.split(' — ').slice(1).join(' — ') || 'Deposit'}</span> : null}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                        {when(run.started_at)}{run.source === 'MANUAL' ? ' · run manually' : ''}
                        {run.attempts > 1 ? ` · attempt ${run.attempts}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {open && (
                <div className="px-3 pb-3 border-t border-gray-50">
                    <ol className="mt-2 space-y-1.5">
                        {run.steps.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px]">
                                <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
                                    s.status === 'ok' ? 'bg-emerald-100 text-emerald-600'
                                    : s.status === 'failed' ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-100 text-gray-500'}`}>
                                    {s.status === 'ok' ? <Check size={9} /> : s.status === 'failed' ? <X size={9} /> : <Clock size={9} />}
                                </span>
                                <span className="text-gray-600 leading-snug">
                                    {s.detail}
                                    <span className="text-gray-300"> · {when(s.at)}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div className="flex items-center gap-2 mt-3">
                        {run.requisition_id && (
                            <button type="button" onClick={() => navigate(`/requisitions?id=${run.requisition_id}`)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-[#0058DB] hover:underline">
                                View payout <ArrowRight size={11} />
                            </button>
                        )}
                        {run.status === 'FAILED' && canRetry && (
                            <button type="button" onClick={onRetry} disabled={retrying}
                                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0058DB] text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-60 transition">
                                {retrying ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                Retry
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Detail drawer ─────────────────────────────────────────────────────────────

interface DetailProps {
    automation: Automation;
    isAdmin: boolean;
    running: boolean;
    onRun: () => void;
    onClose: () => void;
    onToast: (msg: string, type?: 'success' | 'error') => void;
}

const DetailPanel: React.FC<DetailProps> = ({ automation, isAdmin, running, onRun, onClose, onToast }) => {
    const qc = useQueryClient();
    const [retryingId, setRetryingId] = useState<string | null>(null);

    const { data: runs = [], isLoading } = useQuery<AutomationRun[]>({
        queryKey: ['automation-runs', automation.id],
        queryFn: () => automationService.getRuns(automation.id),
        // Payouts confirm in the background — keep the history live while it's open.
        refetchInterval: 10_000,
    });

    const forward = forwardTarget(automation);
    const email = popEmail(automation);

    const retry = async (runId: string) => {
        setRetryingId(runId);
        try {
            await automationService.retryRun(automation.id, runId);
            onToast('Retried.');
        } catch (err: any) {
            onToast(err.message || 'Retry failed', 'error');
        } finally {
            setRetryingId(null);
            qc.invalidateQueries({ queryKey: ['automation-runs', automation.id] });
            qc.invalidateQueries({ queryKey: ['automations'] });
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                    <div className="flex-1 min-w-0 pr-3">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${
                            automation.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {automation.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </span>
                        <h2 className="text-sm font-bold text-gray-900 leading-tight">{automation.name}</h2>
                        {automation.description && <p className="text-xs text-gray-400 mt-1">{automation.description}</p>}

                        <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-xl text-[10px] text-gray-600">
                                <Wallet size={10} className="flex-shrink-0" />
                                <span className="font-semibold">When money is deposited into</span>
                                <span className="truncate">{automation.wallet_name ?? 'the wallet'}</span>
                            </div>
                            {forward && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-xl text-[10px] text-gray-600">
                                    <Send size={10} className="flex-shrink-0" />
                                    <span className="font-semibold">Forward to</span>
                                    <span className="truncate">{forward.recipient_name} · {forward.recipient_bank_name ?? forward.recipient_bank_code} {forward.recipient_account}</span>
                                </div>
                            )}
                            {email && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 rounded-xl text-[10px] text-[#0058DB]">
                                    <Mail size={10} className="flex-shrink-0" />
                                    <span className="font-semibold">Proof of Payment →</span>
                                    <span className="truncate">{email}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                        <X size={15} />
                    </button>
                </div>

                <div className="mx-4 mt-4 p-4 bg-white rounded-2xl border border-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Runs automatically</span>
                        <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Every minute</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                        {automation.last_run_at ? `Last activity ${when(automation.last_run_at)}.` : 'No activity yet.'}{' '}
                        Run now checks for new deposits straight away.
                    </p>
                    {isAdmin && (
                        <button type="button" onClick={onRun} disabled={running}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[#0058DB] hover:opacity-90 text-white text-xs font-bold rounded-lg transition disabled:opacity-60">
                            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="white" />}
                            Run Now
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Run History</p>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                    ) : runs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-gray-400">No runs yet. The first deposit will show up here.</div>
                    ) : (
                        <div className="space-y-2">
                            {runs.map(run => (
                                <RunRow key={run.id} run={run} canRetry={isAdmin}
                                    retrying={retryingId === run.id} onRetry={() => retry(run.id)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Tab ───────────────────────────────────────────────────────────────────────

export const AutomationsTab: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const [detailId, setDetailId] = useState<string | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const { data: automations = [], isLoading } = useQuery<Automation[]>({
        queryKey: ['automations'],
        queryFn: () => automationService.getAll(),
        refetchInterval: 20_000,
    });

    const detail = automations.find(a => a.id === detailId) ?? null;
    const refresh = () => qc.invalidateQueries({ queryKey: ['automations'] });

    const handleRun = async (a: Automation) => {
        setRunningId(a.id);
        try {
            const r = await automationService.runNow(a.id);
            if (r.errors.length) showToast(r.errors[0], 'error');
            else if (r.started || r.retried || r.settled) {
                showToast(r.started ? `Processed ${r.started} new deposit${r.started === 1 ? '' : 's'}.` : 'Updated in-flight payouts.');
            } else showToast('Checked — no new deposits.');
        } catch (err: any) {
            showToast(err.message || 'Run failed', 'error');
        } finally {
            setRunningId(null);
            refresh();
            qc.invalidateQueries({ queryKey: ['automation-runs', a.id] });
        }
    };

    const handleToggle = async (a: Automation) => {
        try {
            await automationService.setStatus(a.id, a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
            showToast(a.status === 'ACTIVE' ? 'Paused.' : 'Resumed — only new deposits will be processed.');
            refresh();
        } catch (err: any) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (a: Automation) => {
        if (!window.confirm(`Stop and remove "${a.name}"? Its run history is kept for your records.`)) return;
        try {
            await automationService.remove(a.id);
            showToast('Removed.');
            if (detailId === a.id) setDetailId(null);
            refresh();
        } catch (err: any) { showToast(err.message, 'error'); }
    };

    return (
        <div className="flex flex-1 min-h-0 flex-col">
            <div className="flex items-center gap-4 px-4 pb-3 flex-shrink-0">
                <p className="text-xs text-gray-400 flex-1">Rules that run by themselves, the same way every time.</p>
                {isAdmin && (
                    <button type="button" onClick={onCreate}
                        className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity">
                        <Plus size={13} className="text-white" />
                        <span className="text-white text-xs font-bold">New automation</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {isLoading ? (
                    <div className="flex justify-center items-center py-20"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
                ) : automations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
                            <Zap size={22} className="text-purple-500" />
                        </div>
                        <p className="text-sm font-bold text-gray-800 mb-1">No automations yet</p>
                        <p className="text-xs text-gray-400 mb-5 max-w-sm">
                            Tell the Assistant what should happen and when — for example, forward every deposit into a wallet to a bank account and email the proof of payment.
                        </p>
                        {isAdmin && (
                            <button type="button" onClick={onCreate}
                                className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity">
                                <Sparkles size={13} className="text-white" />
                                <span className="text-white text-xs font-bold">Create with Assistant</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="rounded-2xl">
                        {automations.map((a, idx) => {
                            const fwd = forwardTarget(a);
                            const last = a.last_run;
                            const lastCfg = last ? RUN_STATUS[last.status] : null;
                            return (
                                <div key={a.id}
                                    className={`flex items-center gap-5 px-4 py-4 cursor-pointer hover:bg-gray-50 transition ${idx < automations.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    onClick={() => setDetailId(a.id)}>
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-purple-100 text-purple-700">
                                        <Zap size={15} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-0.5">
                                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                                <Wallet size={10} /> On deposit{a.wallet_name ? ` · ${a.wallet_name}` : ''}
                                            </span>
                                            {fwd && (
                                                <span className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                                                    <Send size={10} /> {fwd.recipient_name}
                                                </span>
                                            )}
                                            {lastCfg && last && (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lastCfg.cls}`}>
                                                    Last: {lastCfg.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                        a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                                    </span>
                                    {isAdmin && (
                                        <div onClick={e => e.stopPropagation()}>
                                            <RowMenu automation={a} onToggle={() => handleToggle(a)} onDelete={() => handleDelete(a)} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {detail && (
                <DetailPanel
                    automation={detail}
                    isAdmin={isAdmin}
                    running={runningId === detail.id}
                    onRun={() => handleRun(detail)}
                    onClose={() => setDetailId(null)}
                    onToast={showToast}
                />
            )}

            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 ${toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
                    {toast.msg}
                </div>
            )}
        </div>
    );
};
