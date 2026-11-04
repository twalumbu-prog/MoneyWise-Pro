import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../../components/ui/Dialog';
import { fmtNav, prettyDate } from './investData';

interface MyFund {
    id: string; key: string; name: string; kind: string; currency: string; frequency: string; min_deposit: number | null; risk: string | null; description: string | null;
    latest: { date: string; nav: number } | null; points: number; recent: { date: string; nav: number }[];
}
interface Mine { isTarget: boolean; company: string | null; funds: MyFund[]; needsMigration?: boolean }

const KINDS = [['UNIT_TRUST', 'Unit trust'], ['MONEY_MARKET', 'Money market'], ['BOND', 'Bond'], ['FIXED_DEPOSIT', 'Fixed deposit'], ['OTHER', 'Other']];
const FREQS = [['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['QUARTERLY', 'Quarterly']];
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

const FundCard: React.FC<{ f: MyFund; onChanged: () => void }> = ({ f, onChanged }) => {
    const [date, setDate] = useState(today());
    const [nav, setNav] = useState('');
    const [bulk, setBulk] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const send = async (body: object) => {
        setBusy(true); setError(null); setNote(null);
        try { const r = await apiJson<{ saved: number }>(`/investments/funds/${f.id}/prices`, { method: 'POST', body: JSON.stringify(body) }); setNote(`Saved ${r.saved} ${r.saved === 1 ? 'price' : 'prices'}.`); setNav(''); setBulk(''); onChanged(); }
        catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const remove = async (d: string) => { try { await apiJson(`/investments/funds/${f.id}/prices/${d}`, { method: 'DELETE' }); onChanged(); } catch (e: any) { setError(e?.message || 'Could not remove.'); } };

    return (
        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-base font-bold text-[#1F1F1F]">{f.name}</h3><p className="text-xs text-[#5F6368]">{KINDS.find((k) => k[0] === f.kind)?.[1]} · {FREQS.find((k) => k[0] === f.frequency)?.[1].toLowerCase()} prices · {f.currency}{f.min_deposit ? ` · from K${f.min_deposit}` : ''}</p></div>
                <div className="text-right"><p className="text-xl font-bold tabular-nums text-[#1F1F1F]">{f.latest ? fmtNav(f.latest.nav) : 'No price yet'}</p><p className="text-xs text-[#5F6368]">{f.latest ? `for ${prettyDate(f.latest.date)} · ${f.points} prices` : 'Investors see nothing until you send one'}</p></div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-[#F8FAFD] p-4">
                    <p className="mb-2 text-sm font-bold text-[#1F1F1F]">Send today’s price</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className={labelClass}>Date</label><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} /></div>
                        <div><label className={labelClass}>Price per unit</label><input inputMode="decimal" value={nav} onChange={(e) => setNav(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="1.2540" className={fieldClass} /></div>
                    </div>
                    <PrimaryButton onClick={() => send({ prices: [{ date, nav: Number(nav) }] })} busy={busy} disabled={!(Number(nav) > 0) || !date} className="mt-3 h-11 w-full">Save price</PrimaryButton>
                </div>
                <div className="rounded-2xl bg-[#F8FAFD] p-4">
                    <p className="mb-2 text-sm font-bold text-[#1F1F1F]">Send many at once</p>
                    <textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'One line per day:\n2026-11-02, 1.2535\n2026-11-03, 1.2540'} className="w-full rounded-xl border border-[#C4C7C5] bg-white px-3 py-2 text-sm focus:border-[#0B57D0] focus:outline-none" />
                    <TonalButton onClick={() => send({ text: bulk })} disabled={busy || !bulk.trim()} className="mt-2 h-11 w-full">Save prices</TonalButton>
                </div>
            </div>
            <ErrorNote text={error} />
            {note && <p className="mt-3 rounded-xl bg-[#E6F4EA] px-3 py-2 text-xs text-[#137333]">{note}</p>}

            {f.recent.length > 0 && (
                <ul className="mt-4 divide-y divide-[#E3E5E8] text-sm">
                    {f.recent.map((p) => (
                        <li key={p.date} className="flex items-center justify-between py-2"><span className="text-[#5F6368]">{prettyDate(p.date)}</span><span className="tabular-nums font-semibold text-[#1F1F1F]">{fmtNav(p.nav)}</span>
                            <button type="button" onClick={() => remove(p.date)} aria-label={`Remove the price for ${p.date}`} className="flex h-8 w-8 items-center justify-center rounded-full text-[#80868B] hover:bg-[#FCE8E6] hover:text-[#B31412]"><Trash2 size={14} /></button></li>
                    ))}
                </ul>
            )}
        </section>
    );
};

/** For an investment company on MoneyWise: list your funds and send their prices. What investors see, chart and holding values included, comes from these. */
export const FundPrices: React.FC = () => {
    const qc = useQueryClient();
    const mine = useQuery({ queryKey: ['invest', 'funds', 'mine'], queryFn: () => apiJson<Mine>('/investments/funds/mine'), retry: false });
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ name: '', kind: 'UNIT_TRUST', frequency: 'DAILY', minDeposit: '', risk: '', description: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const refresh = () => { qc.invalidateQueries({ queryKey: ['invest', 'funds'] }); };

    const create = async () => {
        setBusy(true); setError(null);
        try { await apiJson('/investments/funds', { method: 'POST', body: JSON.stringify({ ...form, minDeposit: Number(form.minDeposit) || undefined }) }); setAdding(false); setForm({ name: '', kind: 'UNIT_TRUST', frequency: 'DAILY', minDeposit: '', risk: '', description: '' }); refresh(); }
        catch (e: any) { setError(e?.message || 'Could not save the fund.'); } finally { setBusy(false); }
    };

    return (
        <PagePanel title="Fund prices" subtitle={mine.data?.company ? `${mine.data.company}: the prices investors see` : 'Send your funds’ prices to MoneyWise'} back="/invest"
            actions={mine.data?.isTarget ? <PrimaryButton onClick={() => setAdding((v) => !v)} className="h-10 px-5"><Plus size={16} /> Add a fund</PrimaryButton> : undefined}>
            {mine.isPending ? <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F4]" />
                : mine.isError || !mine.data?.isTarget ? <div className="py-16 text-center"><p className="text-base font-bold text-[#1F1F1F]">This page is for investment companies on MoneyWise</p><p className="mt-1 text-sm text-[#5F6368]">Sign in to your company account to list funds and send prices.</p></div>
                : (
                    <div className="space-y-4">
                        <p className="max-w-2xl text-sm text-[#5F6368]">Investors see only what you send here: today’s price, the chart, and how their holding has grown. Nothing is estimated, and a price older than expected is marked as old.</p>
                        {mine.data.needsMigration && <p className="rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#B06000]">Fund prices are opening soon.</p>}
                        {adding && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                                <h3 className="mb-3 text-sm font-bold text-[#1F1F1F]">New fund</h3>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="md:col-span-2"><label className={labelClass}>Name investors see</label><input className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Equity Fund" /></div>
                                    <div><label className={labelClass}>Smallest deposit (K)</label><input className={fieldClass} inputMode="decimal" value={form.minDeposit} onChange={(e) => setForm({ ...form, minDeposit: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="100" /></div>
                                    <div><label className={labelClass}>Kind</label><select className={`${fieldClass} appearance-none`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                                    <div><label className={labelClass}>You send a price</label><select className={`${fieldClass} appearance-none`} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                                    <div><label className={labelClass}>Risk</label><input className={fieldClass} value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} placeholder="Medium" /></div>
                                    <div className="md:col-span-3"><label className={labelClass}>What it invests in</label><input className={fieldClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={800} /></div>
                                </div>
                                <ErrorNote text={error} />
                                <PrimaryButton onClick={create} busy={busy} disabled={!form.name.trim()} className="mt-4 h-11 px-6">Save fund</PrimaryButton>
                            </section>
                        )}
                        {mine.data.funds.length === 0 && !adding ? <div className="py-12 text-center"><p className="text-base font-bold text-[#1F1F1F]">No funds listed yet</p><p className="mt-1 text-sm text-[#5F6368]">Add your first fund, then send its price.</p></div>
                            : mine.data.funds.map((f) => <FundCard key={f.id} f={f} onChanged={refresh} />)}
                    </div>
                )}
        </PagePanel>
    );
};
