import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { CheckCircle2, Clock, Pencil, Plus, UserRound } from 'lucide-react';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

interface Staff { id: string; name: string; role?: 'HAIRDRESSER' | 'NAIL_TECH'; isBookable: boolean; isActive: boolean; workStart: string; workEnd: string; workingDays: number[]; userId: string | null; serviceIds: string[] }
interface Service { id: string; name: string; duration_minutes: number | null; category?: string | null }
type Role = 'HAIRDRESSER' | 'NAIL_TECH';
const isNailService = (s: Service) => String(s.category ?? '').toLowerCase() === 'nails';
interface Booking { id: string; service: string; staffId: string | null; staff: string | null; customerName: string; customerPhone: string; start: string; end: string; bookedUntil: string; status: 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW'; finishedAt: string | null; amount: number; paid: number; balance: number; deposit: number | null; noShow: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

function StaffDialog({ staff, services, newRole, onClose, onSaved }: { staff: Staff | null; services: Service[]; newRole: Role; onClose: () => void; onSaved: () => void }) {
    const [role, setRole] = useState<Role>(staff?.role ?? newRole);
    // A new staff member starts with every service of their category ticked (they can untick any).
    const [name, setName] = useState(staff?.name ?? '');
    const [workStart, setWorkStart] = useState(staff?.workStart ?? '08:00');
    const [workEnd, setWorkEnd] = useState(staff?.workEnd ?? '18:00');
    const [days, setDays] = useState<number[]>(staff?.workingDays ?? [1, 2, 3, 4, 5, 6]);
    const [serviceIds, setServiceIds] = useState<string[]>(staff?.serviceIds ?? services.filter((s) => isNailService(s) === (newRole === 'NAIL_TECH')).map((s) => s.id));
    const noun = role === 'NAIL_TECH' ? 'nail technician' : 'hairdresser';
    // Show the services that belong to this category first.
    const shown = [...services].sort((a, b) => Number(isNailService(b) === (role === 'NAIL_TECH')) - Number(isNailService(a) === (role === 'NAIL_TECH')));
    const [bookable, setBookable] = useState(staff?.isBookable ?? true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson(staff ? `/salon/staff/${staff.id}` : '/salon/staff', { method: staff ? 'PUT' : 'POST', body: JSON.stringify({ name, role, workStart, workEnd, workingDays: days, serviceIds, isBookable: bookable, isActive: true }) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={staff ? `Edit ${staff.name}` : `Add a ${noun}`} onClose={onClose}>
            <ErrorNote text={err} />
            <label className={labelClass}>Category</label>
            <div className="mb-3 flex gap-2">{([['HAIRDRESSER', 'Hairdresser'], ['NAIL_TECH', 'Nail technician']] as const).map(([r, label]) => <button key={r} type="button" onClick={() => setRole(r)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${role === r ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>{label}</button>)}</div>
            <label className={labelClass}>Name</label>
            <input className={`${fieldClass} mb-3`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Siba" />
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Starts</label><input type="time" className={fieldClass} value={workStart} onChange={(e) => setWorkStart(e.target.value)} /></div>
                <div><label className={labelClass}>Finishes</label><input type="time" className={fieldClass} value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} /></div>
            </div>
            <label className={labelClass}>Working days</label>
            <div className="mb-3 flex flex-wrap gap-2">{DAYS.map((d, i) => <button key={d} type="button" onClick={() => setDays(toggle(days, i))} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${days.includes(i) ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>{d}</button>)}</div>
            <label className={labelClass}>Services they do</label>
            <div className="mb-3 flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-xl bg-white p-3">
                {services.length === 0 && <p className="text-xs text-[#5F6368]">Add appointment services under Products first.</p>}
                {shown.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-[#1F1F1F]"><input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => setServiceIds(toggle(serviceIds, s.id))} /> {s.name}{s.duration_minutes ? <span className="text-[11px] text-[#5F6368]">· {s.duration_minutes} min</span> : null}</label>
                ))}
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm text-[#1F1F1F]"><input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} /> Clients can book this {noun}</label>
            <PrimaryButton busy={busy} onClick={save} disabled={!name.trim() || days.length === 0} className="w-full">Save</PrimaryButton>
        </Dialog>
    );
}

/** The salon's side of booking: each hairdresser's bookings for a day (with "Finished"), and who the hairdressers are. */
export const SalonPanel: React.FC = () => {
    const qc = useQueryClient();
    const [date, setDate] = useState(todayStr());
    const [staffFilter, setStaffFilter] = useState('');
    const [staffTab, setStaffTab] = useState<'HAIRDRESSER' | 'NAIL_TECH'>('HAIRDRESSER');
    const [editing, setEditing] = useState<Staff | 'new' | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const team = useQuery<{ staff: Staff[]; services: Service[] }>({ queryKey: ['salon', 'staff'], queryFn: () => apiJson('/salon/staff'), retry: false });
    const day = useQuery<{ bookings: Booking[] }>({ queryKey: ['salon', 'bookings', date, staffFilter], queryFn: () => apiJson(`/salon/bookings?date=${date}${staffFilter ? `&staffId=${staffFilter}` : ''}`), retry: false, refetchInterval: 60_000 });
    const refresh = () => qc.invalidateQueries({ queryKey: ['salon'] });

    const [linkFor, setLinkFor] = useState<{ id: string; url: string; amount: number } | null>(null);
    const act = async (b: Booking, path: string, onOk: (r: any) => void) => {
        setBusyId(b.id); setErr(null); setNote(null);
        try { onOk(await apiJson<any>(`/salon/bookings/${b.id}/${path}`, { method: 'POST' })); refresh(); }
        catch (e: any) { setErr(e?.message || 'That didn’t work.'); } finally { setBusyId(null); }
    };
    const makeLink = (b: Booking) => act(b, 'balance-link', (r) => setLinkFor({ id: b.id, url: `${window.location.origin}${r.path}`, amount: r.amount }));
    const cashIn = (b: Booking) => { if (window.confirm(`Record ${formatKwacha(b.balance)} received in cash from ${b.customerName}?`)) act(b, 'balance-received', (r) => setNote(`${formatKwacha(r.recorded)} recorded as cash received. ${b.customerName} is paid up.`)); };
    const noShow = (b: Booking) => { if (window.confirm(`Mark ${b.customerName} as a no-show? Their deposit is kept and not refunded.`)) act(b, 'no-show', (r) => setNote(`Marked as a no-show. ${formatKwacha(r.depositKept)} kept.`)); };

    const finish = async (b: Booking) => {
        setBusyId(b.id); setErr(null); setNote(null);
        try {
            const r = await apiJson<{ freedMinutes: number; endedAt: string }>(`/salon/bookings/${b.id}/complete`, { method: 'POST' });
            setNote(r.freedMinutes > 0 ? `Finished at ${fmt(r.endedAt)}. ${r.freedMinutes} minutes are free again for the next client.` : 'Marked finished.');
            refresh();
        } catch (e: any) { setErr(e?.message || 'Could not mark it finished.'); } finally { setBusyId(null); }
    };

    const rows = day.data?.bookings ?? [];
    const groups = new Map<string, Booking[]>();
    rows.forEach((b) => { const k = b.staff ?? 'No hairdresser'; groups.set(k, [...(groups.get(k) ?? []), b]); });
    const isFuture = date > todayStr();

    return (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <section className="rounded-2xl bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Clock size={15} className="text-[#0B57D0]" /> Bookings</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <input type="date" className="h-10 rounded-xl border border-[#C4C7C5] bg-white px-3 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
                        <select className="h-10 rounded-xl border border-[#C4C7C5] bg-white px-3 text-sm" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                            <option value="">Everyone</option>
                            {(team.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
                <ErrorNote text={err || (day.error as any)?.message} />
                {note && <p className="mb-3 rounded-xl bg-[#E6F4EA] px-3 py-2 text-sm text-[#137333]">{note}</p>}
                {day.isSuccess && rows.length === 0 && <p className="text-sm text-[#5F6368]">No bookings on this day.</p>}
                {[...groups.entries()].map(([who, list]) => (
                    <div key={who} className="mb-4 last:mb-0">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#5F6368]"><UserRound size={12} /> {who} <span className="font-medium normal-case tracking-normal">({list.length})</span></p>
                        <ul className="divide-y divide-[rgba(116,119,117,0.15)] rounded-xl border border-[rgba(116,119,117,0.2)]">
                            {list.map((b) => (
                                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[#1F1F1F]">{fmt(b.start)} – {fmt(b.end)} · {b.service}</p>
                                        <p className="text-[11px] text-[#5F6368]">{b.customerName}{b.customerPhone && b.customerPhone !== 'N/A' ? ` · ${b.customerPhone}` : ''} · {formatKwacha(b.amount)}{b.status === 'COMPLETED' && b.bookedUntil !== b.end ? ` · booked until ${fmt(b.bookedUntil)}` : ''}</p>
                                        <p className={`text-[11px] font-semibold ${b.noShow ? 'text-[#B31412]' : b.balance > 0 ? 'text-[#B06000]' : 'text-[#137333]'}`}>
                                            {b.noShow ? `No-show · ${formatKwacha(b.paid)} deposit kept` : b.balance > 0 ? `${formatKwacha(b.paid)} paid · ${formatKwacha(b.balance)} due` : `${formatKwacha(b.paid)} paid in full`}
                                        </p>
                                        {linkFor?.id === b.id && (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-[#F8FAFD] px-2.5 py-1.5">
                                                <span className="truncate text-[11px] text-[#5F6368]">{linkFor.url}</span>
                                                <button type="button" onClick={() => navigator.clipboard?.writeText(linkFor.url).then(() => setNote(`Link for ${formatKwacha(linkFor.amount)} copied. Send it to ${b.customerName}.`))} className="text-[11px] font-bold text-[#0B57D0] hover:underline">Copy</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {b.balance > 0 && !b.noShow && (
                                            <>
                                                <button type="button" onClick={() => makeLink(b)} disabled={busyId === b.id} className="rounded-full border border-[#C4C7C5] px-3 py-1.5 text-[11px] font-bold text-[#1F1F1F] hover:bg-[#F8FAFD] disabled:opacity-40">Balance link</button>
                                                <button type="button" onClick={() => cashIn(b)} disabled={busyId === b.id} className="rounded-full border border-[#C4C7C5] px-3 py-1.5 text-[11px] font-bold text-[#1F1F1F] hover:bg-[#F8FAFD] disabled:opacity-40">Cash received</button>
                                            </>
                                        )}
                                        {b.noShow
                                            ? null
                                            : b.status === 'COMPLETED'
                                                ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[11px] font-bold text-[#137333]"><CheckCircle2 size={12} /> Finished</span>
                                                : (
                                                    <>
                                                        <button type="button" onClick={() => noShow(b)} disabled={busyId === b.id || isFuture} title="The client didn’t come. Their deposit is kept." className="rounded-full border border-[#E6B8B5] px-3 py-1.5 text-[11px] font-bold text-[#B31412] hover:bg-[#FCE8E6] disabled:opacity-40">No-show</button>
                                                        <button type="button" onClick={() => finish(b)} disabled={busyId === b.id || isFuture} title={isFuture ? 'This booking is in the future' : 'Mark this service finished'} className="rounded-full border border-[#0B57D0] px-4 py-1.5 text-xs font-bold text-[#0B57D0] hover:bg-[#E8F0FE] disabled:opacity-40">{busyId === b.id ? 'Saving…' : 'Finished'}</button>
                                                    </>
                                                )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </section>

            {([[staffTab, staffTab === 'NAIL_TECH' ? 'Nail technicians' : 'Hairdressers']] as const).map(([role, heading]) => {
                const all = team.data?.staff ?? [];
                const list = all.filter((s) => (s.role ?? 'HAIRDRESSER') === role);
                const count = (r: string) => all.filter((s) => (s.role ?? 'HAIRDRESSER') === r).length;
                return (
            <section key={role} className="rounded-2xl bg-white p-4">
                <div className="mb-3 flex gap-2" role="tablist">
                    {([['HAIRDRESSER', 'Hairdressers'], ['NAIL_TECH', 'Nail technicians']] as const).map(([r, label]) => (
                        <button key={r} type="button" role="tab" aria-selected={staffTab === r} onClick={() => setStaffTab(r)} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${staffTab === r ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368] hover:bg-[#F8FAFD]'}`}>{label} <span className="font-medium">({count(r)})</span></button>
                    ))}
                </div>
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><UserRound size={15} className="text-[#0B57D0]" /> {heading}</h3>
                    <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-full bg-[#0B57D0] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#0842A0]"><Plus size={13} /> {role === 'NAIL_TECH' ? 'Add nail technician' : 'Add hairdresser'}</button>
                </div>
                <ErrorNote text={(team.error as any)?.message} />
                {list.length === 0 && <p className="py-2 text-sm text-[#5F6368]">{role === 'NAIL_TECH' ? 'No nail technicians yet. Use “Add nail technician”.' : 'No hairdressers yet.'}</p>}
                <ul className="divide-y divide-[rgba(116,119,117,0.15)]">
                    {list.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#1F1F1F]">{s.name}{!s.isBookable ? <span className="ml-2 rounded-full bg-[#F1F3F4] px-2 py-0.5 text-[10px] font-bold text-[#5F6368]">Not bookable</span> : null}</p>
                                <p className="text-[11px] text-[#5F6368]">{s.workingDays.map((d) => DAYS[d]).join(', ')} · {fmt(s.workStart)} – {fmt(s.workEnd)} · {s.serviceIds.length} service{s.serviceIds.length === 1 ? '' : 's'}</p>
                            </div>
                            <button type="button" onClick={() => setEditing(s)} className="inline-flex items-center gap-1 text-xs font-bold text-[#0B57D0] hover:underline"><Pencil size={12} /> Edit</button>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-[11px] text-[#5F6368]">Clients choose from the bookable hairdressers who do a service (or leave it on any available). A service with no hairdresser assigned keeps the old rules.</p>
            </section>
                );
            })}

            {editing && <StaffDialog key={editing === 'new' ? `new-${staffTab}` : editing.id} staff={editing === 'new' ? null : editing} newRole={staffTab} services={team.data?.services ?? []} onClose={() => setEditing(null)} onSaved={refresh} />}
        </div>
    );
};
