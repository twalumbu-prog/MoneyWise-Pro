/**
 * Checks the MTN set-up without moving money: phone numbers, the callback secret check, and (when the keys are in the environment) a real
 * sign-in to MTN and, if a number is given, whether it is a MoMo account holder.
 *   npx tsx src/scripts/test_mtn.ts            (offline checks, plus the sign-in if MTN_CONSUMER_KEY/SECRET are set)
 *   npx tsx src/scripts/test_mtn.ts 0971234567 (also validates that number)
 */
import 'dotenv/config';
import { toMsisdn, callbackSecretOk, mtnConfigured, mtnGatewayStatus, validateAccountHolder } from '../services/mtn.service';
import { buildPaymentBody, mapMtnStatus } from '../services/mtnPayout.service';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

(async () => {
    check('0971234567 becomes 260971234567', toMsisdn('0971234567') === '260971234567');
    check('+260 97 123 4567 becomes 260971234567', toMsisdn('+260 97 123 4567') === '260971234567');
    check('971234567 becomes 260971234567', toMsisdn('971234567') === '260971234567');

    const saved = process.env.MTN_CALLBACK_SECRET;
    delete process.env.MTN_CALLBACK_SECRET;
    check('no secret set: every callback is refused', !callbackSecretOk('anything') && !callbackSecretOk(undefined));
    process.env.MTN_CALLBACK_SECRET = 'short';
    check('a too-short secret is refused', !callbackSecretOk('short'));
    process.env.MTN_CALLBACK_SECRET = 'a'.repeat(32);
    check('the right secret is accepted', callbackSecretOk('a'.repeat(32)));
    check('a wrong secret is refused', !callbackSecretOk('b'.repeat(32)) && !callbackSecretOk('a'.repeat(31)));
    if (saved === undefined) delete process.env.MTN_CALLBACK_SECRET; else process.env.MTN_CALLBACK_SECRET = saved;

    // Payout rules that need no network
    const body = buildPaymentBody({ payoutId: 'p1', phone: '260971234567', amount: 50, currency: 'ZMW', note: null }, { callingSystem: 'X', targetSystem: 'Y', payerId: '260970000000', payerIdType: 'MSISDN', callbackUrl: 'https://api.example.com/webhooks/mtn/s/payments' });
    check('payment body: amount has two decimals and the currency', body.amount.amount === '50.00' && body.amount.units === 'ZMW');
    check('payment body: pays the customer from the payer, with our callback and reference', body.payee[0].payeeId === '260971234567' && body.payer.payerId === '260970000000' && body.callbackURL.endsWith('/payments') && body.externalTransactionId === 'p1');
    check('status: "Successful" is success', mapMtnStatus({ data: { status: 'Successful' } }).status === 'SUCCESSFUL');
    check('status: "FAILED" is failure', mapMtnStatus({ data: { status: 'FAILED' } }).status === 'FAILED');
    check('status: "Pending" stays open', mapMtnStatus({ statusCode: '0000', data: { status: 'Pending' } }).status === null);
    check('status: a bare 0000 code with no status stays open (it only means MTN took the request)', mapMtnStatus({ statusCode: '0000' }).status === null);
    check('status: nothing at all stays open', mapMtnStatus(undefined).status === null);
    if (!mtnConfigured()) {
        console.log('SKIP  live checks: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set here');
    } else {
        try {
            const st: any = await mtnGatewayStatus({ signIn: true });
            const absent = Object.entries(st.present).filter(([, v]) => !v).map(([k]) => k);
            console.log(`INFO  gateway reachable. Secrets still missing: ${absent.join(', ') || 'none'}`);
            check('the gateway signs in to MTN', st.signIn === 'ok');
            if (st.signIn !== 'ok') console.log(`INFO  ${st.signIn}`, JSON.stringify(st.diagnosis ?? {}));
        } catch (e: any) { check(`reaches the MTN gateway (${e.message})`, false); }
        const phone = process.argv[2];
        if (phone) {
            try { const r = await validateAccountHolder(phone); console.log(`INFO  ${phone} is ${r.isValid ? '' : 'NOT '}a MoMo account holder (transaction ${r.transactionId})`); } catch (e: any) { check(`validates ${phone} (${e.message})`, false); }
        }
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
    process.exit(failed ? 1 : 0);
})();
