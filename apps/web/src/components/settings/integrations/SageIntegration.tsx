import React, { useEffect, useMemo, useState } from 'react';
import { sageService, SageStatus, SageAccount, SageMapping, SageSyncResult } from 'core';
import { IntegrationLogo } from './IntegrationLogo';
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export const SageIntegration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [status, setStatus] = useState<SageStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    // Connect form
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [companies, setCompanies] = useState<Array<{ id: string; name: string }> | null>(null);
    const [companyId, setCompanyId] = useState('');

    // Connected
    const [sageAccounts, setSageAccounts] = useState<SageAccount[]>([]);
    const [mappings, setMappings] = useState<SageMapping[]>([]);
    const [filter, setFilter] = useState('');
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [syncResult, setSyncResult] = useState<SageSyncResult | null>(null);

    const load = async () => {
        try {
            const s = await sageService.getStatus();
            setStatus(s);
            if (s.connected) {
                const [accts, maps] = await Promise.all([sageService.getAccounts(), sageService.getMappings()]);
                setSageAccounts(accts.filter(a => a.active));
                setMappings(maps);
            }
        } catch (e: any) {
            setError(e?.message || 'Could not load the Sage connection');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const connect = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy('connect'); setError(null);
        try {
            const r = await sageService.connect({ username, password, companyId: companyId || undefined });
            if (r.needsCompany && r.companies) {
                setCompanies(r.companies);
                setCompanyId(r.companies[0]?.id || '');
                return;
            }
            setPassword(''); setCompanies(null);
            setLoading(true);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Could not connect to Sage');
        } finally {
            setBusy(null);
        }
    };

    const disconnect = async () => {
        if (!window.confirm('Disconnect Sage? Journals already in Sage stay there.')) return;
        setBusy('disconnect');
        try {
            await sageService.disconnect();
            setSageAccounts([]); setMappings([]); setSyncResult(null);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Could not disconnect');
        } finally {
            setBusy(null);
        }
    };

    const map = async (accountId: string, sageAccountId: string) => {
        const sage = sageAccounts.find(a => a.id === sageAccountId);
        setBusy(accountId);
        try {
            await sageService.setMapping(accountId, sageAccountId || null, sage?.name ?? null);
            setMappings(ms => ms.map(m => m.id === accountId ? { ...m, sage_account_id: sageAccountId || null, sage_account_name: sage?.name ?? null } : m));
        } catch (e: any) {
            setError(e?.message || 'Could not save the mapping');
        } finally {
            setBusy(null);
        }
    };

    const sync = async () => {
        setBusy('sync'); setError(null); setSyncResult(null);
        try {
            setSyncResult(await sageService.sync({ from, to }));
            setStatus(await sageService.getStatus());
        } catch (e: any) {
            setError(e?.message || 'Sync failed');
        } finally {
            setBusy(null);
        }
    };

    const shown = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return mappings.filter(m => m.is_active !== false && (!q || `${m.code || ''} ${m.name} ${m.type}`.toLowerCase().includes(q)));
    }, [mappings, filter]);
    const mappedCount = mappings.filter(m => m.sage_account_id).length;

    const input = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy/20';

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to integrations
            </button>
            <div className="flex items-center gap-3">
                <IntegrationLogo name="sage" size={40} />
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">Sage Accounting</h3>
                    <p className="text-sm text-gray-500">
                        Post MoneyWise and Master Fees journals into Sage Business Cloud Accounting (Pastel Online). Map each MoneyWise account to a Sage account, then push.
                    </p>
                </div>
            </div>

            {loading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

            {!loading && status && !status.configured && (
                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>Not configured yet. MoneyWise is waiting on its Sage developer API key; connecting will be available once it is issued.</div>
                </div>
            )}
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            {!loading && status && !status.connected && (
                <form onSubmit={connect} className="p-5 bg-white border border-gray-200 rounded-2xl space-y-4 max-w-md">
                    <p className="text-sm text-gray-600">
                        Sign in with a Sage Accounting user. We recommend creating a dedicated Sage user for MoneyWise so you can revoke it any time.
                    </p>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600">Sage username (email)</label>
                        <input className={input} type="email" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600">Sage password</label>
                        <input className={input} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    {companies && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Which Sage company?</label>
                            <select className={input} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={!status.configured || busy === 'connect'}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-navy text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {busy === 'connect' ? 'Connecting…' : companies ? 'Connect this company' : 'Connect Sage'}
                    </button>
                </form>
            )}

            {!loading && status?.connected && (
                <>
                    <div className="p-5 bg-white border border-gray-200 rounded-2xl flex items-center gap-4">
                        <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900">{status.companyName || 'Sage company'}</div>
                            <div className="text-sm text-gray-500 truncate">
                                Connected as {status.username} · {mappedCount} accounts mapped
                                {status.lastSyncedAt ? ` · last push ${new Date(status.lastSyncedAt).toLocaleString()}` : ''}
                            </div>
                        </div>
                        <button onClick={disconnect} disabled={busy === 'disconnect'} className="text-sm font-semibold text-red-600 hover:text-red-700">
                            Disconnect
                        </button>
                    </div>

                    <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-4">
                        <div>
                            <h4 className="font-bold text-gray-900">Push journals to Sage</h4>
                            <p className="text-sm text-gray-500">Journals using an unmapped account are skipped until it is mapped. Pushing again only sends new or changed journals.</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">From</label>
                                <input className={input} type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">To</label>
                                <input className={input} type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
                            </div>
                            <button
                                onClick={sync}
                                disabled={busy === 'sync' || mappedCount === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-navy text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                                {busy === 'sync' ? 'Pushing…' : 'Push now'}
                            </button>
                        </div>
                        {syncResult && (
                            <div className="text-sm bg-gray-50 rounded-xl p-3 space-y-2">
                                <div className="text-gray-800">
                                    {syncResult.posted} posted · {syncResult.unchanged} already in Sage · {syncResult.skipped} skipped · {syncResult.failed} failed
                                    {syncResult.truncated && ' · stopped early, push again to continue'}
                                </div>
                                {syncResult.errors.slice(0, 5).map((e, i) => (
                                    <div key={i} className="text-red-700">{e.reference || 'Journal'}: {e.error}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className="font-bold text-gray-900">Account mapping</h4>
                            <div className="relative">
                                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input className={`${input} pl-9 w-56`} placeholder="Filter accounts" value={filter} onChange={e => setFilter(e.target.value)} />
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {shown.map(m => (
                                <div key={m.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">{m.code ? `${m.code} · ` : ''}{m.name}</div>
                                        <div className="text-xs text-gray-500">{m.type}</div>
                                    </div>
                                    <select
                                        className={`${input} sm:w-72`}
                                        value={m.sage_account_id || ''}
                                        disabled={busy === m.id}
                                        onChange={e => map(m.id, e.target.value)}
                                    >
                                        <option value="">Not mapped</option>
                                        {sageAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}{a.category ? ` (${a.category})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                            {!shown.length && <div className="py-4 text-sm text-gray-500">No accounts match.</div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
