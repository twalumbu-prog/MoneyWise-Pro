import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, CalendarDays, Check } from 'lucide-react';
import { BookingRange } from '../services/product.service';

interface BookingCalendarProps {
    productName: string;
    nightlyPrice: number;
    /** Confirmed (paid) stays — their nights are greyed out. Half-open [check_in, check_out). */
    unavailable: BookingRange[];
    loading?: boolean;
    initial?: { checkIn: string; checkOut: string } | null;
    onClose: () => void;
    onConfirm: (checkIn: string, checkOut: string, nights: number, total: number) => void;
    /**
     * Allow selecting a check-in date before today. Used by the internal New Sale
     * flow so a cashier can log a walk-in/cash booking retrospectively (e.g. at
     * close of day). The public portal never passes this — customers can only ever
     * book forward. Double-booking is still prevented by the `unavailable` set
     * regardless of this flag.
     */
    allowPast?: boolean;
}

// --- Timezone-stable date helpers (operate on 'YYYY-MM-DD' strings) -----------
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const todayStr = () => {
    const d = new Date();
    return fmt(d.getFullYear(), d.getMonth(), d.getDate());
};
const addDays = (s: string, n: number) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return fmt(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};
const nightsBetween = (a: string, b: string) => {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const prettyDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', timeZone: 'UTC'
    });
};

const MAX_NIGHTS = 90;          // cap a single stay
const MONTHS_AHEAD = 18;        // how far forward you can browse
const MONTHS_BACK = 12;         // how far back you can browse when allowPast is set
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const BookingCalendar: React.FC<BookingCalendarProps> = ({
    productName, nightlyPrice, unavailable, loading, initial, onClose, onConfirm, allowPast = false
}) => {
    const today = todayStr();
    const [checkIn, setCheckIn] = useState<string | null>(initial?.checkIn || null);
    const [checkOut, setCheckOut] = useState<string | null>(initial?.checkOut || null);

    const startMonth = useMemo(() => {
        const base = (checkIn && checkIn >= today) ? checkIn : today;
        const [y, m] = base.split('-').map(Number);
        return { y, m0: m - 1 };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const [view, setView] = useState(startMonth);

    // Set of occupied nights across all confirmed stays.
    const blocked = useMemo(() => {
        const s = new Set<string>();
        for (const r of unavailable || []) {
            let d = r.check_in;
            let guard = 0;
            while (d < r.check_out && guard < 3650) { s.add(d); d = addDays(d, 1); guard++; }
        }
        return s;
    }, [unavailable]);

    // First blocked night at/after check-in+1 (allowed as a turnover checkout), else the max-stay cap.
    const maxCheckout = (ci: string) => {
        let d = addDays(ci, 1);
        for (let i = 0; i < MAX_NIGHTS; i++) {
            if (blocked.has(d)) return d;
            d = addDays(d, 1);
        }
        return d;
    };

    const selectingCheckout = !!checkIn && !checkOut;
    const maxCo = selectingCheckout ? maxCheckout(checkIn!) : null;

    const isEnabled = (d: string): boolean => {
        if (d < today && !allowPast) return false;
        if (selectingCheckout) {
            if (d > checkIn! && maxCo && d <= maxCo) return true;   // checkout candidate (incl. turnover day)
            if (d < checkIn! && !blocked.has(d)) return true;       // click earlier free night → restart
            return false;
        }
        return !blocked.has(d);                                     // choosing check-in: any free night
    };

    const handleClick = (d: string) => {
        if (!isEnabled(d)) return;
        if (selectingCheckout) {
            if (d > checkIn!) setCheckOut(d);
            else { setCheckIn(d); setCheckOut(null); }
        } else {
            setCheckIn(d);
            setCheckOut(null);
        }
    };

    const reset = () => { setCheckIn(null); setCheckOut(null); };

    const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
    const total = nights * nightlyPrice;

    // Build the visible month grid (leading blanks for the first weekday).
    const cells = useMemo(() => {
        const first = new Date(Date.UTC(view.y, view.m0, 1));
        const leading = first.getUTCDay();
        const daysInMonth = new Date(Date.UTC(view.y, view.m0 + 1, 0)).getUTCDate();
        const arr: (string | null)[] = [];
        for (let i = 0; i < leading; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push(fmt(view.y, view.m0, d));
        return arr;
    }, [view]);

    const monthLabel = new Date(Date.UTC(view.y, view.m0, 1)).toLocaleDateString(undefined, {
        month: 'long', year: 'numeric', timeZone: 'UTC'
    });

    const minView = (() => {
        if (!allowPast) {
            const [y, m] = today.split('-').map(Number);
            return { y, m0: m - 1 };
        }
        const [y, m] = today.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1 - MONTHS_BACK, 1));
        return { y: dt.getUTCFullYear(), m0: dt.getUTCMonth() };
    })();
    const atFloor = view.y === minView.y && view.m0 === minView.m0;
    const maxView = (() => {
        const [y, m] = today.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1 + MONTHS_AHEAD, 1));
        return { y: dt.getUTCFullYear(), m0: dt.getUTCMonth() };
    })();
    const atCeil = view.y === maxView.y && view.m0 === maxView.m0;

    const stepMonth = (delta: number) => {
        const dt = new Date(Date.UTC(view.y, view.m0 + delta, 1));
        setView({ y: dt.getUTCFullYear(), m0: dt.getUTCMonth() });
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:p-4">
            <div className="hidden sm:block absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-md bg-white sm:rounded-[28px] sm:shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <CalendarDays size={16} className="text-slate-900 flex-shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-sm font-black text-slate-900 truncate">Select dates</h3>
                            <p className="text-[11px] font-medium text-slate-400 truncate">{productName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all flex-shrink-0"
                        title="Cancel"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Selected summary chips */}
                <div className="px-5 pt-4 flex items-center gap-2 flex-shrink-0">
                    <div className={`flex-1 rounded-xl border px-3 py-2 ${checkIn ? 'border-slate-900' : 'border-slate-200'}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Check-in</p>
                        <p className="text-xs font-bold text-slate-900">{checkIn ? prettyDate(checkIn) : 'Add date'}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                    <div className={`flex-1 rounded-xl border px-3 py-2 ${checkOut ? 'border-slate-900' : 'border-slate-200'}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Check-out</p>
                        <p className="text-xs font-bold text-slate-900">{checkOut ? prettyDate(checkOut) : 'Add date'}</p>
                    </div>
                </div>

                {/* Calendar body */}
                <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2 min-h-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Loader2 size={28} className="animate-spin mb-3" />
                            <p className="text-xs font-semibold">Checking availability…</p>
                        </div>
                    ) : (
                        <>
                            {/* Month nav */}
                            <div className="flex items-center justify-between mb-3">
                                <button
                                    onClick={() => stepMonth(-1)}
                                    disabled={atFloor}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="text-sm font-bold text-slate-900">{monthLabel}</span>
                                <button
                                    onClick={() => stepMonth(1)}
                                    disabled={atCeil}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {/* Weekday header */}
                            <div className="grid grid-cols-7 mb-1">
                                {WEEKDAYS.map(w => (
                                    <div key={w} className="text-center text-[10px] font-bold text-slate-400 py-1">{w}</div>
                                ))}
                            </div>

                            {/* Day grid */}
                            <div className="grid grid-cols-7 gap-y-1">
                                {cells.map((d, i) => {
                                    if (!d) return <div key={`b${i}`} />;
                                    const dayNum = Number(d.slice(8, 10));
                                    const enabled = isEnabled(d);
                                    const isCI = d === checkIn;
                                    const isCO = d === checkOut;
                                    const inRange = !!(checkIn && checkOut && d > checkIn && d < checkOut);

                                    let cls = 'relative h-10 flex items-center justify-center text-xs transition-colors ';
                                    if (isCI || isCO) {
                                        cls += 'bg-black text-white font-bold rounded-full';
                                    } else if (inRange) {
                                        cls += 'bg-slate-100 text-slate-900 font-semibold';
                                    } else if (enabled) {
                                        cls += 'text-slate-800 font-medium hover:bg-slate-100 rounded-full cursor-pointer';
                                    } else {
                                        cls += 'text-slate-300 line-through cursor-not-allowed';
                                    }

                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            disabled={!enabled}
                                            onClick={() => handleClick(d)}
                                            className={cls}
                                        >
                                            {dayNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-4 mt-4 px-1 text-[10px] font-medium text-slate-400">
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-black inline-block" /> Selected</span>
                                <span className="flex items-center gap-1.5"><span className="line-through">12</span> Unavailable</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-5 py-4 flex items-center gap-3 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        {nights > 0 ? (
                            <>
                                <p className="text-sm font-black text-slate-900">
                                    K{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-[11px] font-medium text-slate-400">
                                    {nights} night{nights === 1 ? '' : 's'} · K{nightlyPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}/night
                                    {(checkIn || checkOut) && (
                                        <button onClick={reset} className="ml-2 text-slate-400 hover:text-rose-500 underline">clear</button>
                                    )}
                                </p>
                            </>
                        ) : (
                            <p className="text-[11px] font-medium text-slate-400">
                                {selectingCheckout ? 'Pick your check-out date' : 'Pick your check-in date'}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => checkIn && checkOut && onConfirm(checkIn, checkOut, nights, total)}
                        disabled={!checkIn || !checkOut}
                        className="flex-shrink-0 bg-black hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2"
                    >
                        <Check size={16} strokeWidth={2.5} />
                        <span>Reserve</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BookingCalendar;
