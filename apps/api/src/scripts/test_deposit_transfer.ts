/** Rules for linking a sale to its wallet deposit (no database). Run: npm run test:transfers */
import assert from 'assert';
import { planDepositTransfer, receiptNumberOf, resolveFeeAccount, cashOutReference, feeReference } from '../services/depositTransferRules';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; console.log('PASS ', name); } catch (e: any) { console.log('FAIL ', name, '—', e.message); process.exitCode = 1; } };

test('the real MEW3 pairs split into net + fee that sum to the sale', () => {
    for (const [sale, dep, fee] of [[1840, 1816.6, 23.4], [405, 397, 8], [405, 400.95, 4.05], [453, 448.47, 4.53], [550, 540, 10], [587, 576, 11]] as const) {
        const r = planDepositTransfer(sale, dep);
        assert.ok(r.ok, `${sale}/${dep}`);
        if (r.ok) { assert.strictEqual(r.plan.fee, fee); assert.strictEqual(Math.round((r.plan.net + r.plan.fee) * 100) / 100, sale); }
    }
});
test('a deposit equal to the sale has no fee; a larger deposit or a big shortfall is a mismatch', () => {
    const same = planDepositTransfer(500, 500); assert.ok(same.ok && same.plan.fee === 0);
    const more = planDepositTransfer(500, 501); assert.ok(!more.ok);
    const lots = planDepositTransfer(500, 400); assert.ok(!lots.ok);
    assert.ok(!planDepositTransfer(0, 0).ok);
});
test('receipt numbers are read from narrations', () => {
    assert.strictEqual(receiptNumberOf('173'), '173');
    assert.strictEqual(receiptNumberOf(' #173 '), '173');
    assert.strictEqual(receiptNumberOf('r173'), '173');
    assert.strictEqual(receiptNumberOf('Receipt 173'), '173');
    assert.strictEqual(receiptNumberOf('Owners equity'), null);
    assert.strictEqual(receiptNumberOf('Musonda machiko extension'), null);
    assert.strictEqual(receiptNumberOf(undefined), null);
});
test('the fee account defaults to a charges account, or the one named', () => {
    const accts = [{ id: 'a', code: '6600', name: 'Professional Fees' }, { id: 'b', code: 'QB-28', name: 'Transaction Charges' }];
    assert.strictEqual(resolveFeeAccount(accts, null)?.id, 'b');
    assert.strictEqual(resolveFeeAccount(accts, '6600')?.id, 'a');
    assert.strictEqual(resolveFeeAccount([accts[0]], null)?.id, 'a'); // "Professional Fees" matches the generic fee pattern — callers can name another
});
test('idempotency keys follow the app\'s transfer-to-wallet convention', () => {
    assert.strictEqual(cashOutReference('DEP-1-PUB'), 'DEP-1-PUB-CASHOUT');
    assert.strictEqual(feeReference('DEP-1-PUB'), 'DEP-1-PUB-FEE');
});
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
