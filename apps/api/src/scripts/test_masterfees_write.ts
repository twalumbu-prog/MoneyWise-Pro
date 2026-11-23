/**
 * MoneyWise <-> Master Fees: the write API client and the read-side changes. No network, no database (axios is replaced by a stand-in).
 * Run: npx tsx src/scripts/test_masterfees_write.ts
 */
import axios from 'axios';
import { collectPages } from '../services/masterfees_paging';
import {
    cleanPayment, cleanStudentCreate, cleanStudentUpdate, cleanInvoice, cleanVoid, money, sendWrite, writeBase, masterFeesWrites, MasterFeesWriteError, replacePayment, replaceInvoice,
} from '../services/masterfees_write';
import { MasterFeesClient, MasterFeesRateLimitError, isMasterFeesSyncDue } from '../services/masterfees.service';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const throwsCode = (fn: () => unknown, status: number) => { try { fn(); return false; } catch (e: any) { return e instanceof MasterFeesWriteError && e.status === status; } };
const noSleep = async () => undefined;

const SCHOOL = '1a2b3c4d-1111-4222-8333-444455556666';
const STUDENT = '9f8e7d6c-1111-4222-8333-444455556666';
const config = { schoolId: SCHOOL, publicKey: 'mf_pub_test', baseUrl: undefined as string | undefined };

(async () => {
    /* ── validation ── */
    ok('money: 2000, "12.50" accepted; 0, -1, 10,000,001, 1.234, "abc" refused',
        money(2000) === 2000 && money('12.50') === 12.5 && [0, -1, 10_000_001, 1.234, 'abc'].every((v) => throwsCode(() => money(v), 422)));
    const pay = cleanPayment({ external_reference: 'MW-1001', admission_number: ' A1042 ', amount: '2000', payment_date: '2026-11-10', payment_method: 'BANK', payer_name: 'Mrs Banda', surprise: 'x' });
    ok('payment: trimmed, lower-cased, and an unknown field is dropped, never sent', pay.admission_number === 'A1042' && pay.payment_method === 'bank' && pay.amount === 2000 && !('surprise' in pay), JSON.stringify(pay));
    ok('payment: needs a student, a reference and a good amount', throwsCode(() => cleanPayment({ external_reference: 'R1', amount: 5 }), 422) && throwsCode(() => cleanPayment({ admission_number: 'A1', amount: 5 }), 422) && throwsCode(() => cleanPayment({ external_reference: 'R 1', admission_number: 'A1', amount: 5 }), 422));
    ok('payment: mobile money and card are never written (that is real wallet money)', throwsCode(() => cleanPayment({ external_reference: 'R1', admission_number: 'A1', amount: 5, payment_method: 'mobile_money' }), 422) && throwsCode(() => cleanPayment({ external_reference: 'R1', admission_number: 'A1', amount: 5, payment_method: 'card' }), 422));
    ok('payment: a bad date is refused; a student id wins over an admission number', throwsCode(() => cleanPayment({ external_reference: 'R1', student_id: STUDENT, amount: 5, payment_date: '10/11/2026' }), 422) && !('admission_number' in cleanPayment({ external_reference: 'R1', student_id: STUDENT, admission_number: 'A1', amount: 5 })));
    ok('student create: names required, gender checked', cleanStudentCreate({ first_name: 'Ann', last_name: 'Zulu', gender: 'Female', grade: 'Grade 5', year: 2026 }).gender === 'female' && throwsCode(() => cleanStudentCreate({ first_name: 'Ann' }), 422) && throwsCode(() => cleanStudentCreate({ first_name: 'A', last_name: 'B', gender: 'x' }), 422));
    ok('student update: only the named fields, and at least one', JSON.stringify(cleanStudentUpdate({ grade: 'Grade 6', extra: 1 })) === '{"grade":"Grade 6"}' && throwsCode(() => cleanStudentUpdate({}), 422));
    const inv = cleanInvoice({ external_reference: 'INV-77', student_id: STUDENT, term: 2, year: 2026, due_date: '2026-05-11', items: [{ description: 'Tuition', amount: 7335, category: 'tuition' }, { description: 'PTC', amount: '500' }] });
    ok('invoice: items cleaned, amounts numeric', inv.items.length === 2 && inv.items[1].amount === 500 && inv.term === 2);
    ok('invoice: term 1-3, due date, 1-50 items, positive amounts', throwsCode(() => cleanInvoice({ ...inv, term: 4 }), 422) && throwsCode(() => cleanInvoice({ ...inv, due_date: undefined }), 422) && throwsCode(() => cleanInvoice({ ...inv, items: [] }), 422) && throwsCode(() => cleanInvoice({ ...inv, items: [{ description: 'x', amount: -1 }] }), 422) && throwsCode(() => cleanInvoice({ ...inv, items: Array.from({ length: 51 }, () => ({ description: 'x', amount: 1 })) }), 422));
    ok('void: a reason is required; an id must be an id', cleanVoid({ reason: ' duplicate ' }).reason === 'duplicate' && throwsCode(() => cleanVoid({}), 422) && throwsCode(() => masterFeesWrites.voidInvoice(config as any, 'not-an-id', { reason: 'x' }) as any, 422));

    /* ── sending ── */
    ok('address: the write API sits next to the data feed (without /data)', writeBase(config) === `https://dashboard.master-fees.com/api/v1/school/${SCHOOL}` && writeBase({ schoolId: SCHOOL, baseUrl: 'https://x.test/api/v1/school/abc/data/' }) === 'https://x.test/api/v1/school/abc');
    const calls: any[] = [];
    const reply = (status: number, data: any, headers: Record<string, string> = {}) => async (cfg: any) => { calls.push(cfg); return { status, data, headers }; };
    const r1 = await sendWrite(config, 'POST', '/payments', pay, { http: reply(201, { success: true, total: 2000 }), idempotencyKey: 'MW-1001' });
    ok('201 is a success; the key goes in a header, never the URL; the idempotency key is sent', r1.status === 201 && !r1.idempotent && calls[0].headers['X-MF-Public-Key'] === 'mf_pub_test' && calls[0].headers['Idempotency-Key'] === 'MW-1001' && !/key=/i.test(calls[0].url) && calls[0].url.endsWith('/payments'));
    const r2 = await sendWrite(config, 'POST', '/payments', pay, { http: reply(200, { success: true, idempotent: true }) });
    ok('a repeat (200, idempotent) is reported as a repeat', r2.status === 200 && r2.idempotent === true);
    const caught = async (status: number, data: any, headers: Record<string, string> = {}) => { try { await sendWrite(config, 'POST', '/payments', pay, { http: reply(status, data, headers) }); return null; } catch (e: any) { return e as MasterFeesWriteError; } };
    const e403 = await caught(403, { error: 'Forbidden', code: 'write_kind_disabled', message: 'Recording payments is off.' });
    ok('403 write_kind_disabled keeps Master Fees’ own code and words, and is not retryable', e403?.status === 403 && e403.code === 'write_kind_disabled' && /off/.test(e403.message) && e403.retryable === false);
    const e409 = await caught(409, { code: 'reference_reused', message: 'Same reference, different details.' });
    ok('409 reference_reused is not retryable', e409?.code === 'reference_reused' && !e409.retryable);
    const e429 = await caught(429, { message: 'Slow down' }, { 'retry-after': '30' });
    ok('429 is retryable and says how long to wait', e429?.status === 429 && e429.retryable && (e429.details as any)?.retry_after_seconds === 30);
    ok('a 500 is retryable (safe: creating is idempotent)', (await caught(500, { message: 'x' }))?.retryable === true);
    let net: MasterFeesWriteError | null = null;
    try { await sendWrite(config, 'POST', '/payments', pay, { http: async () => { throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }); } }); } catch (e: any) { net = e; }
    ok('no answer at all: retryable, and says nothing was confirmed', net?.retryable === true && net.code === 'no_answer' && /try the same request again/.test(net.message));
    calls.length = 0;
    await masterFeesWrites.recordPayment(config as any, { external_reference: 'MW-9', admission_number: 'A1', amount: 10 }, { http: reply(201, {}) });
    ok('recording a payment uses its own reference as the idempotency key', calls[0].headers['Idempotency-Key'] === 'MW-9' && calls[0].data.external_reference === 'MW-9');

    /* ── editing = void the old, record the corrected one ── */
    const OLD = '5a5a5a5a-1111-4222-8333-444455556666';
    const seq: any[] = [];
    const script = (...answers: { status: number; data: any }[]) => async (cfg: any) => { seq.push({ method: cfg.method, url: cfg.url, data: cfg.data, headers: cfg.headers }); const a = answers[Math.min(seq.length - 1, answers.length - 1)]; return { status: a.status, data: a.data, headers: {} }; };
    const goodPay = { edit_reason: 'wrong amount', external_reference: 'MW-FIX-1', admission_number: 'A1042', amount: 1500, payment_method: 'bank' };
    seq.length = 0;
    const rp = await replacePayment(config as any, OLD, goodPay, { http: script({ status: 200, data: { success: true } }, { status: 201, data: { success: true, total: 1500 } }) });
    ok('EDIT payment: the old is voided FIRST, then the corrected one recorded', seq.length === 2 && seq[0].url.endsWith(`/payments/${OLD}/void`) && seq[1].url.endsWith('/payments') && rp.created.status === 201);
    ok('EDIT payment: the void carries the reason; the new payment does not carry edit_reason; its own reference is the idempotency key', seq[0].data.reason === 'Edited: wrong amount' && !('edit_reason' in seq[1].data) && seq[1].headers['Idempotency-Key'] === 'MW-FIX-1' && seq[1].data.amount === 1500);
    seq.length = 0;
    let threw422 = false;
    try { await replacePayment(config as any, OLD, { ...goodPay, amount: -5 }, { http: script({ status: 200, data: {} }) }); } catch (e: any) { threw422 = e instanceof MasterFeesWriteError && e.status === 422; }
    ok('EDIT payment: a mistake in the corrected record is caught BEFORE anything is voided (no request sent)', threw422 && seq.length === 0);
    seq.length = 0;
    let noReason = false;
    try { await replacePayment(config as any, OLD, { ...goodPay, edit_reason: '' }, { http: script({ status: 200, data: {} }) }); } catch (e: any) { noReason = e.status === 422; }
    ok('EDIT payment: a reason for the change is required (and nothing is sent without it)', noReason && seq.length === 0);

    const goodInv = { edit_reason: 'wrong fee', external_reference: 'INV-FIX-1', student_id: STUDENT, term: 2, year: 2026, due_date: '2026-05-11', items: [{ description: 'Tuition', amount: 7000 }] };
    seq.length = 0;
    let refused: MasterFeesWriteError | null = null;
    try { await replaceInvoice(config as any, OLD, goodInv, { http: script({ status: 409, data: { code: 'has_payments', message: 'Void the payments first.' } }) }); } catch (e: any) { refused = e; }
    ok('EDIT invoice: if the old one cannot be voided (has payments) NOTHING is created and the reason is kept', refused?.code === 'has_payments' && seq.length === 1 && !(refused.details as any)?.old_voided);
    seq.length = 0;
    let half: MasterFeesWriteError | null = null;
    try { await replaceInvoice(config as any, OLD, goodInv, { http: script({ status: 200, data: { success: true } }, { status: 500, data: { message: 'boom' } }) }); } catch (e: any) { half = e; }
    ok('EDIT invoice: old voided but the new one failed: says so, flags old_voided, and is retryable', !!half && /old invoice was voided/.test(half.message) && (half.details as any)?.old_voided === true && half.retryable === true && /Send the same edit again/.test(half.message));
    seq.length = 0;
    const again = await replaceInvoice(config as any, OLD, goodInv, { http: script({ status: 200, data: { success: true, idempotent: true } }, { status: 200, data: { success: true, idempotent: true } }) });
    ok('EDIT invoice: sending the same edit again finishes it (void is a repeat, create is a repeat) without doing it twice', again.voided.idempotent && again.created.idempotent && seq[1].headers['Idempotency-Key'] === 'INV-FIX-1');

    /* ── paging: stop on the feed's own word, and never retry a "slow down" ── */
    { const seen: number[] = [];
      const r = await collectPages(async (p) => { seen.push(p); return Array.from({ length: 1000 }, (_, i) => ({ id: `r${p}-${i}` })); }, 'id', { sleep: noSleep, isLast: (p) => p === 2 });
      ok('PAGING: has_more=false on a FULL page ends the read, with no request past the end', seen.join(',') === '1,2' && r.rows.length === 2000 && !r.endedByError); }
    { let n = 0; let threw: any = null;
      try { await collectPages(async () => { n++; throw new MasterFeesRateLimitError(30); }, 'id', { sleep: noSleep, fatal: (e) => e instanceof MasterFeesRateLimitError }); } catch (e) { threw = e; }
      ok('PAGING: a 429 stops at once (one request, not three) and carries Retry-After', n === 1 && threw instanceof MasterFeesRateLimitError && threw.retryAfterSeconds === 30); }

    /* ── the read client ── */
    const realGet = axios.get;
    const mfClient = new MasterFeesClient({ schoolId: SCHOOL, publicKey: 'mf_pub_test' } as any);
    const requests: string[] = [];
    (axios as any).get = async (url: string, cfg: any) => {
        requests.push(url);
        ok_headers = cfg?.headers;
        return { data: { count: 3, pagination: { page: 1, limit: 1000, returned: 3, total: 3, has_more: false }, data: [
            { transaction_id: 't1', reference: 'LENCO-1', amount: 100 },
            { transaction_id: 't2', reference: 'MW1a2b3c4d-MW-1001', amount: 2000 },   // written by MoneyWise: already in its books
            { transaction_id: 't3', reference: 'IMP-5', amount: 50 },
        ] } };
    };
    let ok_headers: any = null;
    const txns = await mfClient.getTransactions();
    ok('READ: has_more=false on a short page: one request; the key is a header', requests.length === 1 && ok_headers?.['X-MF-Public-Key'] === 'mf_pub_test' && !/key=/i.test(requests[0]));
    ok('READ: a payment MoneyWise wrote (reference MW<school>-…) is not imported back as a new one', txns.length === 2 && !txns.some((t) => t.transaction_id === 't2'));
    (axios as any).get = async () => ({ data: { data: [{ invoice_id: 'i1', invoice_number: 'INV-1' }, { invoice_id: 'i2', invoice_number: 'MW-INV-77' }], pagination: { has_more: false, total: 2 } } });
    const invs = await mfClient.getInvoices();
    ok('READ: an invoice MoneyWise created (MW-…) is not imported back', invs.length === 1 && invs[0].invoice_id === 'i1');
    (axios as any).get = async () => { throw Object.assign(new Error('429'), { response: { status: 429, headers: { 'retry-after': '45' }, data: { message: 'Rate limit' } } }); };
    let limited: any = null;
    try { await mfClient.getTransactions(); } catch (e) { limited = e; }
    ok('READ: HTTP 429 becomes a rate-limit error that remembers Retry-After', limited instanceof MasterFeesRateLimitError && limited.retryAfterSeconds === 45);
    (axios as any).get = realGet;

    const future = new Date(Date.now() + 60_000).toISOString();
    ok('SYNC: while rate limited the routine sync is not due; afterwards it is', isMasterFeesSyncDue({ schoolId: 's', publicKey: 'k', rateLimitedUntil: future } as any) === false && isMasterFeesSyncDue({ schoolId: 's', publicKey: 'k', rateLimitedUntil: new Date(Date.now() - 1000).toISOString() } as any) === true);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
