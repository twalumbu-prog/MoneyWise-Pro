/**
 * A tiny event bridge so the send screen can ask for the "money sent" popup and then close itself. The popup lives above the
 * navigation (SendResultHost, in the root layout), so it is still there on the screen the person lands on.
 */
export interface SendResultPayload {
    requisitionId: string;
    amount: number;
    /** Who it went to, for the heading. */
    recipient?: string | null;
}

type Listener = (p: SendResultPayload) => void;
let listener: Listener | null = null;

export function onSendResult(l: Listener): () => void {
    listener = l;
    return () => { if (listener === l) listener = null; };
}

export function showSendResult(p: SendResultPayload): void {
    listener?.(p);
}
