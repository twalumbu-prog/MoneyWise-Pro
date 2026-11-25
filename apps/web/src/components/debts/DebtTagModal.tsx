import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import type { DebtTagDef } from './debtTags';

interface Counterparties { people: { name: string }[]; companies: { id: string; name: string }[]; debts: { id: string; side: 'OWE' | 'OWED'; name: string }[] }

/** Asks who a tagged transaction is with, then tags it. A person is typed (or picked from people already used); a company is one of your other workspaces. */
export const DebtTagModal: React.FC<{ entry: { id: string; description?: string; debit?: number | string | null; credit?: number | string | null }; tag: DebtTagDef; onClose: () => void; onDone: () => void }> = ({ entry, tag, onClose, onDone }) => {
    const qc = useQueryClient();
    const cps = useQuery({ queryKey: ['debts', 'counterparties'], retry: false, queryFn: () => apiJson<Counterparties>('/debts/counterparties') });
    const existing = (cps.data?.debts ?? []).filter((d) => d.side === tag.side);
    const [kind, setKind] = useState<'PERSON' | 'COMPANY'>('PERSON');
    const [name, setName] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const amount = Math.abs(Number(entry.debit || 0) - Number(entry.credit || 0));
    const ready = kind === 'PERSON' ? name.trim().length > 0 : companyId !== '';
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/debts/tag', { method: 'POST', body: JSON.stringify({ entryId: entry.id, tag: tag.key, ...(kind === 'COMPANY' ? { counterpartyOrgId: companyId } : { counterpartyName: name.trim() }) }) });
            await qc.invalidateQueries({ queryKey: ['debts'] });
            onDone(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not tag it.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={tag.label} onClose={onClose}>
            <ErrorNote text={err} />
            <p className="mb-1 text-sm font-semibold text-[#1F1F1F]">{entry.description?.split(' | Ref:')[0] || 'Transaction'} · {formatKwacha(amount)}</p>
            <p className="mb-4 text-xs text-[#5F6368]">{tag.hint}</p>
            <label className={labelClass}>Who is this with?</label>
            <div className="mb-3 flex gap-2">
                {([['PERSON', 'A person'], ['COMPANY', 'A company']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${kind === k ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>{l}</button>
                ))}
            </div>
            {kind === 'PERSON' ? (
                <>
                    <input className={`${fieldClass} mb-1`} list="debt-people" placeholder="Their name, e.g. Mary" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    <datalist id="debt-people">{existing.map((d) => <option key={d.id} value={d.name} />)}</datalist>
                    {existing.length > 0 && <p className="mb-3 text-[11px] text-[#5F6368]">Type a name you've used before to add to that debt.</p>}
                </>
            ) : (
                <>
                    <select className={`${fieldClass} mb-1`} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                        <option value="">Choose one of your workspaces…</option>
                        {(cps.data?.companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {cps.isSuccess && cps.data.companies.length === 0 && <p className="mb-3 text-[11px] text-[#5F6368]">You don't belong to any company workspace yet.</p>}
                    <p className="mb-3 text-[11px] text-[#5F6368]">The company will see its side of this debt in its own Debts page.</p>
                </>
            )}
            <PrimaryButton busy={busy} onClick={save} disabled={!ready} className="mt-2 w-full">Tag it</PrimaryButton>
        </Dialog>
    );
};
