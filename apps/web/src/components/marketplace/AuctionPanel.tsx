import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Clock, Gavel, ShieldAlert, Trophy } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../ui/Dialog';
import { LISTINGS_KEY, timeLeft, useNow } from './parts';
import type { Listing } from './parts';

const PHONE_KEY = 'mw:bid-phone';
const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } };
const savePhone = (v: string) => { try { localStorage.setItem(PHONE_KEY, v); } catch { /* storage unavailable */ } };

interface BidsResponse { bids: { bidder: string; amount: number; at: string }[]; paymentLinkToken: string | null }

/**
 * Everything about an item on auction: the current bid, the clock, a bid box, Buy it now, who has bid, and, once it ends, what happens next
 * (the winner pays through a one-time link at the winning price). The seller sees the same panel with the controls that apply to them.
 */
export const AuctionPanel: React.FC<{ listing: Listing }> = ({ listing }) => {
    const a = listing.auction!;
    const navigate = useNavigate();
    const qc = useQueryClient();
    const open = a.status === 'OPEN';
    const now = useNow(a.serverNow, open);
    const left = timeLeft(a.endsAt, now);
    const ended = open && new Date(a.endsAt).getTime() <= now;

    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState(readPhone);
    const [busy, setBusy] = useState<'bid' | 'buy' | 'cancel' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmBuy, setConfirmBuy] = useState(false);
    const [showBids, setShowBids] = useState(false);

    // The suggested bid is always the lowest allowed one, and moves up when someone outbids.
    useEffect(() => { setAmount(String(a.minNextBid)); }, [a.minNextBid, a.id]);

    const refresh = () => qc.invalidateQueries({ queryKey: LISTINGS_KEY });
    const { data: history } = useQuery({
        queryKey: ['marketplace', 'bids', a.id],
        queryFn: () => apiJson<BidsResponse>(`/marketplace/auctions/${a.id}/bids`),
        enabled: showBids || a.status === 'SOLD',
        refetchInterval: showBids && open ? 8000 : false,
    });

    // Bids from other people show up without a reload while the page is open.
    useEffect(() => {
        if (!open) return;
        const id = window.setInterval(refresh, 15000);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const place = async () => {
        const value = Number(amount);
        if (!(value >= a.minNextBid)) { setError(`Your bid must be at least ${formatKwacha(a.minNextBid)}.`); return; }
        if (!phone.trim()) { setError('Enter your mobile money number: the winner pays with it.'); return; }
        setBusy('bid'); setError(null);
        try {
            await apiJson(`/marketplace/auctions/${a.id}/bids`, { method: 'POST', body: JSON.stringify({ amount: value, phone }) });
            savePhone(phone);
            await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['marketplace', 'bids', a.id] })]);
        } catch (e: any) {
            setError(e?.message || 'Your bid couldn’t be placed.');
            refresh();
        } finally {
            setBusy(null);
        }
    };

    const buyNow = async () => {
        if (!phone.trim()) { setError('Enter your mobile money number first.'); setConfirmBuy(false); return; }
        setBusy('buy'); setError(null);
        try {
            const r = await apiJson<{ paymentLinkToken: string | null }>(`/marketplace/auctions/${a.id}/buy-now`, { method: 'POST', body: JSON.stringify({ phone }) });
            savePhone(phone);
            await refresh();
            setConfirmBuy(false);
            if (listing.inAppCheckout) navigate(`/marketplace/checkout/${listing.id}?auction=${a.id}`);
            else if (r.paymentLinkToken) navigate(`/pl/${r.paymentLinkToken}`);
        } catch (e: any) {
            setError(e?.message || 'Buy it now didn’t go through.');
            setConfirmBuy(false);
            refresh();
        } finally {
            setBusy(null);
        }
    };

    const cancel = async () => {
        setBusy('cancel'); setError(null);
        try { await apiJson(`/marketplace/auctions/${a.id}/cancel`, { method: 'POST' }); await refresh(); }
        catch (e: any) { setError(e?.message || 'Couldn’t cancel the auction.'); }
        finally { setBusy(null); }
    };

    const token = a.paymentLinkToken ?? history?.paymentLinkToken ?? null;

    /* ── Finished ── */
    if (a.status === 'SOLD' || ended) {
        const sold = a.status === 'SOLD';
        return (
            <section className="mt-5 rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Gavel size={16} /> {sold ? 'This auction has ended' : 'Auction ending…'}</p>
                {sold && <p className="mt-2 text-sm text-[#3C4043]">Winning bid <span className="font-bold tabular-nums">{formatKwacha(a.winningAmount ?? 0)}</span></p>}
                {a.iWon && (
                    <div className="mt-3 rounded-xl bg-[#E6F4EA] p-4 text-sm text-[#137333]">
                        <p className="flex items-center gap-2 font-bold"><Trophy size={16} /> You won this item</p>
                        <p className="mt-1">Pay {formatKwacha(a.winningAmount ?? 0)} to {listing.seller.name} to complete the purchase.</p>
                        {listing.inAppCheckout
                            ? <><PrimaryButton onClick={() => navigate(`/marketplace/checkout/${listing.id}?auction=${a.id}`)} className="mt-3 h-11 w-full">Pay with MoneyWise wallet</PrimaryButton>{token && <button type="button" onClick={() => navigate(`/pl/${token}`)} className="mt-2 w-full text-center text-xs font-semibold underline">Pay another way</button>}</>
                            : token ? <PrimaryButton onClick={() => navigate(`/pl/${token}`)} className="mt-3 h-11 w-full">Pay now</PrimaryButton> : <p className="mt-2 text-xs">Your payment link is being prepared. Refresh in a moment.</p>}
                    </div>
                )}
                {listing.isMine && sold && (
                    <div className="mt-3 rounded-xl bg-[#E8F0FE] p-4 text-sm text-[#1967D2]">
                        <p className="font-bold">Sold. The winner has been given a payment link.</p>
                        {token && <p className="mt-1 break-all text-xs">Link: {window.location.origin}/pl/{token}</p>}
                    </div>
                )}
                {!sold && <p className="mt-2 text-sm text-[#5F6368]">The result will show in a moment.</p>}
            </section>
        );
    }

    /* ── Open ── */
    const urgent = new Date(a.endsAt).getTime() - now < 3_600_000;
    return (
        <section className="mt-5 rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#5F6368]">{a.currentBid === null ? 'Starting bid' : 'Current bid'}</p>
                    <p className="text-3xl font-bold tabular-nums text-[#1F1F1F]">{formatKwacha(a.currentBid ?? a.startPrice)}</p>
                    <button type="button" onClick={() => setShowBids((v) => !v)} aria-expanded={showBids} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[#0B57D0] hover:underline">
                        {a.bidCount} {a.bidCount === 1 ? 'bid' : 'bids'} <ChevronDown size={12} className={showBids ? 'rotate-180' : ''} />
                    </button>
                </div>
                <div className={`rounded-xl px-3 py-2 text-right ${urgent ? 'bg-[#FCE8E6] text-[#B31412]' : 'bg-[#F1F3F4] text-[#1F1F1F]'}`}>
                    <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider"><Clock size={11} /> Time left</p>
                    <p className="text-lg font-bold tabular-nums">{left}</p>
                </div>
            </div>

            <p className="mt-2 text-xs text-[#5F6368]">
                Ends {new Date(a.endsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {a.hasReserve && (a.reserveMet ? ' · Reserve met' : ' · Reserve not met')}
            </p>

            {a.iAmHighBidder && <p className="mt-3 rounded-xl bg-[#E6F4EA] px-3 py-2 text-sm font-semibold text-[#137333]">You’re the highest bidder.</p>}
            {a.iHaveBid && !a.iAmHighBidder && <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#FEF7E0] px-3 py-2 text-sm font-semibold text-[#B06000]"><ShieldAlert size={15} /> You’ve been outbid.</p>}

            <ErrorNote text={error} />

            {listing.isMine ? (
                <div className="mt-4">
                    <p className="text-xs text-[#5F6368]">This is your auction. Bidders can’t be edited or removed once the bidding starts.</p>
                    {a.bidCount === 0 && <TonalButton onClick={cancel} disabled={busy === 'cancel'} className="mt-3">{busy === 'cancel' ? 'Cancelling…' : 'Cancel auction'}</TonalButton>}
                </div>
            ) : (
                <div className="mt-4 flex flex-col gap-3">
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                        <div>
                            <label className={labelClass} htmlFor="bid-amount">Your bid (K)</label>
                            <input id="bid-amount" className={`${fieldClass} font-bold tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setError(null); }} />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="bid-phone">Your mobile money no.</label>
                            <input id="bid-phone" className={fieldClass} inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="0971234567" />
                        </div>
                    </div>
                    <p className="-mt-1 text-xs text-[#80868B]">Enter {formatKwacha(a.minNextBid)} or more. If you win, you pay with this number through a one-time link.</p>
                    <PrimaryButton onClick={place} busy={busy === 'bid'} className="h-12 text-base"><Gavel size={17} /> Place bid</PrimaryButton>
                    {a.buyNowPrice && (
                        <button type="button" onClick={() => setConfirmBuy(true)} className="inline-flex h-12 items-center justify-center rounded-full text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]">
                            Buy it now for {formatKwacha(a.buyNowPrice)}
                        </button>
                    )}
                </div>
            )}

            {showBids && (
                <div className="mt-4 border-t border-[rgba(116,119,117,0.14)] pt-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5F6368]">Bid history</p>
                    {!history ? <p className="text-sm text-[#80868B]">Loading…</p> : history.bids.length === 0 ? <p className="text-sm text-[#80868B]">No bids yet. Be the first.</p> : (
                        <ul className="divide-y divide-[rgba(116,119,117,0.12)]">
                            {history.bids.map((b, i) => (
                                <li key={`${b.at}-${i}`} className="flex items-center justify-between py-2 text-sm">
                                    <span className={i === 0 ? 'font-bold text-[#1F1F1F]' : 'text-[#3C4043]'}>{b.bidder}{i === 0 ? ' · Highest' : ''}</span>
                                    <span className="tabular-nums">
                                        <span className="font-semibold">{formatKwacha(b.amount)}</span>
                                        <span className="ml-2 text-xs text-[#80868B]">{new Date(b.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <Dialog open={confirmBuy} title="Buy it now?" onClose={() => setConfirmBuy(false)}>
                <p className="mb-5 text-sm text-[#3C4043]">This ends the auction right away. You’ll pay <span className="font-bold">{formatKwacha(a.buyNowPrice ?? 0)}</span> to {listing.seller.name} on the next screen.</p>
                <div className="flex gap-3">
                    <TonalButton onClick={() => setConfirmBuy(false)} className="h-12 flex-1">Cancel</TonalButton>
                    <PrimaryButton busy={busy === 'buy'} onClick={buyNow} className="flex-1">Buy it now</PrimaryButton>
                </div>
            </Dialog>
        </section>
    );
};
