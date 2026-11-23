/**
 * Offline checks: the latest recorded message's balance wins, and category ranking (no database).
 * Run: TS_NODE_PROJECT=./tsconfig.json npx ts-node --transpile-only src/scripts/test_momo_balance.ts
 * (needs dummy SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY so the imports load).
 */
import assert from 'assert';
import { latestBalanceTarget, buildSuggestions, type RecordedCapture } from '../services/momoCapture/momoCapture.service';

let failed = 0;
const test = (name: string, fn: () => void) => {
    try { fn(); console.log(`✓ ${name}`); } catch (e: any) { failed++; console.log(`✗ ${name}\n    ${e.message}`); }
};
const cap = (occurred_at: string, direction: 'IN' | 'OUT', amount: number, balance_after: number | null, fee: number | null = null): RecordedCapture =>
    ({ occurred_at, direction, amount, fee, balance_after });

test('nothing recorded states a balance: leave the booked total alone', () => assert.strictEqual(latestBalanceTarget([cap('2026-11-20T10:00:00Z', 'IN', 40, null)]), null));
test('sent K50, "your bal is K30": the account becomes K30', () => {
    assert.deepStrictEqual(latestBalanceTarget([cap('2026-11-20T10:00:00Z', 'OUT', 50, 30)]), { balance: 30, asOf: '2026-11-20T10:00:00Z' });
});
test('the newest message by its own time wins, whatever order they were recorded in', () => {
    const rows = [cap('2026-11-20T10:00:00Z', 'OUT', 50, 30), cap('2026-11-18T09:00:00Z', 'OUT', 10, 80)];
    assert.strictEqual(latestBalanceTarget(rows)!.balance, 30);
    assert.strictEqual(latestBalanceTarget([...rows].reverse())!.balance, 30);
});
test('a later message with no balance (MTN deposit) is added on top', () => {
    const rows = [cap('2026-11-21T08:00:00Z', 'IN', 100, null), cap('2026-11-20T10:00:00Z', 'OUT', 50, 30)];
    assert.strictEqual(latestBalanceTarget(rows)!.balance, 130);
});
test('a later money-out with a fee and no balance takes amount and fee off', () => {
    const rows = [cap('2026-11-21T08:00:00Z', 'OUT', 20, null, 1.5), cap('2026-11-20T10:00:00Z', 'OUT', 50, 30)];
    assert.strictEqual(latestBalanceTarget(rows)!.balance, 8.5);
});
test('an older message without a balance changes nothing', () => {
    const rows = [cap('2026-11-20T10:00:00Z', 'OUT', 50, 30), cap('2026-11-19T10:00:00Z', 'IN', 500, null)];
    assert.strictEqual(latestBalanceTarget(rows)!.balance, 30);
});

const A = 'food', B = 'transport', C = 'rent', S = 'salary';
test('ranking uses every categorised entry when given', () => {
    const s = buildSuggestions([], [
        { direction: 'OUT', account_id: B }, { direction: 'OUT', account_id: A }, { direction: 'OUT', account_id: A },
        { direction: 'OUT', account_id: C }, { direction: 'OUT', account_id: A }, { direction: 'OUT', account_id: B },
        { direction: 'IN', account_id: S },
    ]);
    assert.deepStrictEqual(s.ranked.OUT, [A, B, C]); assert.deepStrictEqual(s.ranked.IN, [S]);
});
test('the contact suggestion still comes from booked captures', () => {
    const s = buildSuggestions([{ direction: 'OUT', counterparty: '0971234567 JOHN BANDA', account_id: C }], [{ direction: 'OUT', account_id: A }]);
    assert.strictEqual(s.byContact.get('OUT|tel:971234567'), C); assert.deepStrictEqual(s.ranked.OUT, [A]);
});

console.log(failed ? `\n${failed} failing` : '\nall passed');
process.exit(failed ? 1 : 0);
