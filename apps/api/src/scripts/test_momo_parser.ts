/**
 * Parser checks for mobile money capture. Run: npm run test:momo
 *
 * Samples are representative of the shapes MTN / Airtel / Zamtel confirmations take; when a real message parses wrong,
 * add it here (with names/numbers changed) before adjusting the parser.
 */
import assert from 'assert';
import { parseMomoMessage, parseBalanceOnly } from '../services/momoCapture/parser';

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
    // Real messages from a test phone (names changed).
    {
        text: 'Money sent to JANE PHIRI on 12/11/2026.Amount ZMW 10.00. Your bal is ZMW 4.44.TID: PP261112.1807.F61078.',
        sender: 'AirtelMoney',
        expect: { provider: 'AIRTEL', direction: 'OUT', amount: 10, balanceAfter: 4.44, reference: 'PP261112.1807.F61078' },
    },
    {
        text: 'Money received ZMW 40.00 from 100200300 NFS SETTLEMENT ACCOUNT. Dial *115# to check balance. Deposits are free. TID: CI261112.1720.H05308',
        sender: 'AirtelMoney',
        expect: { provider: 'AIRTEL', direction: 'IN', amount: 40, reference: 'CI261112.1720.H05308' },
    },
    // The help line runs straight on from the confirmation, with no space after the full stop.
    {
        text: 'You have received ZMW 5.00 from 970000001 JOHN BANDA.Dial *115# to check your new Bal. TID: PP261113.0858.J46616.',
        sender: 'AirtelMoney',
        expect: { provider: 'AIRTEL', direction: 'IN', amount: 5, balanceAfter: null, counterparty: '970000001 JOHN BANDA', reference: 'PP261113.0858.J46616' },
    },
    // MTN: currency after the number in the balance, and a sender note that quotes a bundle notice.
    {
        text: "Y'ello. Payment of ZMW 10.00 to Mobile Money successful at 2026-10-16 14:53:07.Message:- Y'ello! You have successfully purchased K10: 1GB - 30Days for 260960000001 valid until 2026-11-15. Your new balance: 0.36 ZMW.Financial Transaction ID: 24680135791.",
        sender: 'MoMo',
        expect: { provider: 'MTN', direction: 'OUT', amount: 10, balanceAfter: 0.36, reference: '24680135791' },
    },
    {
        text: 'Yello, Payment of ZMW 15.00 to Mobile Money Data Bundle successful at 2026-10-16 14:53:07. Message -: CBP. Your new balance:0.36 ZMW. Financial Transaction ID:13579246801. Thank you',
        sender: 'MoMo',
        expect: { direction: 'OUT', amount: 15, balanceAfter: 0.36, counterparty: 'Mobile Money Data Bundle', reference: '13579246801' },
    },
    // What the sender typed must not decide anything.
    {
        text: 'Yello.You have received ZMW 80.00 from JOHN BANDA on your mobile money account at 2026-10-15 11:42:05. Message from sender: refund for cancelled order, failed delivery. Financial Transaction ID: 11122233344.',
        sender: 'MoMo',
        expect: { direction: 'IN', amount: 80, counterparty: 'JOHN BANDA', reference: '11122233344' },
    },
    // Money in, worded with an "out" verb.
    { text: 'Payment of ZMW 20.00 received from MARY PHIRI. Txn ID 55566677788. New balance ZMW 25.00', sender: 'MoMo', expect: { direction: 'IN', amount: 20, balanceAfter: 25 } },
    { text: 'You have been paid ZMW 500.00 by ACME LTD. Ref 99911122233. Balance ZMW 512.00', sender: 'MoMo', expect: { direction: 'IN', amount: 500, balanceAfter: 512 } },
    { text: 'JOHN BANDA has transferred ZMW 50.00 to your account. TID: CI261113.1001.A11111', sender: 'AirtelMoney', expect: { direction: 'IN', amount: 50 } },
    // A note after "Ref" is not a transaction id.
    { text: 'You have received ZMW 30.00 from JOHN BANDA. Ref: School fees. Balance of ZMW 45.00', sender: 'MoMo', expect: { direction: 'IN', amount: 30, balanceAfter: 45, reference: null } },
    // Till payment and withdrawal name the other party differently.
    { text: 'Payment of ZMW 2.00 Till Number CORNER SHOP LUSAKA. Airtel Money bal is ZMW 0.44. TID : MP261113.0725.D88498.', sender: 'AirtelMoney', expect: { direction: 'OUT', amount: 2, balanceAfter: 0.44, counterparty: 'CORNER SHOP LUSAKA' } },
    { text: 'You have withdrawn ZMW 50.00 from 123456 JANE PHIRI. Bal is ZMW 83.81. TID: CO261017.1047.E96746.', sender: 'AirtelMoney', expect: { direction: 'OUT', amount: 50, balanceAfter: 83.81, counterparty: '123456 JANE PHIRI' } },
    // Not transactions — must be ignored.
    { text: "Y'ello! You have received K10: 1GB - 30Days from 260960000001 valid until 2026-11-15 14:53:07.123.", sender: 'MTN-ZM', expect: null },
    { text: "Y'ello! You have successfully purchased K10: 1GB - 30Days for 260960000001 valid until 2026-11-15 14:53:07.123.", sender: 'MTN-ZM', expect: null },
    { text: 'Did you know you can get 50Mbps uncapped data at K1,000 for 30 days and a FREE 5G Router? Call 111 or visit https://home.mtn.zm/ to purchase today!', sender: 'MTNHome', expect: null },
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
const balanceCases: { text: string; sender?: string; expect: { provider: string; balance: number } | null }[] = [
    { text: 'Your Mobile Money balance is ZMW 14.28.', sender: 'MoMo', expect: { provider: 'MTN', balance: 14.28 } },
    { text: 'Your Airtel Money balance is ZMW 62.00. Dial *115# for more options.', sender: 'AirtelMoney', expect: { provider: 'AIRTEL', balance: 62 } },
    { text: 'Balance: ZMW 14.28', sender: 'MoMo', expect: { provider: 'MTN', balance: 14.28 } },
    // A real transaction must never be read as a plain balance check.
    { text: 'You have received ZMW 5.00 from JOHN BANDA. New balance ZMW 20.00. TID 12345678901', sender: 'MoMo', expect: null },
    { text: 'Your MoMo OTP is 482911. Do not share it with anyone.', expect: null },
];
for (const c of balanceCases) {
    const got = parseBalanceOnly(c.text, c.sender);
    try {
        if (c.expect === null) assert.strictEqual(got, null);
        else assert.deepStrictEqual(got, c.expect);
        console.log(`✓ [balance-only] ${c.text.slice(0, 60)}`);
    } catch (e: any) {
        failed++;
        console.log(`✗ [balance-only] ${c.text.slice(0, 60)}\n    ${e.message}\n    got: ${JSON.stringify(got)}`);
    }
}

console.log(failed ? `\n${failed} failing` : '\nall passed');
process.exit(failed ? 1 : 0);
