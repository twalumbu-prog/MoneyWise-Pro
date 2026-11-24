import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { captureApi, kwacha, type CustomerCapture } from '../capture/captureApi';
import { CaptureReviewCard } from '../capture/CaptureReviewCard';
import { ConversationDrawer } from '../capture/ConversationDrawer';

const LABEL: Record<string, string> = { NEEDS_REVIEW: 'To review', APPROVED: 'Booked', AUTO_POSTED: 'Auto', MERGED: 'Matched', DISMISSED: 'Dismissed', NEW: 'Pending order' };

/** Captured transactions and chats linked to one customer. */
export const CustomerCapturesPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
    const { userRole } = useAuth();
    const [items, setItems] = useState<CustomerCapture[] | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [threadId, setThreadId] = useState<string | null>(null);

    const load = () => captureApi.byCustomer(customerId).then(r => setItems(r.captures)).catch(() => setItems([]));
    useEffect(() => { load(); }, [customerId]);

    if (!items) return <div className="flex items-center justify-center h-24 text-sm text-gray-400">Loading…</div>;
    if (items.length === 0) return <div className="flex items-center justify-center h-24 text-sm text-gray-400">Nothing captured for this customer yet.</div>;

    return (
        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
            {items.map(c => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                    <button onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-brand-navy truncate">{c.evidence_summary || 'Captured transaction'}</div>
                        <div className="text-[11px] text-gray-400">{c.occurred_on ?? ''} · {c.intent === 'ORDER_ONLY' ? 'Pending order' : LABEL[c.status] ?? c.status}</div>
                    </button>
                    <span className="text-sm font-bold text-brand-navy">{kwacha(c.zmw_amount)}</span>
                    {c.conversation_id && (
                        <button onClick={() => setThreadId(c.id)} className="p-1.5 text-[#006AFF]" aria-label="Open conversation"><MessageCircle className="h-4 w-4" /></button>
                    )}
                </div>
            ))}
            {openId && <CaptureReviewCard id={openId} canReview={['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(userRole || '')} onClose={() => setOpenId(null)} onChanged={load} />}
            {threadId && <ConversationDrawer captureId={threadId} onClose={() => setThreadId(null)} />}
        </div>
    );
};
