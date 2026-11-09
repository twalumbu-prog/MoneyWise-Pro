/**
 * POST /api/v1/sales input checks (no database). Run: npm run test:sales
 * Covers body validation, the income-account fallback, and the mapping onto the staff cart shape
 * that services/manualSale.service.ts books.
 */
import assert from 'assert';
import { parseSaleBody, resolveIncomeAccount, toCartItems, METHOD_LABELS, ParsedCustomItem } from '../services/publicSaleInput';

const PRODUCT = '90bb2ef3-706d-4767-85b1-09de5394ef20';
const base = () => ({
    external_reference: 'kaizen:mew3:2026-10-28:1',
    date: '2026-10-28',
    amount: 950,
    account_type: 'CASH',
    customer_name: 'Svea Hannekum',
    customer_phone: '+260971234567',
    items: [{ name: 'Accommodation – Room 6', income_account: 'Accommodation Revenue', quantity: 1, price: 950 }] as any[],
});

let passed = 0;
const test = (name: string, fn: () => void) => {
    try { fn(); passed++; console.log('PASS ', name); } catch (e: any) { console.log('FAIL ', name, '—', e.message); process.exitCode = 1; }
};
const errorOf = (body: any) => { const r = parseSaleBody(body); assert.ok(!r.ok, 'expected a validation error'); return (r as any).error as string; };

test('the contract example parses', () => {
    const r = parseSaleBody(base());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepStrictEqual(r.sale.items, [{ kind: 'custom', name: 'Accommodation – Room 6', income_account: 'Accommodation Revenue', quantity: 1, price: 950 }]);
    assert.strictEqual(r.sale.account_type, 'CASH');
    assert.strictEqual(r.sale.customer_name, 'Svea Hannekum');
});

test('a product item with a stay parses; quantity defaults to 1', () => {
    const r = parseSaleBody({ ...base(), items: [{ product_id: PRODUCT, price: 950, check_in: '2026-10-28', check_out: '2026-10-29' }] });
    assert.ok(r.ok);
    if (r.ok) assert.deepStrictEqual(r.sale.items[0], { kind: 'product', product_id: PRODUCT, quantity: 1, price: 950, check_in: '2026-10-28', check_out: '2026-10-29' });
});

test('required fields are enforced', () => {
    assert.match(errorOf({ ...base(), external_reference: '' }), /external_reference/);
    assert.match(errorOf({ ...base(), external_reference: 'x'.repeat(121) }), /external_reference/);
    assert.match(errorOf({ ...base(), date: '28/10/2026' }), /date/);
    assert.match(errorOf({ ...base(), date: '2026-02-30' }), /date/);
    assert.match(errorOf({ ...base(), amount: 0 }), /amount/);
    assert.match(errorOf({ ...base(), amount: '950' }), /amount/);
    assert.match(errorOf({ ...base(), account_type: 'MTN' }), /account_type/);
    assert.match(errorOf({ ...base(), items: [] }), /items/);
});

test('item rules: product_id or name, valid stay, positive quantity', () => {
    assert.match(errorOf({ ...base(), items: [{ quantity: 1, price: 10 }] }), /product_id.*name/);
    assert.match(errorOf({ ...base(), items: [{ product_id: 'room-6', price: 10 }] }), /UUID/);
    assert.match(errorOf({ ...base(), items: [{ product_id: PRODUCT, price: 10, check_in: '2026-10-28' }] }), /both check_in and check_out/);
    assert.match(errorOf({ ...base(), items: [{ product_id: PRODUCT, price: 10, check_in: '2026-10-29', check_out: '2026-10-28' }] }), /after check_in/);
    assert.match(errorOf({ ...base(), items: [{ name: 'Room', price: 0 }] }), /greater than 0/);
    assert.match(errorOf({ ...base(), items: [{ name: 'Room', price: 10, quantity: -1 }] }), /quantity/);
    assert.match(errorOf({ ...base(), items: [{ name: 'Room', price: 10, check_in: '2026-10-28', check_out: '2026-10-29' }] }), /product_id/);
});

const accounts = [
    { id: 'a1', code: '4000', name: 'Sales', is_active: true },
    { id: 'a2', code: '4100', name: 'Accommodation Revenue', is_active: true },
    { id: 'a3', code: '4200', name: 'Food & Beverage', is_active: true },
];

test('income account resolves by id, code or name (case-insensitive)', () => {
    assert.strictEqual(resolveIncomeAccount(accounts, 'a3')?.id, 'a3');
    assert.strictEqual(resolveIncomeAccount(accounts, '4200')?.id, 'a3');
    assert.strictEqual(resolveIncomeAccount(accounts, 'food & BEVERAGE')?.id, 'a3');
});

test('missing or unknown income account falls back to the accommodation account, else null', () => {
    assert.strictEqual(resolveIncomeAccount(accounts, null)?.id, 'a2');
    assert.strictEqual(resolveIncomeAccount(accounts, 'Room Revenue')?.id, 'a2');
    assert.strictEqual(resolveIncomeAccount(accounts.filter(a => a.id !== 'a2'), null), null);
    // An active accommodation account wins over an inactive one.
    const two = [{ id: 'old', code: null, name: 'Accommodation (old)', is_active: false }, { id: 'new', code: null, name: 'Zz Accommodation', is_active: true }];
    assert.strictEqual(resolveIncomeAccount(two, null)?.id, 'new');
});

test('parsed items map onto the staff cart shape', () => {
    const r = parseSaleBody({ ...base(), items: [
        { product_id: PRODUCT, quantity: 2, price: 500, check_in: '2026-10-28', check_out: '2026-10-30' },
        { product_id: PRODUCT, quantity: 1, price: 50 },
        { name: 'Laundry', quantity: 1, price: 40 },
    ] });
    assert.ok(r.ok);
    if (!r.ok) return;
    const cart = toCartItems(r.sale.items, (it: ParsedCustomItem) => (it.name === 'Laundry' ? 'a2' : 'x'));
    assert.deepStrictEqual(cart, [
        { id: PRODUCT, quantity: 2, price: 500, check_in: '2026-10-28', check_out: '2026-10-30' },
        { id: PRODUCT, quantity: 1, price: 50 },
        { custom: true, name: 'Laundry', income_account_id: 'a2', quantity: 1, price: 40 },
    ]);
    assert.strictEqual(METHOD_LABELS.CASH, 'Cash');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
