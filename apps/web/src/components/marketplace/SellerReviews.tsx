import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CornerDownRight, Star, Trash2 } from 'lucide-react';
import { apiJson } from 'core';
import { ErrorNote, PrimaryButton } from '../ui/Dialog';
import { LISTINGS_KEY, Stars } from './parts';

interface ReviewsResponse {
    summary: { average: number; count: number; distribution: number[] };
    reviews: { id: string; name: string; rating: number; comment: string | null; verifiedPurchase: boolean; at: string; mine: boolean; reply: string | null; repliedAt: string | null }[];
    mine: { rating: number; comment: string | null } | null;
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** A clickable five-star input that also works with the keyboard (arrow keys change it). */
const StarInput: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    return (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    onClick={() => onChange(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onKeyDown={(e) => { if (e.key === 'ArrowRight') onChange(Math.min(5, (value || 0) + 1)); if (e.key === 'ArrowLeft') onChange(Math.max(1, (value || 2) - 1)); }}
                    className="p-0.5"
                >
                    <Star size={28} className={n <= shown ? 'fill-[#FBBC04] text-[#FBBC04]' : 'text-[#DADCE0]'} />
                </button>
            ))}
            <span className="ml-2 text-sm font-medium text-[#5F6368]">{WORDS[shown]}</span>
        </div>
    );
};

/** The seller's answer to a review: shown to everyone, and written or changed by the seller. */
const SellerReply: React.FC<{ reviewId: string; reply: string | null; repliedAt: string | null; sellerName: string; canReply: boolean; onSaved: () => void }> = ({ reviewId, reply, repliedAt, sellerName, canReply, onSaved }) => {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(reply ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { setText(reply ?? ''); }, [reply]);

    const save = async (value: string) => {
        setBusy(true); setError(null);
        try { await apiJson(`/marketplace/reviews/${reviewId}/reply`, { method: 'POST', body: JSON.stringify({ reply: value }) }); setEditing(false); onSaved(); }
        catch (e: any) { setError(e?.message || 'Couldn’t save the reply.'); }
        finally { setBusy(false); }
    };

    if (editing) {
        return (
            <div className="mt-3 rounded-xl bg-[#F8FAFD] p-3">
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Your reply" placeholder="Thank them, or say how you’ll put it right" className="w-full rounded-xl border border-[#C4C7C5] bg-white px-3 py-2 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" />
                <ErrorNote text={error} />
                <div className="mt-2 flex items-center gap-3">
                    <PrimaryButton onClick={() => save(text)} busy={busy} disabled={!text.trim()} className="h-9 px-5 text-sm">Post reply</PrimaryButton>
                    <button type="button" onClick={() => { setEditing(false); setText(reply ?? ''); }} className="text-sm font-semibold text-[#5F6368] hover:underline">Cancel</button>
                </div>
            </div>
        );
    }
    return (
        <>
            {reply && (
                <div className="mt-3 rounded-xl bg-[#F8FAFD] p-3 text-sm">
                    <p className="flex items-center gap-2 text-xs font-bold text-[#1F1F1F]"><CornerDownRight size={13} className="text-[#0B57D0]" /> Reply from {sellerName}{repliedAt && <span className="font-normal text-[#80868B]">{new Date(repliedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</p>
                    <p className="mt-1 whitespace-pre-line leading-relaxed text-[#3C4043]">{reply}</p>
                </div>
            )}
            {canReply && (
                <div className="mt-2 flex items-center gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => setEditing(true)} className="text-[#0B57D0] hover:underline">{reply ? 'Edit reply' : 'Reply'}</button>
                    {reply && <button type="button" onClick={() => save('')} className="text-[#B31412] hover:underline">Delete reply</button>}
                </div>
            )}
        </>
    );
};

/** The seller's star rating and reviews, and a form to leave one. A review is tagged "Verified purchase" when it matches a completed order. */
export const SellerReviews: React.FC<{ sellerId: string; sellerName: string; isMine: boolean }> = ({ sellerId, sellerName, isMine }) => {
    const qc = useQueryClient();
    const { data, isPending } = useQuery({
        queryKey: ['marketplace', 'reviews', sellerId],
        queryFn: () => apiJson<ReviewsResponse>(`/marketplace/sellers/${sellerId}/reviews`),
        staleTime: 30_000,
    });

    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data?.mine) { setRating(data.mine.rating); setComment(data.mine.comment ?? ''); }
    }, [data?.mine?.rating, data?.mine?.comment]); // eslint-disable-line react-hooks/exhaustive-deps

    const refresh = () => Promise.all([
        qc.invalidateQueries({ queryKey: ['marketplace', 'reviews', sellerId] }),
        qc.invalidateQueries({ queryKey: LISTINGS_KEY }),
    ]);

    const submit = async () => {
        if (!rating) { setError('Choose a star rating.'); return; }
        setBusy(true); setError(null); setSaved(false);
        try {
            await apiJson(`/marketplace/sellers/${sellerId}/reviews`, { method: 'POST', body: JSON.stringify({ rating, comment }) });
            await refresh();
            setSaved(true);
        } catch (e: any) {
            setError(e?.message || 'Your review couldn’t be saved.');
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true); setError(null);
        try { await apiJson(`/marketplace/sellers/${sellerId}/reviews`, { method: 'DELETE' }); setRating(0); setComment(''); await refresh(); }
        catch (e: any) { setError(e?.message || 'Couldn’t remove your review.'); }
        finally { setBusy(false); }
    };

    const s = data?.summary;
    const max = Math.max(1, ...(s?.distribution ?? [0]));

    return (
        <section className="mt-6 rounded-2xl border border-[rgba(116,119,117,0.22)] p-6">
            <h2 className="text-lg font-bold text-[#1F1F1F]">Reviews of {sellerName}</h2>

            {isPending ? <p className="mt-3 text-sm text-[#80868B]">Loading…</p> : (
                <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[260px_1fr]">
                    <div>
                        {s && s.count > 0 ? (
                            <>
                                <p className="text-5xl font-bold tabular-nums text-[#1F1F1F]">{s.average.toFixed(1)}</p>
                                <Stars value={s.average} size={18} className="mt-1" />
                                <p className="mt-1 text-sm text-[#5F6368]">{s.count} {s.count === 1 ? 'review' : 'reviews'}</p>
                                <ul className="mt-4 space-y-1.5">
                                    {[5, 4, 3, 2, 1].map((n) => (
                                        <li key={n} className="flex items-center gap-2 text-xs text-[#5F6368]">
                                            <span className="w-3 tabular-nums">{n}</span>
                                            <Star size={11} className="fill-[#FBBC04] text-[#FBBC04]" />
                                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E9EEF6]"><span className="block h-full rounded-full bg-[#FBBC04]" style={{ width: `${(s.distribution[n - 1] / max) * 100}%` }} /></span>
                                            <span className="w-5 text-right tabular-nums">{s.distribution[n - 1]}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : <p className="text-sm text-[#5F6368]">No reviews yet.</p>}
                    </div>

                    <div>
                        {!isMine && (
                            <div className="mb-6 rounded-2xl bg-[#F8FAFD] p-4">
                                <p className="mb-2 text-sm font-bold text-[#1F1F1F]">{data?.mine ? 'Your review' : 'Rate this seller'}</p>
                                <StarInput value={rating} onChange={(n) => { setRating(n); setError(null); setSaved(false); }} />
                                <textarea
                                    rows={3}
                                    value={comment}
                                    onChange={(e) => { setComment(e.target.value); setSaved(false); }}
                                    maxLength={1000}
                                    placeholder="Tell others how it went (optional)"
                                    aria-label="Your review"
                                    className="mt-3 w-full rounded-xl border border-[#C4C7C5] bg-white px-4 py-3 text-sm placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]"
                                />
                                <ErrorNote text={error} />
                                <div className="mt-3 flex items-center gap-3">
                                    <PrimaryButton onClick={submit} busy={busy} className="h-10 px-6">{data?.mine ? 'Update review' : 'Post review'}</PrimaryButton>
                                    {data?.mine && <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B31412] hover:underline"><Trash2 size={14} /> Delete</button>}
                                    {saved && <span role="status" className="text-sm font-semibold text-[#137333]">Saved</span>}
                                </div>
                            </div>
                        )}

                        {data && data.reviews.length > 0 ? (
                            <ul className="divide-y divide-[rgba(116,119,117,0.14)]">
                                {data.reviews.map((r) => (
                                    <li key={r.id} className="py-4 first:pt-0">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <Stars value={r.rating} size={14} />
                                            <span className="text-sm font-semibold text-[#1F1F1F]">{r.mine ? 'You' : r.name}</span>
                                            {r.verifiedPurchase && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#137333]"><BadgeCheck size={13} /> Verified purchase</span>}
                                            <span className="text-xs text-[#80868B]">{new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                        {r.comment && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[#3C4043]">{r.comment}</p>}
                                        <SellerReply reviewId={r.id} reply={r.reply} repliedAt={r.repliedAt} sellerName={sellerName} canReply={isMine} onSaved={() => qc.invalidateQueries({ queryKey: ['marketplace', 'reviews', sellerId] })} />
                                    </li>
                                ))}
                            </ul>
                        ) : isMine ? <p className="text-sm text-[#5F6368]">Buyers’ reviews of your store will show here.</p> : null}
                    </div>
                </div>
            )}
        </section>
    );
};
