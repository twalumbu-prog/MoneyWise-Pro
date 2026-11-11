/**
 * Parser checks for mobile money capture. Run: npm run test:momo
 *
 * Samples are representative of the shapes MTN / Airtel / Zamtel confirmations take; when a real message parses wrong,
 * add it here (with names/numbers changed) before adjusting the parser.
 */
import assert from 'assert';
import { parseMomoMessage } from '../services/momoCapture/parser';

type Expect = Partial<ReturnType<typeof parseMomoMessage> & {}> | null;
const cases: { text: string; sender?: string; expect: Expect }[] = [
    {
        text: 'You have received ZMW 250.00 from JOHN BANDA (260971234567) on 27/10/2026 14:02. Financial Transaction Id: 12345678901. New balance: ZMW 1,320.50.',
        sender: 'MoMo',
        expect: { provider: 'MTN', direction: 'IN', amount: 250, balanceAfter: 1320.5, counterparty: 'JOHN BANDA', reference: '12345678901' },
    },
    {
        text: 'You have sent ZMW 1,000.00 to MARY PHIRI 260961112233. Fee ZMW 5.50. Txn ID MP261027.1402.A1B2C3. Your new balance is ZMW 315.00',
        sender: 'MoMo',
        expect: { provider: 'MTN', direction: 'OUT', amount: 1000, fee: 5.5, balanceAfter: 315, counterparty: 'MARY PHIRI 260961112233', reference: 'MP261027.1402.A1B2C3' },
    },
    {
        text: 'Money received. Amt: ZMW 75.00 from 0977000111 CHANDA MWALE. Bal: ZMW 900.00. TID: PP261027ABCD',
        sender: 'AirtelMoney',
        expect: { provider: 'AIRTEL', direction: 'IN', amount: 75, balanceAfter: 900, reference: 'PP261027ABCD' },
    },
    {
        text: 'Airtel Money: You have paid K120 to SHOPRITE CAIRO RD. Ref: CI261027.0912.X9. Charge K2.00. Avail bal K48.00',
        expect: { provider: 'AIRTEL', direction: 'OUT', amount: 120, fee: 2, balanceAfter: 48, counterparty: 'SHOPRITE CAIRO RD', reference: 'CI261027.0912.X9' },
    },
    {
        text: 'Cash Out of ZMW 500.00 at agent KABWE STORES successful. Zamtel Kwacha Ref 99887766. Balance ZMW 20.00',
        expect: { provider: 'ZAMTEL', direction: 'OUT', amount: 500, balanceAfter: 20, reference: '99887766' },
    },
    { text: 'BANDA JOHN has sent you ZMW 40.00. Ref ABC123456', sender: 'MoMo', expect: { direction: 'IN', amount: 40 } },
    // A promo or help line after a real confirmation must not hide it.
    {
        text: 'You have received ZMW 250.00 from JOHN BANDA 260971234567. Your new balance is ZMW 1,320.50. Transaction ID: 12345678901. Dial *115# to check your balance.',
        sender: 'MoMo',
        expect: { direction: 'IN', amount: 250, balanceAfter: 1320.5, reference: '12345678901' },
    },
    {
        text: 'Txn ID: CO261027.1402.B123. You have withdrawn ZMW 200.00 from agent 123456 KABWE STORES. Fee ZMW 5.00. Bal ZMW 10.00. Transact and win big!',
        sender: 'AirtelMoney',
        expect: { provider: 'AIRTEL', direction: 'OUT', amount: 200, fee: 5, balanceAfter: 10, reference: 'CO261027.1402.B123' },
    },
    {
        text: 'Txn. ID : PP261027.1402.A12345. You have received ZMW 50.00 from 971234567 JOHN BANDA. Your available balance is ZMW 60.00.',
        sender: 'AirtelMoney',
        expect: { direction: 'IN', amount: 50, balanceAfter: 60, reference: 'PP261027.1402.A12345' },
    },
    {
        text: 'You have deposited ZMW 500.00 into your account via agent LUSAKA KIOSK. New balance ZMW 512.00. Txn ID 11223344556',
        sender: 'MoMo',
        expect: { direction: 'IN', amount: 500, balanceAfter: 512, reference: '11223344556' },
    },
    // Not transactions — must be ignored.
    { text: 'Y\'ello! You have received a bonus offer. Dial *117# to buy bundles from K5.', sender: 'MoMo', expect: null },
    { text: 'Enter PIN to approve the payment of ZMW 50.00 to SHOP X.', sender: 'MoMo', expect: null },
    { text: 'Your MoMo OTP is 482911. Do not share it with anyone.', expect: null },
    { text: 'Transaction of ZMW 300.00 to MARY PHIRI failed due to insufficient funds.', expect: null },
    { text: 'JOHN BANDA has requested ZMW 200.00 from you. Dial *115# to approve.', expect: null },
    { text: 'Hi, are we still meeting at 5?', expect: null },
];

let failed = 0;
for (const c of cases) {
    const got = parseMomoMessage(c.text, c.sender);
    try {
        if (c.expect === null) assert.strictEqual(got, null);
        else {
            assert.ok(got, 'expected a parse');
            for (const [k, v] of Object.entries(c.expect)) assert.deepStrictEqual((got as any)[k], v, `${k}`);
        }
        console.log(`✓ ${c.text.slice(0, 60)}`);
    } catch (e: any) {
        failed++;
        console.log(`✗ ${c.text.slice(0, 60)}\n    ${e.message}\n    got: ${JSON.stringify(got)}`);
    }
}
console.log(failed ? `\n${failed} failing` : '\nall passed');
process.exit(failed ? 1 : 0);
