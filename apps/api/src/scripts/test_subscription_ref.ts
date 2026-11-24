/** Regression: wallet subscription payment must be recognisable by the Lenco sync (12 Oct 2026 duplicate). Run: npm run test:subref */
import assert from 'assert';
import { buildSubNarration, extractSubRef } from '../utils/subscriptionRef';

const cases = [
    ['INV-202607-E359C8', 'PG-SUB-1791790745013-519475'],
    ['INV-202609-E359C8', 'PG-SUB-1793268720976-ea8423'],
    ['INV-2026100001-LONGORG-E359C8', 'PG-SUB-1795416677552-54b2a2'], // longer invoice number must not eat the reference
];
for (const [inv, ref] of cases) {
    const n = buildSubNarration(inv, ref);
    assert(n.length <= 60, `narration over 60 chars: ${n}`);
    assert.strictEqual(extractSubRef(n), ref, `sync cannot recover reference from: ${n}`);
    // As Lenco returns it, with the transaction number appended.
    assert.strictEqual(extractSubRef(`${n} / 2628504713`), ref);
}
assert.strictEqual(extractSubRef('Loan to Blue Oplus / 2632108952'), '');
console.log('subscription ref tests passed');
