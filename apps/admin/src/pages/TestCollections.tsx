import { useEffect, useRef, useState } from 'react';
import { Smartphone, Loader2, CheckCircle2, XCircle, PhoneCall } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

interface Organization {
    id: string;
    name: string;
}

interface CollectionData {
    id: string;
    status: string;
    amount: string;
    fee: string | null;
    reference: string;
    reasonForFailure: string | null;
    settlementStatus: string | null;
    mobileMoneyDetails: {
        accountName: string | null;
        phone: string;
        operator: string;
    } | null;
}

type Stage = 'FORM' | 'AWAITING_APPROVAL' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';

// Mirrors LencoService.resolveMobileOperator (Zambia prefixes).
function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = phone.replace(/[^0-9]/g, '');
    const normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
    if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
    if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
    return null;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 36; // 3 minutes

export default function TestCollections() {
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [organizationId, setOrganizationId] = useState('');
    const [phone, setPhone] = useState('');
    const [amount, setAmount] = useState('10');
    const [stage, setStage] = useState<Stage>('FORM');
    const [error, setError] = useState<string | null>(null);
    const [collection, setCollection] = useState<CollectionData | null>(null);
    const [attempt, setAttempt] = useState(0);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        apiGet<{ organizations: Array<{ orgId: string; name: string; linked: boolean }> }>('/admin/reconciliation?quick=1')
            .then(res => {
                const linked = (res.organizations || []).filter(o => o.linked);
                setOrgs(linked.map(o => ({ id: o.orgId, name: o.name })));
            })
            .catch(() => { /* org picker is a convenience; manual paste still works if this fails */ });
    }, []);

    useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

    const operator = detectOperator(phone);

    const startPolling = (reference: string, orgId: string, attemptNum: number) => {
        pollTimer.current = setTimeout(async () => {
            try {
                const res = await apiGet<{ success: boolean; data: CollectionData }>(
                    `/admin/test-collection/status/${reference}?organizationId=${orgId}`
                );
                setCollection(res.data);
                setAttempt(attemptNum);

                if (res.data?.status === 'successful') {
                    setStage('SUCCESS');
                    return;
                }
                if (res.data?.status === 'failed') {
                    setStage('FAILED');
                    return;
                }
                if (attemptNum >= MAX_POLL_ATTEMPTS) {
                    setStage('TIMEOUT');
                    return;
                }
                startPolling(reference, orgId, attemptNum + 1);
            } catch (err: any) {
                setError(err?.message || 'Status check failed');
                setStage('TIMEOUT');
            }
        }, POLL_INTERVAL_MS);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!organizationId.trim()) { setError('Organization ID is required'); return; }
        if (!operator) { setError('Could not detect a Zambian mobile money operator from that number'); return; }
        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) { setError('Enter a valid amount'); return; }

        setStage('AWAITING_APPROVAL');
        setCollection(null);
        setAttempt(0);

        try {
            const res = await apiPost<{ success: boolean; orgName: string; data: CollectionData }>(
                '/admin/test-collection/initiate',
                { organizationId: organizationId.trim(), amount: amountNum, phone, operator }
            );
            setCollection(res.data);
            if (res.data.status !== 'pay-offline') {
                setError(`Unexpected initial status: ${res.data.status}`);
                setStage('TIMEOUT');
                return;
            }
            startPolling(res.data.reference, organizationId.trim(), 1);
        } catch (err: any) {
            setError(err?.message || 'Failed to initiate collection');
            setStage('FORM');
        }
    };

    const reset = () => {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        setStage('FORM');
        setCollection(null);
        setError(null);
        setAttempt(0);
    };

    return (
        <div className="mx-auto max-w-lg">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-brand-navy">Test Collections API Checkout</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Prototype own-UX mobile money checkout (server-initiated, no widget redirect). Runs a real
                    charge against the selected organization's live Lenco subaccount.
                </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                {stage === 'FORM' && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Organization ID</label>
                            <input
                                value={organizationId}
                                onChange={e => setOrganizationId(e.target.value)}
                                placeholder="0dfe477d-2ee3-4d2b-a20f-f5c3a751d951 (Test Company 1)"
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                            />
                            {orgs.length > 0 && (
                                <select
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    onChange={e => setOrganizationId(e.target.value)}
                                    value=""
                                >
                                    <option value="">Or pick from list…</option>
                                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Your phone number</label>
                            <input
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="e.g. 0971234567"
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                            />
                            {phone && (
                                <p className="mt-1 text-xs text-slate-400">
                                    {operator ? `Detected operator: ${operator}` : 'Unrecognized prefix — enter a valid ZM Airtel/MTN/Zamtel number'}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Amount (ZMW)</label>
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                            />
                        </div>

                        {error && <p className="text-sm text-rose-600">{error}</p>}

                        <button
                            type="submit"
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy/90"
                        >
                            <Smartphone className="h-4 w-4" />
                            Send real test charge
                        </button>
                    </form>
                )}

                {stage === 'AWAITING_APPROVAL' && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <PhoneCall className="h-10 w-10 animate-pulse text-brand-navy" />
                        <p className="font-medium text-slate-700">Check your phone for the mobile money prompt</p>
                        <p className="text-sm text-slate-500">
                            {collection?.mobileMoneyDetails?.accountName && `Approving as ${collection.mobileMoneyDetails.accountName}. `}
                            Approve or decline it on your phone — this screen will update on its own.
                        </p>
                        <p className="text-xs text-slate-400">Poll attempt {attempt}/{MAX_POLL_ATTEMPTS} · every {POLL_INTERVAL_MS / 1000}s</p>
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                )}

                {stage === 'SUCCESS' && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                        <p className="text-lg font-semibold text-slate-800">Payment confirmed</p>
                        <p className="text-sm text-slate-500">
                            K{collection?.amount} · fee K{collection?.fee ?? '—'} · settlement: {collection?.settlementStatus ?? '—'}
                        </p>
                        <button onClick={reset} className="mt-2 text-sm font-medium text-brand-navy underline">Run another test</button>
                    </div>
                )}

                {stage === 'FAILED' && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <XCircle className="h-12 w-12 text-rose-500" />
                        <p className="text-lg font-semibold text-slate-800">Payment failed</p>
                        <p className="text-sm text-slate-500">{collection?.reasonForFailure || 'No reason given by Lenco'}</p>
                        <button onClick={reset} className="mt-2 text-sm font-medium text-brand-navy underline">Try again</button>
                    </div>
                )}

                {stage === 'TIMEOUT' && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <XCircle className="h-12 w-12 text-amber-500" />
                        <p className="text-lg font-semibold text-slate-800">No terminal status yet</p>
                        <p className="text-sm text-slate-500">{error || 'Stopped polling after the max attempts. Last known status: ' + (collection?.status || 'unknown')}</p>
                        <button onClick={reset} className="mt-2 text-sm font-medium text-brand-navy underline">Try again</button>
                    </div>
                )}
            </div>
        </div>
    );
}
