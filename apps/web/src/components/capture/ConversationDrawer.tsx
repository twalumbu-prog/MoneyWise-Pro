import React, { useEffect, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { captureApi, kwacha, type CaptureConversation } from './captureApi';

const LABEL: Record<string, string> = { NEEDS_REVIEW: 'To review', APPROVED: 'Booked', AUTO_POSTED: 'Auto', MERGED: 'Matched', DISMISSED: 'Dismissed', NEW: 'Pending order' };

/** The whole thread behind a capture, plus every capture from it. A reply only goes out when a person taps Send. */
export const ConversationDrawer: React.FC<{ captureId: string; canReply?: boolean; onClose: () => void }> = ({ captureId, canReply, onClose }) => {
    const [c, setC] = useState<CaptureConversation | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);

    const load = () => captureApi.conversation(captureId).then(setC).catch((e: any) => setError(e?.message || 'Could not load the conversation'));
    useEffect(() => { load(); }, [captureId]);

    const windowOpen = !!c?.replyWindowEndsAt && new Date(c.replyWindowEndsAt) > new Date();
    const run = async (fn: () => Promise<void>) => {
        setBusy(true); setError(null);
        try { await fn(); } catch (e: any) { setError(e?.message || 'That did not work'); } finally { setBusy(false); }
    };
    const draft = () => run(async () => setReply((await captureApi.draftReply(captureId)).text));
    const send = () => run(async () => { await captureApi.sendReply(captureId, reply); setReply(''); await load(); });

    return (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
            <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100">
                    <h3 className="text-base font-bold text-brand-navy">Conversation</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5 text-gray-500" /></button>
                </div>
                {error && <div className="m-5 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
                {!c && !error && <div className="p-16 text-center text-sm text-gray-400">Loading…</div>}
                {c && (
                    <div className="p-5 space-y-4">
                        {c.captures.length > 0 && (
                            <div className="space-y-1.5">
                                {c.captures.map(k => (
                                    <div key={k.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-xs">
                                        <span className="font-semibold text-brand-navy">{kwacha(k.zmw_amount)}</span>
                                        <span className="text-gray-500">{k.intent === 'ORDER_ONLY' ? 'Pending order' : LABEL[k.status] ?? k.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            {c.messages.map(m => (
                                <div key={m.id} className={`max-w-[85%] w-fit rounded-xl px-3 py-1.5 text-sm ${m.direction === 'OUT' ? 'ml-auto bg-[#CFE4FF]' : 'bg-gray-50 border border-gray-100'}`}>
                                    {m.body || `[${m.message_type}]`}
                                    <div className="mt-0.5 text-[10px] text-gray-400">{new Date(m.sent_at).toLocaleString('en-ZM', { dateStyle: 'short', timeStyle: 'short' })}</div>
                                </div>
                            ))}
                        </div>
                        {canReply && c.repliesEnabled && (
                            <div className="space-y-2 border-t border-gray-100 pt-3">
                                {windowOpen ? (<>
                                    <p className="text-[11px] text-gray-500">You can reply until {new Date(c.replyWindowEndsAt as string).toLocaleString('en-ZM', { dateStyle: 'short', timeStyle: 'short' })}.</p>
                                    <textarea rows={3} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} aria-label="Reply"
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006AFF]/30" />
                                    <div className="flex justify-end gap-2">
                                        <button disabled={busy} onClick={draft} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> Draft</button>
                                        <button disabled={busy || !reply.trim()} onClick={send} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#006AFF] text-white disabled:opacity-40"><Send className="h-3.5 w-3.5" /> Send</button>
                                    </div>
                                </>) : <p className="text-xs text-gray-500">The 24-hour reply window has closed. You can reply after the customer messages again.</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
