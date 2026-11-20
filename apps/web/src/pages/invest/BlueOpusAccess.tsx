import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { apiJson } from 'core';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../../components/ui/Dialog';

/** Shown to anyone without an invitation. It says nothing about the company or the offer: it only asks for the code Blue Opus gave them. */
export const InviteGate: React.FC<{ initialCode?: string; onDone: () => void }> = ({ initialCode = '', onDone }) => {
    const [code, setCode] = useState(initialCode);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const redeem = async (c = code) => {
        if (!c.trim()) return;
        setBusy(true); setError(null);
        try { await apiJson('/investments/blue-opus/redeem', { method: 'POST', body: JSON.stringify({ code: c }) }); onDone(); }
        catch (e: any) { setError(e?.message || 'That code didn’t work.'); } finally { setBusy(false); }
    };
    // A link that carries the code opens the offer straight away.
    useEffect(() => { if (initialCode) void redeem(initialCode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
    return (
        <div className="mx-auto max-w-md py-10">
            <div className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-6 text-center">
                <h2 className="text-lg font-bold text-[#1F1F1F]">This is a private offer</h2>
                <p className="mt-2 text-sm text-[#5F6368]">It is open only to people Blue Opus has invited personally. If you were given an invitation code, enter it below.</p>
                <div className="mt-5 text-left">
                    <label className={labelClass}>Invitation code</label>
                    <input className={`${fieldClass} text-center font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BO-XXXXXXXX" autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter') void redeem(); }} />
                </div>
                <ErrorNote text={error} />
                <PrimaryButton onClick={() => redeem()} busy={busy} disabled={!code.trim()} className="mt-4 h-12 w-full">Continue</PrimaryButton>
            </div>
        </div>
    );
};

interface Invite { id: string; code: string; name: string; email: string | null; phone: string | null; note: string | null; expires_at: string | null; redeemed_by: string | null; redeemed_at: string | null; revoked_at: string | null; created_at: string }

const inviteState = (i: Invite): { label: string; cls: string } =>
    i.revoked_at ? { label: 'Revoked', cls: 'bg-[#FCE8E6] text-[#C5221F]' }
    : i.expires_at && new Date(i.expires_at).getTime() < Date.now() ? { label: 'Expired', cls: 'bg-[#F1F3F4] text-[#5F6368]' }
    : i.redeemed_by ? { label: 'Used', cls: 'bg-[#E6F4EA] text-[#137333]' }
    : { label: 'Not used yet', cls: 'bg-[#E8F0FE] text-[#0B57D0]' };

/** Blue Opus (super-admins only): make an invitation for a named person, copy the code or link to send them, and revoke it. */
export const AdminInvites: React.FC = () => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['blue-opus', 'invites'], queryFn: () => apiJson<{ invites: Invite[] }>('/investments/blue-opus/admin/invites'), retry: false });
    const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [days, setDays] = useState('14');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [copied, setCopied] = useState<string | null>(null);
    if (q.isError || !q.data) return null;
    const link = (code: string) => `${window.location.origin}/invest/blue-opus?code=${code}`;
    const make = async () => {
        setBusy(true); setError(null);
        try { await apiJson('/investments/blue-opus/admin/invites', { method: 'POST', body: JSON.stringify({ name, email, phone, expiresInDays: Number(days) || undefined }) }); setName(''); setEmail(''); setPhone(''); await qc.invalidateQueries({ queryKey: ['blue-opus', 'invites'] }); }
        catch (e: any) { setError(e?.message || 'Could not make the invitation.'); } finally { setBusy(false); }
    };
    const revoke = async (id: string) => { try { await apiJson(`/investments/blue-opus/admin/invites/${id}/revoke`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['blue-opus', 'invites'] }); } catch (e: any) { setError(e?.message || 'Could not revoke.'); } };
    const copy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked: the code is on screen */ } };
    return (
        <section className="mt-8 rounded-2xl border border-[#C4C7C5] bg-[#F8FAFD] p-4 md:p-5">
            <h3 className="text-sm font-bold text-[#1F1F1F]">Blue Opus: invitations</h3>
            <p className="mt-1 text-xs text-[#5F6368]">Only people you invite can see this offer. Each code is for one named person and one account.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
                <input className="h-10 rounded-lg border border-[#C4C7C5] px-3 text-sm md:col-span-2" placeholder="Name of the person" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="h-10 rounded-lg border border-[#C4C7C5] px-3 text-sm" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="h-10 rounded-lg border border-[#C4C7C5] px-3 text-sm" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <div className="flex gap-2"><input className="h-10 w-16 rounded-lg border border-[#C4C7C5] px-2 text-center text-sm" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} aria-label="Days until the code expires" title="Days until it expires" /><TonalButton onClick={make} disabled={busy || name.trim().length < 2}>Invite</TonalButton></div>
            </div>
            <ErrorNote text={error} />
            <ul className="mt-3 space-y-2">
                {q.data.invites.length === 0 && <li className="text-sm text-[#5F6368]">No invitations yet.</li>}
                {q.data.invites.map((i) => {
                    const st = inviteState(i); const live = st.label === 'Not used yet';
                    return (
                        <li key={i.id} className="rounded-xl bg-white p-3 text-sm shadow-[inset_0_0_0_1px_#E3E5E8]">
                            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[#1F1F1F]">{i.name}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span></div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5F6368]">
                                <code className="rounded bg-[#F1F3F4] px-2 py-1 font-mono tracking-wider text-[#1F1F1F]">{i.code}</code>
                                {live && <button type="button" onClick={() => copy(link(i.code), i.id)} className="inline-flex items-center gap-1 font-semibold text-[#0B57D0] hover:underline">{copied === i.id ? <Check size={13} /> : <Copy size={13} />} {copied === i.id ? 'Link copied' : 'Copy link'}</button>}
                                {(live || st.label === 'Used') && <button type="button" onClick={() => revoke(i.id)} className="font-semibold text-[#C5221F] hover:underline">Revoke</button>}
                                <span>{i.expires_at ? `expires ${new Date(i.expires_at).toLocaleDateString()}` : 'does not expire'}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

/** Blue Opus (super-admins only): record that a lawyer has approved the CURRENT wording. Until then nobody can sign; a change to the wording needs approval again. */
export const LegalApproval: React.FC<{ approved: boolean; version: string }> = ({ approved, version }) => {
    const qc = useQueryClient();
    const [reviewer, setReviewer] = useState('');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    const set = async (yes: boolean) => {
        setBusy(true); setError(null);
        try { await apiJson('/investments/blue-opus/admin/legal', { method: 'POST', body: JSON.stringify({ approved: yes, reviewer }) }); await qc.invalidateQueries({ queryKey: ['blue-opus'] }); }
        catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    return (
        <section className="mt-8 rounded-2xl border border-[#C4C7C5] bg-[#F8FAFD] p-4 md:p-5">
            <h3 className="text-sm font-bold text-[#1F1F1F]">Blue Opus: legal approval</h3>
            <p className="mt-1 text-xs text-[#5F6368]">Wording version <span className="font-mono">{version}</span>. {approved ? 'A lawyer has approved it, so invited people can sign.' : 'Not approved yet, so nobody can sign. Have your lawyer review it (see docs/BLUE_OPUS_LEGAL_BRIEF.md), then record their approval here.'}</p>
            <ErrorNote text={error} />
            {approved
                ? <button type="button" disabled={busy} onClick={() => set(false)} className="mt-3 h-9 rounded-full px-4 text-xs font-semibold text-[#C5221F] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#FCE8E6]">Withdraw approval (blocks new offers)</button>
                : <div className="mt-3 flex flex-wrap gap-2"><input className="h-10 min-w-[14rem] flex-1 rounded-lg border border-[#C4C7C5] px-3 text-sm" placeholder="Lawyer or firm that approved it" value={reviewer} onChange={(e) => setReviewer(e.target.value)} /><TonalButton onClick={() => set(true)} disabled={busy || reviewer.trim().length < 2}>Record approval</TonalButton></div>}
        </section>
    );
};
