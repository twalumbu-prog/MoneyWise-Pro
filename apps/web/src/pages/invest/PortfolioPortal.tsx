import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from 'core';
import { PagePanel } from '../../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, fieldClass, labelClass } from '../../components/ui/Dialog';
import { fmtNav, prettyDate } from './investData';

interface PortalFund {
    fundId: string; targetId: string; company: string | null; name: string; deposits: number; units: number | null; latestNav: number | null; latestDate: string | null; value: number | null;
    lastPortalCheck: { as_of: string; valid_deposits: number | null; total_units: number; available_value: number } | null; websiteBehind: boolean; latestWebsiteDate: string | null;
    orderBook: { investmentId: string; date: string; amount: number; units: number | null; flowCode: string | null; verified: boolean }[];
    snapshots: { as_of: string; valid_deposits: number | null; total_units: number; available_value: number; nav: number }[];
    prices: { date: string; nav: number; source: string }[];
}
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const k = (n: number | null | undefined) => (n == null ? '—' : `K${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const SOURCE: Record<string, string> = { STATEMENT: 'Portal-verified', WEBSITE: 'Website', MANAGER: 'Company', DEMO: 'Demo' };

const FundBlock: React.FC<{ f: PortalFund; onChanged: () => void }> = ({ f, onChanged }) => {
    const [asOf, setAsOf] = useState(today());
    const [deposits, setDeposits] = useState('');
    const [units, setUnits] = useState('');
    const [value, setValue] = useState('');
    const [book, setBook] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string[] | null>(null);

    const run = async (path: string, body: object, describe: (r: any) => string[]) => {
        setBusy(true); setError(null); setResult(null);
        try { const r = await apiJson<any>(`/investments/portfolio/portal/${path}`, { method: 'POST', body: JSON.stringify({ targetId: f.targetId, fundId: f.fundId, ...body }) }); setResult(describe(r)); onChanged(); }
        catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const saveTotals = () => run('totals', { asOf, validDeposits: deposits, totalUnits: units, availableValue: value }, (r) => {
        const c = r.checks, out = [`Saved. Price per unit ${fmtNav(r.nav)} for ${prettyDate(r.asOf)}.`];
        if (c.deposits) out.push(c.deposits.ok ? 'Deposits tie to MoneyWise.' : `Deposits differ: portal ${k(c.deposits.portal)} vs MoneyWise ${k(c.deposits.moneywise)} (${k(c.deposits.diff)}).`);
        out.push(c.units.moneywise == null ? c.units.note : c.units.ok ? 'Units tie to the order book.' : `Units differ: portal ${c.units.portal} vs order book ${c.units.moneywise} (${c.units.diff}).`);
        return out;
    });
    const saveBook = () => run('order-book', { text: book }, (r) => [
        `${r.matched.length} deposit${r.matched.length === 1 ? '' : 's'} confirmed with the portal's units.`,
        ...r.missingInMoneywise.map((m: any) => `In the portal but not in MoneyWise: ${m.flowCode ?? ''} ${prettyDate(m.date)} ${k(m.amount)}`),
        ...r.notInPortal.map((m: any) => `In MoneyWise but not in the portal: ${prettyDate(m.date)} ${k(m.amount)}`),
        r.allTied ? 'Order book ties exactly.' : 'Some rows did not tie, see above.',
    ]);

    return (
        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-base font-semibold text-[#1F1F1F]">{f.name}</p><p className="text-xs text-[#5F6368]">{f.company}</p></div>
                <div className="text-right"><p className="text-xl font-bold tabular-nums text-[#1F1F1F]">{k(f.value)}</p>
                    <p className="text-xs text-[#5F6368]">{f.units != null ? `${f.units.toLocaleString('en-US')} units` : 'units not confirmed'}{f.latestNav ? ` · ${fmtNav(f.latestNav)} on ${prettyDate(f.latestDate!)}` : ''}</p></div>
            </div>
            {f.websiteBehind && <p className="mt-3 rounded-lg bg-[#FFF4E5] px-3 py-2 text-xs text-[#8A5300]">The website price feed is behind (last {f.latestWebsiteDate ? prettyDate(f.latestWebsiteDate) : 'never'}). The value above uses your portal-verified price.</p>}

            <h3 className="mt-5 text-sm font-semibold text-[#1F1F1F]">Update from the portal</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><label className={labelClass}>Date</label><input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} className={fieldClass} /></div>
                <div><label className={labelClass}>Valid deposits</label><input inputMode="decimal" value={deposits} onChange={(e) => setDeposits(e.target.value)} placeholder="13,974.00" className={fieldClass} /></div>
                <div><label className={labelClass}>Total units</label><input inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="5,142.60" className={fieldClass} /></div>
                <div><label className={labelClass}>Available value</label><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="18,515.59" className={fieldClass} /></div>
            </div>
            <PrimaryButton onClick={saveTotals} busy={busy} disabled={!units || !value} className="mt-3 h-11 w-full md:w-auto md:px-6">Save portal totals</PrimaryButton>

            <h3 className="mt-6 text-sm font-semibold text-[#1F1F1F]">Order book</h3>
            <div className="mt-2 divide-y divide-[rgba(116,119,117,0.15)] rounded-xl border border-[rgba(116,119,117,0.22)] text-sm">
                {f.orderBook.map((o) => (
                    <div key={o.investmentId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div><p className="font-medium text-[#1F1F1F]">{prettyDate(o.date)} · {k(o.amount)}</p><p className="text-xs text-[#5F6368]">{o.flowCode ?? 'No flow code'}</p></div>
                        <p className={`text-right text-xs ${o.verified ? 'text-[#03A862]' : 'text-[#8A5300]'}`}>{o.units != null ? `${o.units.toLocaleString('en-US')} units` : 'units unknown'}<br />{o.verified ? 'Confirmed with portal' : 'Estimated'}</p>
                    </div>
                ))}
            </div>
            <label className={`${labelClass} mt-3`}>Paste the portal's order book to confirm it (one line per deposit: flow code, date, amount, units)</label>
            <textarea value={book} onChange={(e) => setBook(e.target.value)} rows={3} placeholder={'TXN/2026/0030818, 2026-10-12, 489.00, 141.80'} className={`${fieldClass} font-mono text-xs`} />
            <PrimaryButton onClick={saveBook} busy={busy} disabled={!book.trim()} className="mt-3 h-11 w-full md:w-auto md:px-6">Confirm order book</PrimaryButton>

            {error && <div className="mt-3"><ErrorNote text={error} /></div>}
            {result && <ul className="mt-3 space-y-1 rounded-lg bg-[#F1F8F4] px-3 py-2 text-xs text-[#1F1F1F]">{result.map((l, i) => <li key={i}>{l}</li>)}</ul>}

            <h3 className="mt-6 text-sm font-semibold text-[#1F1F1F]">Price history</h3>
            <ul className="mt-2 max-h-56 divide-y divide-[rgba(116,119,117,0.15)] overflow-auto text-sm">
                {f.prices.map((p) => <li key={`${p.date}${p.source}`} className="flex justify-between py-1.5"><span className="text-[#5F6368]">{prettyDate(p.date)} · {SOURCE[p.source] ?? p.source}</span><span className="tabular-nums font-semibold">{fmtNav(p.nav)}</span></li>)}
            </ul>
            {f.snapshots.length > 0 && <>
                <h3 className="mt-5 text-sm font-semibold text-[#1F1F1F]">Portal confirmations</h3>
                <ul className="mt-2 max-h-48 divide-y divide-[rgba(116,119,117,0.15)] overflow-auto text-xs text-[#5F6368]">
                    {f.snapshots.map((s, i) => <li key={i} className="flex justify-between py-1.5"><span>{prettyDate(s.as_of)}</span><span className="tabular-nums">{s.total_units.toLocaleString('en-US')} units · {k(s.available_value)}</span></li>)}
                </ul></>}
        </section>
    );
};

/** For an investor: type what the company's portal shows and confirm its order book, so units, prices and the value of every holding are verified. */
export const PortfolioPortal: React.FC = () => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['invest', 'portal'], queryFn: () => apiJson<{ funds: PortalFund[] }>('/investments/portfolio/portal'), retry: false });
    const refresh = () => { qc.invalidateQueries({ queryKey: ['invest', 'portal'] }); qc.invalidateQueries({ queryKey: ['home-dashboard', 'portfolio'] }); qc.invalidateQueries({ queryKey: ['investments'] }); };
    return (
        <PagePanel title="Portfolio check" subtitle="Enter the totals your investment company’s portal shows. MoneyWise uses them for your value and keeps the verified history." back="/invest">
            <div className="space-y-4">
                {q.isLoading && <p className="text-sm text-[#5F6368]">Loading…</p>}
                {q.isError && <ErrorNote text="Could not load your funds." />}
                {q.data && q.data.funds.length === 0 && <p className="text-sm text-[#5F6368]">You have no confirmed investments in a listed fund yet.</p>}
                {q.data?.funds.map((f) => <FundBlock key={f.fundId} f={f} onChanged={refresh} />)}
            </div>
        </PagePanel>
    );
};
