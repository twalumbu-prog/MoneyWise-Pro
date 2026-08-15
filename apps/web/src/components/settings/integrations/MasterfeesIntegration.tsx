import React, { useState, useEffect } from 'react';
import { masterFeesService, MasterFeesStatus, MasterFeesCategory } from '../../../services/integration.service';
import { accountService, Account } from '../../../services/account.service';
import {
    CheckCircle,
    AlertCircle,
    RefreshCw,
    ArrowLeft,
    Link2,
    GraduationCap,
    ArrowRightLeft,
    Scale,
    ChevronDown,
    Zap,
} from 'lucide-react';

interface MasterfeesIntegrationProps {
    onBack: () => void;
    /** Error message forwarded from the OAuth callback redirect (Settings.tsx). */
    initialError?: string | null;
}

export const MasterfeesIntegration: React.FC<MasterfeesIntegrationProps> = ({ onBack, initialError }) => {
    const [status, setStatus] = useState<MasterFeesStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(initialError || null);
    const [notice, setNotice] = useState<string | null>(null);

    // OAuth connect
    const [oauthLoading, setOauthLoading] = useState(false);

    // Manual connect form (fallback)
    const [showManualForm, setShowManualForm] = useState(false);
    const [schoolId, setSchoolId] = useState('');
    const [publicKey, setPublicKey] = useState('');

    // Post-connect data
    const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
    const [categories, setCategories] = useState<MasterFeesCategory[]>([]);
    const [savingCat, setSavingCat] = useState<string | null>(null);
    const [reconcile, setReconcile] = useState<{ moneywiseReceivable: number; masterfeesOutstanding: number; difference: number; studentsWithBalance: number } | null>(null);

    // Silent background refresh indicator — separate from the manual "Sync now"
    // button's `syncing` state so opening this page doesn't look like the user
    // clicked something.
    const [autoSyncing, setAutoSyncing] = useState(false);

    useEffect(() => { load(); }, []);

    // Auto-sync-on-open: the background cron now runs every minute (down from
    // 5), but if the admin opens this page in between cycles, pull fresh data
    // immediately rather than making them wait for the next tick or click
    // "Sync now" themselves. Throttled to once per ~55s of staleness so
    // repeated navigation to this tab doesn't hammer Master Fees' API.
    const maybeAutoSync = async (s: MasterFeesStatus) => {
        if (!s.connected) return;
        const lastSync = s.lastSyncedAt ? new Date(s.lastSyncedAt).getTime() : 0;
        const staleMs = Date.now() - lastSync;
        if (staleMs < 55_000) return; // fresh enough — the cron will catch it
        try {
            setAutoSyncing(true);
            await masterFeesService.sync();
            const fresh = await masterFeesService.getStatus();
            setStatus(fresh);
            if (fresh.connected) await loadConnectedData();
        } catch {
            // Silent — this is a background convenience refresh, not a user
            // action. Any real problem still surfaces via lastSyncError on the
            // next explicit "Sync now" or the next cron tick.
        } finally {
            setAutoSyncing(false);
        }
    };

    const load = async () => {
        try {
            setLoading(true);
            const s = await masterFeesService.getStatus();
            setStatus(s);
            if (s.connected) await loadConnectedData();
            void maybeAutoSync(s);
        } catch (err: any) {
            setError(err.message || 'Failed to load Master Fees status');
        } finally {
            setLoading(false);
        }
    };

    const loadConnectedData = async () => {
        const [accts, cats] = await Promise.all([
            accountService.getAll().catch(() => [] as Account[]),
            masterFeesService.getFeeCategories().catch(() => [] as MasterFeesCategory[]),
        ]);
        setIncomeAccounts((accts as Account[]).filter((a: Account) => a.type === 'INCOME'));
        setCategories(cats);
    };

    const handleOAuthConnect = async () => {
        setError(null);
        setNotice(null);
        try {
            setOauthLoading(true);
            const url = await masterFeesService.getOAuthUrl();
            // Redirect the browser — Master Fees will redirect back to our callback URL
            // (/integrations/masterfees/oauth/callback) which then stores the key and
            // sends the browser back to /settings?tab=integrations&mf_status=success.
            window.location.href = url;
        } catch (err: any) {
            setError(err.message || 'Failed to start Master Fees OAuth');
            setOauthLoading(false);
        }
    };

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        try {
            setActionLoading(true);
            const result = await masterFeesService.connect({ schoolId: schoolId.trim(), publicKey: publicKey.trim() });
            setNotice(`Connected to ${result.schoolName || 'Master Fees'} — detected Lenco mode: ${result.lencoMode}. Initial sync started.`);
            setPublicKey('');
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('Disconnect Master Fees? Existing posted revenue and receivables are kept; new activity will stop syncing.')) return;
        try {
            setActionLoading(true);
            await masterFeesService.disconnect();
            setStatus({ connected: false });
            setCategories([]);
            setReconcile(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleSync = async () => {
        setError(null);
        setNotice(null);
        try {
            setSyncing(true);
            const { summary } = await masterFeesService.sync();
            const inv = summary?.invoices || {};
            const pay = summary?.payments || {};
            setNotice(`Sync complete. Invoices: ${inv.posted || 0} posted, ${inv.skipped || 0} unchanged. Payments: ${(pay.posted || 0) + (pay.reclassified || 0)} applied, ${pay.deferred || 0} deferred.${summary?.errors?.length ? ` ${summary.errors.length} warning(s).` : ''}`);
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleMapCategory = async (cat: MasterFeesCategory, accountId: string) => {
        try {
            setSavingCat(cat.id);
            await masterFeesService.mapCategory(cat.id, accountId, cat.name);
            setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, accountId } : c));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSavingCat(null);
        }
    };

    const handleToggleLencoMode = async (mode: 'shared' | 'separate') => {
        try {
            setActionLoading(true);
            await masterFeesService.setLencoMode(mode);
            setStatus(prev => prev ? { ...prev, lencoMode: mode, lencoModeOverridden: true } : prev);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReconcile = async () => {
        setError(null);
        try {
            setActionLoading(true);
            setReconcile(await masterFeesService.reconcile());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const money = (n: number) => `K${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">Master Fees Integration</h3>
                    <p className="text-sm text-gray-500">Sync school invoices, fee revenue and receivables.</p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start">
                    <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {notice && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm flex items-start">
                    <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{notice}</span>
                </div>
            )}

            {/* Connection card */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                <div className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="h-12 w-12 bg-brand-navy rounded-lg flex items-center justify-center text-white">
                                <GraduationCap className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-gray-900">Master Fees</h4>
                                <p className="text-sm text-gray-500">School fees, invoices &amp; balance tracking</p>
                            </div>
                        </div>
                        <div>
                            {loading ? (
                                <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                            ) : status?.connected ? (
                                <div className="flex items-center space-x-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <CheckCircle className="w-3 h-3 mr-1" /> Connected
                                    </span>
                                    <button onClick={handleDisconnect} disabled={actionLoading} className="text-sm text-red-600 hover:text-red-900 font-medium">
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                    Not connected
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Connect section */}
                    {!loading && !status?.connected && (
                        <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">

                            {/* Primary: 1-click OAuth */}
                            <div className="rounded-xl border border-brand-green/30 bg-brand-green/5 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 h-8 w-8 rounded-lg bg-brand-green flex items-center justify-center flex-shrink-0">
                                        <Zap className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900">1-Click Authorization <span className="text-brand-green text-xs font-medium ml-1">Recommended</span></p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Select your school in Master Fees and MoneyWise is connected instantly — no API keys to copy.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleOAuthConnect}
                                    disabled={oauthLoading}
                                    className="mt-3 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 transition-colors"
                                >
                                    {oauthLoading ? (
                                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Redirecting to Master Fees…</>
                                    ) : (
                                        <><Zap className="h-4 w-4 mr-2" /> Connect with Master Fees</>
                                    )}
                                </button>
                            </div>

                            {/* Secondary: manual key entry fallback */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowManualForm(v => !v)}
                                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showManualForm ? 'rotate-180' : ''}`} />
                                    Enter API credentials manually
                                </button>

                                {showManualForm && (
                                    <form onSubmit={handleConnect} className="mt-3 space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                            Manual entry requires the Endpoint Master Switch to be ON in Master Fees → School API settings. If the switch was off when you last tried, use 1-click authorization above instead.
                                        </p>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">School ID</label>
                                            <input
                                                type="text"
                                                value={schoolId}
                                                onChange={(e) => setSchoolId(e.target.value)}
                                                placeholder="b0486782-b2e1-4ce0-9aed-29e16ac77563"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-brand-green focus:border-brand-green"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
                                            <input
                                                type="password"
                                                value={publicKey}
                                                onChange={(e) => setPublicKey(e.target.value)}
                                                placeholder="mf_pub_…"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-brand-green focus:border-brand-green"
                                                required
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={actionLoading}
                                            className="inline-flex items-center px-4 py-2 rounded-xl shadow-sm text-sm font-bold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50"
                                        >
                                            <Link2 className="h-4 w-4 mr-2" />
                                            {actionLoading ? 'Connecting…' : 'Connect manually'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Connected details */}
                    {status?.connected && (
                        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-500">
                            <div><span className="font-medium text-gray-700">School:</span> {status.schoolName || status.schoolId}</div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">Last Sync:</span>{' '}
                                {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Never'}
                                {autoSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-green" />}
                            </div>
                            {status.lastSyncTruncated && (
                                <div className="sm:col-span-2 flex items-start bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-700">
                                    <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                                    <span>
                                        <strong>Master Fees hit its 1,000-record API limit this sync.</strong> Their invoices/transactions
                                        endpoints cap at 1,000 rows with no pagination support, so some records — most likely from
                                        older or other terms — may be missing from your books. This can only be fixed by Master Fees
                                        adding real pagination on their end; we've flagged it to their team.
                                    </span>
                                </div>
                            )}
                            {status.lastSyncError && (
                                <div className="sm:col-span-2 text-amber-600">
                                    <span className="font-medium">Last sync warning:</span> {status.lastSyncError}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {status?.connected && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 text-brand-green ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button
                            onClick={handleReconcile}
                            disabled={actionLoading}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            <Scale className="h-4 w-4 mr-2 text-brand-green" />
                            Reconcile
                        </button>
                    </div>
                )}
            </div>

            {/* Lenco mode */}
            {status?.connected && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center">
                        <ArrowRightLeft className="h-4 w-4 mr-2 text-brand-green" />
                        Lenco Account Mode
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 mb-4">
                        {status.lencoModeOverridden ? 'Manually set.' : 'Auto-detected.'} If Master Fees collects into the
                        <strong> same</strong> Lenco account as MoneyWise, its payments are already imported — we reclassify
                        them instead of re-recording the cash (avoids double counting). Choose <strong>separate</strong> if it
                        uses a different Lenco account.
                    </p>
                    <div className="flex gap-3">
                        {(['shared', 'separate'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => handleToggleLencoMode(mode)}
                                disabled={actionLoading}
                                className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                                    status.lencoMode === mode
                                        ? 'border-brand-green bg-brand-green/5 text-brand-green'
                                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                            >
                                {mode === 'shared' ? 'Same Lenco account' : 'Separate Lenco account'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Reconciliation panel */}
            {status?.connected && reconcile && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center mb-4">
                        <Scale className="h-4 w-4 mr-2 text-brand-green" /> Receivables Reconciliation
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div className="p-3 rounded-xl bg-gray-50">
                            <div className="text-xs text-gray-500">MoneyWise Receivable</div>
                            <div className="text-lg font-bold text-brand-navy">{money(reconcile.moneywiseReceivable)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-gray-50">
                            <div className="text-xs text-gray-500">Master Fees Outstanding</div>
                            <div className="text-lg font-bold text-brand-navy">{money(reconcile.masterfeesOutstanding)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-gray-50">
                            <div className="text-xs text-gray-500">Difference</div>
                            <div className={`text-lg font-bold ${Math.abs(reconcile.difference) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                                {money(reconcile.difference)}
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-gray-50">
                            <div className="text-xs text-gray-500">Students w/ Balance</div>
                            <div className="text-lg font-bold text-brand-navy">{reconcile.studentsWithBalance}</div>
                        </div>
                    </div>
                    {Math.abs(reconcile.difference) >= 0.01 && (
                        <p className="text-xs text-amber-600 mt-3">
                            A non-zero difference usually means a recent payment hasn't fully synced yet, or an invoice/payment is still deferred. Try "Sync now" and reconcile again.
                        </p>
                    )}
                </div>
            )}

            {/* Fee category → income account mapping */}
            {status?.connected && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-bold text-gray-900">Fee Category → Income Account</h4>
                            <p className="text-xs text-gray-500 mt-1">
                                Each fee category posts revenue to its own income account in your Profit &amp; Loss. Accounts are
                                auto-created on first sync; override the mapping here.
                            </p>
                        </div>
                    </div>
                    {categories.length === 0 ? (
                        <p className="text-sm text-gray-400">No fee categories returned yet. Run "Sync now" to fetch them.</p>
                    ) : (
                        <div className="border border-gray-200 rounded-xl overflow-x-auto">
                            <table className="min-w-[520px] w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-500 uppercase">Fee Category</th>
                                        <th className="px-4 py-2 text-left text-xs font-black text-gray-500 uppercase">Income Account</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {categories.map(cat => (
                                        <tr key={cat.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900">{cat.name}</div>
                                                {cat.amount != null && <div className="text-xs text-gray-500">{money(cat.amount)}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center space-x-2">
                                                    <select
                                                        value={cat.accountId || ''}
                                                        onChange={(e) => handleMapCategory(cat, e.target.value)}
                                                        disabled={savingCat === cat.id}
                                                        className="block w-full min-w-[220px] pl-3 pr-8 py-2 text-sm border-gray-300 rounded-xl border focus:ring-brand-green focus:border-brand-green"
                                                    >
                                                        <option value="">Auto (created on sync)</option>
                                                        {incomeAccounts.map(a => (
                                                            <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                                                        ))}
                                                    </select>
                                                    {savingCat === cat.id && <RefreshCw className="h-4 w-4 animate-spin text-brand-green" />}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
