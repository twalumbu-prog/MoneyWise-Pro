import { useCallback, useEffect, useState } from 'react';
import {
    Wallet, Plus, Loader2, AlertTriangle, CheckCircle2, Ban, Save, KeyRound,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiPut } from '../lib/api';
import { formatDateTime } from '../lib/format';

type PoolStatus = 'AVAILABLE' | 'LINKED' | 'DISABLED';

interface PoolWallet {
    id: string;
    provider_account_id: string;
    public_key: string;
    status: PoolStatus;
    linked_organization_id: string | null;
    linked_at: string | null;
    created_at: string;
    organizations: { name: string } | null;
}

interface ListResponse {
    wallets: PoolWallet[];
    available: number;
}

interface ActivationSettings {
    value: { amount: number; currency: string };
    description?: string;
    updated_at?: string;
}

const STATUS_STYLES: Record<PoolStatus, { label: string; cls: string }> = {
    AVAILABLE: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700' },
    LINKED: { label: 'Linked', cls: 'bg-sky-100 text-sky-700' },
    DISABLED: { label: 'Disabled', cls: 'bg-slate-200 text-slate-500' },
};

function StatusPill({ status }: { status: PoolStatus }) {
    const s = STATUS_STYLES[status];
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export default function WalletPool() {
    const [wallets, setWallets] = useState<PoolWallet[]>([]);
    const [available, setAvailable] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);

    const [settings, setSettings] = useState<ActivationSettings | null>(null);
    const [amountDraft, setAmountDraft] = useState('');
    const [currencyDraft, setCurrencyDraft] = useState('ZMW');
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm] = useState({ provider_account_id: '', api_secret: '', public_key: '' });
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [list, sett] = await Promise.all([
                apiGet<ListResponse>('/admin/wallet-pool'),
                apiGet<ActivationSettings>('/admin/wallet-pool/settings'),
            ]);
            setWallets(list.wallets);
            setAvailable(list.available);
            setSettings(sett);
            setAmountDraft(String(sett.value.amount));
            setCurrencyDraft(sett.value.currency);
        } catch (err: any) {
            setError(err?.message || 'Failed to load the wallet pool');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddError(null);
        if (!form.provider_account_id.trim() || !form.api_secret.trim() || !form.public_key.trim()) {
            setAddError('All three fields are required.');
            return;
        }
        setAdding(true);
        try {
            await apiPost('/admin/wallet-pool', {
                provider_account_id: form.provider_account_id.trim(),
                api_secret: form.api_secret.trim(),
                public_key: form.public_key.trim(),
            });
            setForm({ provider_account_id: '', api_secret: '', public_key: '' });
            setAddOpen(false);
            await load();
        } catch (err: any) {
            setAddError(err?.message || 'Failed to add the wallet.');
        } finally {
            setAdding(false);
        }
    };

    const handleDisable = async (wallet: PoolWallet) => {
        if (!window.confirm(`Disable wallet ${wallet.provider_account_id}? This cannot be undone — a disabled wallet can never be re-enabled or reused.`)) {
            return;
        }
        setActioningId(wallet.id);
        try {
            await apiPatch(`/admin/wallet-pool/${wallet.id}`, { status: 'DISABLED' });
            await load();
        } catch (err: any) {
            setError(err?.message || 'Failed to disable the wallet.');
        } finally {
            setActioningId(null);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsMessage(null);
        const amount = Number(amountDraft);
        if (isNaN(amount) || amount <= 0) {
            setSettingsMessage('Enter a valid positive amount.');
            return;
        }
        setSavingSettings(true);
        try {
            await apiPut('/admin/wallet-pool/settings', { amount, currency: currencyDraft.trim().toUpperCase() });
            setSettingsMessage('Activation amount updated.');
            await load();
            setTimeout(() => setSettingsMessage(null), 3000);
        } catch (err: any) {
            setSettingsMessage(err?.message || 'Failed to update the activation amount.');
        } finally {
            setSavingSettings(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
        );
    }

    const linkedCount = wallets.filter(w => w.status === 'LINKED').length;
    const disabledCount = wallets.filter(w => w.status === 'DISABLED').length;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-brand-navy">Wallet Pool</h1>
                    <p className="text-sm text-slate-500">
                        Pre-provisioned Lenco accounts linked to organizations during onboarding. A linked wallet can never be reused.
                    </p>
                </div>
                <button
                    onClick={() => setAddOpen(o => !o)}
                    className="flex items-center gap-2 rounded-lg bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy/90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add wallet
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-2xl font-bold text-brand-navy">{wallets.length}</div>
                    <div className="text-xs font-medium text-slate-500">Total wallets</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-2xl font-bold text-emerald-600">{available}</div>
                    <div className="text-xs font-medium text-slate-500">Available</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-2xl font-bold text-sky-600">{linkedCount}</div>
                    <div className="text-xs font-medium text-slate-500">Linked</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-2xl font-bold text-slate-400">{disabledCount}</div>
                    <div className="text-xs font-medium text-slate-500">Disabled</div>
                </div>
            </div>

            {available === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    No AVAILABLE wallets remain — new organizations will be blocked at the wallet-activation step of onboarding until you add one.
                </div>
            )}

            {/* Add wallet form */}
            {addOpen && (
                <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                        <Wallet className="h-4 w-4 text-slate-400" />
                        Add a pre-created wallet to the pool
                    </div>
                    {addError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{addError}</div>}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Provider account ID</label>
                            <input
                                value={form.provider_account_id}
                                onChange={(e) => setForm(f => ({ ...f, provider_account_id: e.target.value }))}
                                placeholder="lenco-acc-xxxxx"
                                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Public key</label>
                            <input
                                value={form.public_key}
                                onChange={(e) => setForm(f => ({ ...f, public_key: e.target.value }))}
                                placeholder="pub-xxxxxxxxxxxx"
                                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                                <KeyRound className="h-3 w-3" /> API secret
                            </label>
                            <input
                                type="password"
                                value={form.api_secret}
                                onChange={(e) => setForm(f => ({ ...f, api_secret: e.target.value }))}
                                placeholder="sk-xxxxxxxxxxxx"
                                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">
                        The secret is stored server-side only — it is never sent back to any client, including this admin panel.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={adding}
                            className="flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/90 disabled:opacity-60"
                        >
                            {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Add to pool
                        </button>
                    </div>
                </form>
            )}

            {/* Wallets table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                            <th className="px-4 py-2 text-left font-semibold">Provider account</th>
                            <th className="px-3 py-2 text-left font-semibold">Status</th>
                            <th className="px-3 py-2 text-left font-semibold">Linked organization</th>
                            <th className="px-3 py-2 text-left font-semibold">Linked at</th>
                            <th className="px-3 py-2 text-left font-semibold">Added</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {wallets.map(w => (
                            <tr key={w.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="px-4 py-3 font-mono text-xs text-slate-700">{w.provider_account_id}</td>
                                <td className="px-3 py-3"><StatusPill status={w.status} /></td>
                                <td className="px-3 py-3 text-slate-600">{w.organizations?.name || <span className="text-slate-300">—</span>}</td>
                                <td className="px-3 py-3 text-slate-500">{w.linked_at ? formatDateTime(w.linked_at) : <span className="text-slate-300">—</span>}</td>
                                <td className="px-3 py-3 text-slate-500">{formatDateTime(w.created_at)}</td>
                                <td className="px-3 py-3 text-right">
                                    {w.status !== 'DISABLED' && (
                                        actioningId === w.id ? (
                                            <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
                                        ) : (
                                            <button
                                                onClick={() => handleDisable(w)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                                            >
                                                <Ban className="h-3 w-3" />
                                                Disable
                                            </button>
                                        )
                                    )}
                                </td>
                            </tr>
                        ))}
                        {wallets.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                                    No wallets in the pool yet. Add one to unblock onboarding activation.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Activation amount settings */}
            <form onSubmit={handleSaveSettings} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                    <CheckCircle2 className="h-4 w-4 text-slate-400" />
                    Wallet activation deposit
                </div>
                <p className="text-xs text-slate-500">
                    {settings?.description || 'Amount new organizations deposit to activate their wallet during onboarding. This is credited to their own wallet — not a fee.'}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Amount</label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amountDraft}
                            onChange={(e) => setAmountDraft(e.target.value)}
                            className="block w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Currency</label>
                        <input
                            value={currencyDraft}
                            onChange={(e) => setCurrencyDraft(e.target.value)}
                            maxLength={3}
                            className="block w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={savingSettings}
                        className="flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                    >
                        {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                    </button>
                    {settingsMessage && <span className="text-xs font-medium text-slate-500">{settingsMessage}</span>}
                </div>
            </form>
        </div>
    );
}
