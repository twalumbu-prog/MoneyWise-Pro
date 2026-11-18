/**
 * Defensive readers for what Composio's Facebook / Instagram / Gmail tools return. Composio wraps the Graph / Gmail
 * payloads in different envelopes depending on the tool and version, so nothing here assumes one shape.
 * (Ported from Kaizen OS convex/lib/socialParse.ts + gmailParse.ts.)
 */

export interface SocialMessage { id: string; text: string; fromId: string; fromName: string; at: number }

const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null;

/** Finds the list inside a tool result: `{data:[…]}`, `{response_data:{data:[…]}}`, `{conversations:[…]}`, or the array itself. */
export function extractList(payload: unknown): Record<string, any>[] {
    if (Array.isArray(payload)) return payload.filter(isObj);
    if (!isObj(payload)) return [];
    for (const key of ['data', 'response_data', 'conversations', 'messages', 'items', 'pages']) {
        const v = payload[key];
        if (Array.isArray(v)) return v.filter(isObj);
        if (isObj(v)) {
            const inner = extractList(v);
            if (inner.length) return inner;
        }
    }
    return [];
}

/** How to recognise our own account: Instagram reports it under an id that differs from the one the API returns, so the username is checked too. */
export interface Own { ids: string[]; username?: string }

const isOwn = (p: Record<string, any>, own: Own) =>
    own.ids.includes(String(p.id)) || (!!own.username && String(p.username ?? p.name ?? '').toLowerCase() === own.username.toLowerCase());

/** The participant of a conversation that is not our own account. */
export function otherParticipant(conv: Record<string, any>, own: Own): { id: string; name: string } | null {
    const people = extractList(conv.participants);
    const other = people.find(p => !isOwn(p, own));
    return other ? { id: String(other.id), name: String(other.name ?? other.username ?? other.id) } : null;
}

/** Inbound (from the contact) text messages of a conversation, oldest first. */
export function inboundMessages(payload: unknown, own: Own): SocialMessage[] {
    return extractList(payload)
        .map(m => {
            const from = isObj(m.from) ? m.from : {};
            const at = Date.parse(String(m.created_time ?? m.createdTime ?? ''));
            return {
                id: String(m.id ?? ''),
                text: typeof m.message === 'string' && m.message ? m.message : m.attachments ? '[attachment]' : '',
                fromId: String(from.id ?? ''),
                fromIsOwn: isOwn(from, own),
                fromName: String(from.name ?? from.username ?? from.id ?? ''),
                at: Number.isFinite(at) ? at : Date.now(),
            };
        })
        .filter(m => m.id && m.text && m.fromId && !m.fromIsOwn)
        .map(({ fromIsOwn: _f, ...m }) => m)
        .sort((a, b) => a.at - b.at);
}

/** The messages array of a GMAIL_FETCH_EMAILS result, plus the next-page token when there is one. */
export function gmailPage(data: any): { messages: Record<string, any>[]; nextPageToken: string | null } {
    const root = isObj(data?.response_data) ? data.response_data : data;
    const messages: Record<string, any>[] = Array.isArray(root?.messages) ? root.messages.filter(isObj) : [];
    const next = root?.nextPageToken ?? data?.nextPageToken ?? null;
    return { messages, nextPageToken: next ? String(next) : null };
}

/** Gmail timestamps arrive as epoch ms (number or digit string) or an ISO / RFC date string. */
export function parseTimestamp(ts: unknown): Date {
    if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts);
    const s = String(ts ?? '').trim();
    if (/^\d{10,}$/.test(s)) return new Date(Number(s));
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : new Date();
}
