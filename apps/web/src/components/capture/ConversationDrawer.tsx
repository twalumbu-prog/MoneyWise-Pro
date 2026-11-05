import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { captureApi, kwacha, type CaptureConversation } from './captureApi';

const LABEL: Record<string, string> = { NEEDS_REVIEW: 'To review', APPROVED: 'Booked', AUTO_POSTED: 'Auto', MERGED: 'Matched', DISMISSED: 'Dismissed', NEW: 'Pending order' };

/** The whole thread behind a capture, plus every capture from it. Read-only for now; replies arrive in Phase 2. */
export const ConversationDrawer: React.FC<{ captureId: string; onClose: () => void }> = ({ captureId, onClose }) => {
    const [c, setC] = useState<CaptureConversation | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        captureApi.conversation(captureId).then(setC).catch((e: any) => setError(e?.message || 'Could not load the conversation'));
    }, [captureId]);

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
                    </div>
                )}
            </div>
        </div>
    );
};
