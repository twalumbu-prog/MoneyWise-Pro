import type { ReconStatus, TxnMatchStatus } from '../lib/types';

const RECON_STYLES: Record<ReconStatus, { label: string; cls: string }> = {
    RECONCILED: { label: 'Reconciled', cls: 'bg-emerald-100 text-emerald-700' },
    MINOR_DRIFT: { label: 'Minor drift', cls: 'bg-amber-100 text-amber-700' },
    OUT_OF_BALANCE: { label: 'Out of balance', cls: 'bg-rose-100 text-rose-700' },
    NOT_LINKED: { label: 'Not linked', cls: 'bg-slate-200 text-slate-600' },
    NO_WALLET: { label: 'No wallet', cls: 'bg-slate-200 text-slate-600' },
    CHECKING: { label: 'Checking…', cls: 'bg-sky-100 text-sky-600 animate-pulse' },
    ERROR: { label: 'Error', cls: 'bg-rose-100 text-rose-700' },
};

export function StatusBadge({ status }: { status: ReconStatus }) {
    const s = RECON_STYLES[status] ?? RECON_STYLES.ERROR;
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
            {s.label}
        </span>
    );
}

const MATCH_STYLES: Record<TxnMatchStatus, { label: string; cls: string }> = {
    MATCHED: { label: 'Matched', cls: 'bg-emerald-100 text-emerald-700' },
    MONEYWISE_ONLY: { label: 'MoneyWise only', cls: 'bg-amber-100 text-amber-700' },
    LENCO_ONLY: { label: 'Lenco only', cls: 'bg-rose-100 text-rose-700' },
};

export function MatchBadge({ status }: { status: TxnMatchStatus }) {
    const s = MATCH_STYLES[status];
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
            {s.label}
        </span>
    );
}
