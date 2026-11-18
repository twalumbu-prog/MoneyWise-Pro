import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, CalendarDays, Check, Clock } from 'lucide-react';
import { productService, AppointmentInfo, AppointmentSlot, formatSlotTime } from '../services/product.service';

interface AppointmentPickerProps {
    productId: string;
    productName: string;
    price: number;
    initial?: { date: string; time: string; staffId?: string | null; deposit?: number | null } | null;
    onClose: () => void;
    /** date = YYYY-MM-DD, time = HH:MM (start), endTime = HH:MM */
    onConfirm: (date: string, time: string, endTime: string, staff?: { id: string; name: string } | null, deposit?: number | null) => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const prettyDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
};

/** Customer-facing picker for SERVICE_APPOINTMENT products: choose a day, then a time slot. */
const AppointmentPicker: React.FC<AppointmentPickerProps> = ({ productId, productName, price, initial, onClose, onConfirm }) => {
    const [info, setInfo] = useState<AppointmentInfo | null>(null);
    const [infoError, setInfoError] = useState(false);
    const [date, setDate] = useState<string | null>(initial?.date || null);
    const [time, setTime] = useState<string | null>(initial?.time || null);
    const [slots, setSlots] = useState<AppointmentSlot[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    // A service with hairdressers lets the client choose one (or leave it as "any available"); the choice changes the times shown.
    const [staffId, setStaffId] = useState<string>(initial?.staffId || 'any');
    // The amount to pay now: one of the deposits the service offers, or null for the full price.
    const [deposit, setDeposit] = useState<number | null | undefined>(initial ? initial.deposit ?? null : undefined);
    const [view, setView] = useState<{ y: number; m0: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        productService.getAppointmentInfo(productId)
            .then(i => {
                if (cancelled) return;
                setInfo(i);
                const base = initial?.date && initial.date >= i.min_date ? initial.date : i.min_date;
                const [y, m] = base.split('-').map(Number);
                setView({ y, m0: m - 1 });
            })
            .catch(() => !cancelled && setInfoError(true));
        return () => { cancelled = true; };
    }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!date) return;
        let cancelled = false;
        setSlotsLoading(true);
        productService.getAppointmentSlots(productId, date, staffId)
            .then(s => { if (!cancelled) { setSlots(s); setTime(t => (t && s.some(x => x.start === t) ? t : null)); } })
            .catch(() => { if (!cancelled) setSlots([]); })
            .finally(() => { if (!cancelled) setSlotsLoading(false); });
        return () => { cancelled = true; };
    }, [productId, date, staffId]);

    const isDayEnabled = (d: string) => {
        if (!info) return false;
        if (d < info.min_date || d > info.max_date || info.closed_dates.includes(d)) return false;
        return info.open_weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
    };

    const cells = useMemo(() => {
        if (!view) return [] as (string | null)[];
        const leading = new Date(Date.UTC(view.y, view.m0, 1)).getUTCDay();
        const days = new Date(Date.UTC(view.y, view.m0 + 1, 0)).getUTCDate();
        const arr: (string | null)[] = Array(leading).fill(null);
        for (let d = 1; d <= days; d++) arr.push(`${view.y}-${pad(view.m0 + 1)}-${pad(d)}`);
        return arr;
    }, [view]);

    const stepMonth = (delta: number) => {
        if (!view) return;
        const dt = new Date(Date.UTC(view.y, view.m0 + delta, 1));
        setView({ y: dt.getUTCFullYear(), m0: dt.getUTCMonth() });
    };
    const minMonth = info ? Number(info.min_date.slice(0, 4)) * 12 + Number(info.min_date.slice(5, 7)) - 1 : 0;
    const maxMonth = info ? Number(info.max_date.slice(0, 4)) * 12 + Number(info.max_date.slice(5, 7)) - 1 : 0;
    const viewIdx = view ? view.y * 12 + view.m0 : 0;
    const monthLabel = view
        ? new Date(Date.UTC(view.y, view.m0, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        : '';

    const chosen = slots.find(s => s.start === time) || null;
    const staffList = info?.staff ?? [];
    const depositOptions = info?.deposit_options ?? [];
    const fullPrice = info?.price ?? price;
    // With deposits on offer the smallest one is chosen until the client picks otherwise (it is what secures the booking).
    const payNow = depositOptions.length > 0 ? (deposit === undefined ? depositOptions[0] : deposit) : null;
    const chosenStaff = staffId !== 'any' ? staffList.find(s => s.id === staffId) ?? null : null;
    const step = (n: number) => (staffList.length > 0 ? n + 1 : n);

    return (
        <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:p-4">
            <div className="hidden sm:block absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-md bg-white sm:rounded-[28px] sm:shadow-2xl flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <CalendarDays size={16} className="text-slate-900 flex-shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-sm font-black text-slate-900 truncate">Book an appointment</h3>
                            <p className="text-[11px] font-medium text-slate-400 truncate">{productName}{info ? ` · ${info.duration_minutes} min` : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} title="Cancel" className="w-8 h-8 rounded-full border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all flex-shrink-0">
                        <X size={15} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 min-h-0">
                    {infoError ? (
                        <p className="text-sm text-slate-500 text-center py-16">Couldn't load availability. Please close and try again.</p>
                    ) : !info || !view ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Loader2 size={28} className="animate-spin mb-3" />
                            <p className="text-xs font-semibold">Checking availability…</p>
                        </div>
                    ) : (
                        <>
                            {staffList.length > 0 && (
                                <div className="mb-5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">1 · Choose your hairdresser <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span></p>
                                    <div className="flex flex-wrap gap-2">
                                        {[{ id: 'any', name: 'Any available' }, ...staffList].map(s => (
                                            <button key={s.id} type="button" onClick={() => { setStaffId(s.id); setTime(null); }}
                                                className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${staffId === s.id ? 'border-black bg-black text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{step(1)} · Choose a day</p>
                            <div className="flex items-center justify-between mb-3">
                                <button onClick={() => stepMonth(-1)} disabled={viewIdx <= minMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={18} /></button>
                                <span className="text-sm font-bold text-slate-900">{monthLabel}</span>
                                <button onClick={() => stepMonth(1)} disabled={viewIdx >= maxMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={18} /></button>
                            </div>
                            <div className="grid grid-cols-7 mb-1">
                                {WEEKDAYS.map((w, i) => <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{w}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-y-1">
                                {cells.map((d, i) => {
                                    if (!d) return <div key={`b${i}`} />;
                                    const enabled = isDayEnabled(d);
                                    const selected = d === date;
                                    const cls = 'h-10 flex items-center justify-center text-xs transition-colors ' + (selected
                                        ? 'bg-black text-white font-bold rounded-full'
                                        : enabled
                                            ? 'text-slate-800 font-medium hover:bg-slate-100 rounded-full cursor-pointer'
                                            : 'text-slate-300 line-through cursor-not-allowed');
                                    return (
                                        <button key={d} type="button" disabled={!enabled} onClick={() => { setDate(d); setTime(null); }} className={cls}>
                                            {Number(d.slice(8, 10))}
                                        </button>
                                    );
                                })}
                            </div>

                            {date && (
                                <div className="mt-6">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{step(2)} · Choose a time · {prettyDate(date)}{chosenStaff ? ` · ${chosenStaff.name}` : ''}</p>
                                    {slotsLoading ? (
                                        <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
                                    ) : slots.length === 0 ? (
                                        <p className="text-sm text-slate-500 py-4">No free time slots on this day. Please pick another day.</p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2 pb-2">
                                            {slots.map(s => (
                                                <button key={s.start} type="button" onClick={() => setTime(s.start)}
                                                    className={`py-2.5 rounded-xl border text-xs font-bold transition-colors ${time === s.start ? 'bg-black text-white border-black' : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400'}`}>
                                                    {formatSlotTime(s.start)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {date && chosen && depositOptions.length > 0 && (
                                <div className="mt-6">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{step(3)} · How much to pay now</p>
                                    <div className="flex flex-col gap-2">
                                        {[...depositOptions.map(o => ({ v: o as number | null, label: `Pay a K${o.toLocaleString()} deposit`, hint: `K${(fullPrice - o).toLocaleString(undefined, { minimumFractionDigits: 2 })} to pay at the salon` })), { v: null as number | null, label: `Pay in full · K${fullPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, hint: 'Nothing more to pay' }].map(o => (
                                            <button key={String(o.v)} type="button" onClick={() => setDeposit(o.v)}
                                                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${payNow === o.v ? 'border-black bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                                <span className="text-sm font-bold text-slate-900">{o.label}</span>
                                                <span className="text-[11px] font-medium text-slate-500">{o.hint}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-400">A deposit is not refunded if you don&rsquo;t come to your appointment.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="border-t border-slate-200 px-5 py-4 flex items-center gap-3 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        {date && chosen ? (
                            <>
                                <p className="text-sm font-black text-slate-900">{payNow != null ? `K${payNow.toLocaleString(undefined, { minimumFractionDigits: 2 })} deposit` : `K${fullPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</p>
                                <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1 truncate">
                                    <Clock size={11} /> {formatSlotTime(chosen.start)} – {formatSlotTime(chosen.end)}
                                </p>
                            </>
                        ) : (
                            <p className="text-[11px] font-medium text-slate-400">{date ? 'Pick a time slot' : 'Pick a day'}</p>
                        )}
                    </div>
                    <button
                        onClick={() => date && chosen && onConfirm(date, chosen.start, chosen.end, chosenStaff, payNow)}
                        disabled={!date || !chosen}
                        className="flex-shrink-0 bg-black hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2"
                    >
                        <Check size={16} strokeWidth={2.5} />
                        <span>Book slot</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AppointmentPicker;
