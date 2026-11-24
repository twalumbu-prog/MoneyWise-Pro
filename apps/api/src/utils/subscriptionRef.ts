/**
 * Subscription wallet payments go to Blue Opus as on-us Lenco transfers. Lenco returns no reference for those,
 * so the PG-SUB-… reference travels in the narration and the sync recovers it from there to dedup against the
 * debit billing already booked. Both sides live here so a change to one can't silently break the other.
 */
const NARRATION_MAX = 60; // Lenco narration limit

export function buildSubNarration(invoiceNumber: string, reference: string): string {
    // Reference goes FIRST-class: truncate the invoice number, never the reference the sync depends on.
    const tail = ` ${reference}`;
    const head = `Subscription ${invoiceNumber}`.slice(0, Math.max(0, NARRATION_MAX - tail.length));
    return `${head}${tail}`;
}

export function extractSubRef(narration: string): string {
    return narration.match(/PG-SUB-\d+-[A-Za-z0-9]+/i)?.[0] || '';
}
