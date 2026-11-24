import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { userService } from '../../services/user.service';
import type { MoneyWiseRecipient } from 'core';

const initialsOf = (name: string) => (name || 'M').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const Avatar: React.FC<{ name: string; logoUrl?: string | null; size?: number }> = ({ name, logoUrl, size = 40 }) => {
    const [broken, setBroken] = useState(false);
    if (logoUrl && !broken) {
        return <img src={logoUrl} alt="" onError={() => setBroken(true)} style={{ width: size, height: size }} className="rounded-full bg-[#F8FAFD] object-cover" />;
    }
    return (
        <span
            style={{ width: size, height: size, fontSize: size * 0.38 }}
            className="flex flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#0B57D0]/25 bg-[#E8F0FE] font-bold text-[#0B57D0]"
        >
            {initialsOf(name)}
        </span>
    );
};

/**
 * "MoneyWise" payment destination: search another MoneyWise account (email, @username, phone or MW-ID) and pick a verified recipient.
 * Mirrors the mobile requisition screen (same `userService.searchRecipients`), so a pick pays wallet-to-wallet with no platform fee.
 */
export const MoneyWiseRecipientPicker: React.FC<{
    recipient: MoneyWiseRecipient | null;
    onSelect: (r: MoneyWiseRecipient) => void;
    onClear: () => void;
}> = ({ recipient, onSelect, onClear }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<MoneyWiseRecipient[]>([]);
    const [searching, setSearching] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (recipient) return;
        const q = query.trim();
        if (q.length < 2) { setSuggestions([]); setSearching(false); return; }
        setSearching(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            try { setSuggestions((await userService.searchRecipients(q)) || []); }
            catch { setSuggestions([]); }
            finally { setSearching(false); }
        }, 300);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query, recipient]);

    if (recipient) {
        return (
            <div className="rounded-2xl border border-[#CEEAD6] bg-[#E6F4EA]/40 p-4">
                <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#CEEAD6] px-2.5 py-1 text-[11px] font-bold text-[#137333]"><ShieldCheck size={13} /> Verified MoneyWise Account</span>
                    <button type="button" onClick={() => { setQuery(''); onClear(); }} className="text-sm font-semibold text-[#0B57D0] hover:underline">Change</button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <Avatar name={recipient.name} logoUrl={recipient.logo_url} size={48} />
                    <div className="min-w-0">
                        <p className="truncate text-base font-bold text-[#1F1F1F]">{recipient.name}</p>
                        <p className="truncate text-sm text-[#5F6368]">{recipient.username ? `@${recipient.username}` : (recipient.email || recipient.phone || recipient.moneywise_id)}</p>
                    </div>
                </div>
                <p className="mt-3 border-t border-[#CEEAD6] pt-3 text-xs text-[#137333]">Instant wallet-to-wallet transfer · Zero platform fee</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1" htmlFor="mw-recipient-search">Search Recipient</label>
                <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                    <input
                        id="mw-recipient-search"
                        className="h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-11 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] transition-all"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Email, @username, phone, or MW-ID"
                        autoComplete="off"
                    />
                    {searching ? (
                        <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#0B57D0]" />
                    ) : query ? (
                        <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#80868B] hover:text-[#1F1F1F]"><X size={16} /></button>
                    ) : null}
                </div>
            </div>
            {suggestions.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)]">
                    <p className="bg-[#F8FAFD] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-[#80868B]">Matches on MoneyWise</p>
                    {suggestions.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => { onSelect(r); setSuggestions([]); }}
                            className="flex w-full items-center gap-3 border-t border-[rgba(116,119,117,0.14)] px-4 py-3 text-left hover:bg-[#F8FAFD]"
                        >
                            <Avatar name={r.name} logoUrl={r.logo_url} size={38} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-[#1F1F1F]">{r.name}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.account_type === 'PERSONAL' ? 'bg-[#E8F0FE] text-[#0B57D0]' : 'bg-[#E6F4EA] text-[#137333]'}`}>
                                        {r.account_type === 'PERSONAL' ? 'Personal' : 'Business'}
                                    </span>
                                </span>
                                <span className="block truncate text-xs text-[#5F6368]">{r.username ? `@${r.username}` : (r.email || r.phone)} · {r.organization_name}</span>
                            </span>
                            <ArrowRight size={16} className="text-[#9AA0A6]" />
                        </button>
                    ))}
                </div>
            ) : query.trim().length >= 2 && !searching ? (
                <p className="flex items-center gap-2 rounded-2xl bg-[#F8FAFD] p-4 text-sm text-[#5F6368]"><AlertCircle size={16} /> No MoneyWise account found matching “{query}”</p>
            ) : null}
        </div>
    );
};
