import type { CashbookEntry } from 'core';

/** Posting text the system writes for requisition payouts — it says how the money moved, not what it was for. */
const GENERIC = /disburse(d|ment)? for req|requisition #/i;

/**
 * What a ledger row should be called. Entries tied to a requisition read "MONEYWISE_WALLET disbursed for Requisition #92a99532",
 * which is a code, not a purpose; show what the requester wrote instead (the requisition's description, or its line items).
 * Everything else keeps its own description.
 */
export function entryLabel(entry: CashbookEntry): string {
    // Deposits awaiting Lenco are stored as "PENDING_INTENT: <purpose> | Ref: <ref>"; show just the purpose.
    const own = (entry.description || '').replace(/^PENDING_INTENT:\s*/i, '').replace(/\s*\|\s*Ref:.*$/i, '') || entry.description || '';
    if (!GENERIC.test(own)) return own;

    const req = entry.requisitions;
    const itemNames = Array.from(new Set((req?.line_items ?? []).map((li) => (li.description || '').trim()).filter(Boolean)));
    const reqDesc = (req?.description || '').trim();
    // A single-purpose request reads best as its own description; with several items the description is usually the umbrella.
    return reqDesc || itemNames.join(' · ') || own;
}
