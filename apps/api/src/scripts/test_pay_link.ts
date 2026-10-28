/**
 * Paying a pay link from a wallet (services/payLink.service.ts), on throwaway organizations.
 * The "create the requisition and move the money at Lenco" step is replaced by a stand-in (it is the same pipeline the app's
 * Send screen uses, covered by test_moneywise_pay.ts); everything this feature adds runs for real: resolving links, the checks,
 * the single-use lock, crediting the recipient, settling the link and its sales. Receipts (WhatsApp / email / push) are silenced,
 * so nothing is sent to anyone and no money moves.
 */
import 'dotenv/config';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import * as internalCall from '../services/agent/internalCall';
import { createRequisition } from '../controllers/requisition.controller';
import { autoAuthorizeAndDisburse } from '../controllers/disbursement.controller';
import { moneyWisePayService } from '../services/moneyWisePay.service';
import { whatsappService } from '../services/whatsapp.service';
import { emailService } from '../services/email.service';
import { pushService } from '../services/push.service';
import { payLinkService, PayLinkError } from '../services/payLink.service';
import { LencoService } from '../services/lenco.service';
import { calculatePlatformFee } from '../lib/platformFee';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}
const refusal = async (p: Promise<any>) => { try { await p; return null; } catch (e: any) { return e as PayLinkError; } };

async function main() {
    const stamp = Date.now();
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const today = new Date().toISOString().split('T')[0];
    const mkOrg = async (tag: string, personal: boolean, subaccount: boolean, username?: string) => {
        const { data, error } = await supabase.from('organizations').insert({
            name: `ZZ PayLink ${tag} ${stamp}`, slug: `zz-paylink-${tag}-${stamp}`, is_personal: personal, public_username: username ?? null,
            lenco_subaccount_id: subaccount ? crypto.randomUUID() : null, lenco_secret_key: `zz-${tag}-${stamp}`, payment_test_mode: false,
        }).select('id').single();
        if (!data) throw new Error(`org ${tag}: ${error?.message}`);
        const id = (data as any).id as string;
        await supabase.from('accounts').insert({ organization_id: id, code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank' });
        const { data: w } = await supabase.from('organization_wallets').insert({ organization_id: id, name: 'Main Wallet', is_main: true }).select('id').single();
        return { id, walletId: (w as any).id as string };
    };
    const payer = await mkOrg('payer', true, true);
    const biz = await mkOrg('biz', false, true, `zzbiz${stamp}`);
    const noLenco = await mkOrg('nolenco', false, false);
    await supabase.from('cashbook_entries').insert({ organization_id: payer.id, entry_type: 'INFLOW', description: 'Opening', debit: 500, credit: 0, date: today, account_type: 'MONEYWISE_WALLET', wallet_id: payer.walletId, balance_after: 500, status: 'COMPLETED', created_by: STEPHEN });

    // A product, and the links
    const { data: prod } = await supabase.from('products').insert({ organization_id: biz.id, name: 'ZZ Test Product', price: 100, wallet_id: biz.walletId }).select('id').single();
    const productId = (prod as any)?.id as string | undefined;
    const mkLink = async (over: any = {}) => {
        const { data, error } = await supabase.from('payment_links').insert({ organization_id: biz.id, wallet_id: biz.walletId, token: `zz${crypto.randomBytes(6).toString('hex')}`, customer_name: 'Test', customer_phone: '0971111111', amount: 100, status: 'ACTIVE', ...(productId ? { product_id: productId } : {}), ...over }).select('token').single();
        if (!data) throw new Error(`link: ${error?.message}`);
        return (data as any).token as string;
    };

    const ctx: any = { organizationId: payer.id, userId: STEPHEN, role: 'ADMIN', today };
    const calls: string[] = [];
    let lastRequisition: any = null;
    let lencoStatus = 'successful';
    const original = internalCall.callHandler;
    (internalCall as any).callHandler = async (handler: any, c: any, opts: any = {}) => {
        if (handler === createRequisition) {
            const { data } = await supabase.from('requisitions').insert({ organization_id: c.organizationId, requestor_id: c.userId, status: 'AUTHORISED', description: opts.body.description, estimated_total: opts.body.estimated_total, type: 'EXPENSE' }).select('id').single();
            calls.push('create'); lastRequisition = opts.body; return { status: 201, body: { id: (data as any).id, reference_number: 'REQ-TEST' } };
        }
        if (handler === autoAuthorizeAndDisburse) {
            const id = opts.params.id as string; const ref = `MWPAY-${id.slice(0, 8)}`;
            await supabase.from('disbursements').insert({ requisition_id: id, cashier_id: c.userId, total_prepared: opts.body.total_prepared, payment_method: 'MONEYWISE_PAY', organization_id: c.organizationId, external_reference: ref, recipient_account: opts.body.recipient_organization_id });
            await moneyWisePayService.remember(ref, { recipientOrgId: opts.body.recipient_organization_id, senderName: 'ZZ Payer', amount: opts.body.total_prepared });
            calls.push('disburse'); return { status: 200, body: { lencoStatus } };
        }
        return original(handler, c, opts);
    };
    // The commission sweep talks to Lenco: replace both calls so no real transfer is ever attempted.
    const L: any = LencoService;
    const savedLenco = { st: L.getTransferStatus, tx: L.transferToLencoMerchant };
    const sweeps: { amount: number; reference: string; till: string }[] = [];
    L.getTransferStatus = async (ref: string) => (sweeps.some((s) => s.reference === ref) ? { status: 'successful' } : null);
    L.transferToLencoMerchant = async (p: any) => { sweeps.push({ amount: p.amount, reference: p.reference, till: p.tillNumber }); return { status: 'successful', reference: p.reference }; };
    const notified: string[] = [];
    for (const [svc, fns] of [[whatsappService, ['notifyPaymentLinkPaid', 'notifyPublicSalePaid']], [emailService, ['notifyPaymentLinkPaid', 'notifyPublicSalePaid']], [pushService, ['notifyPaymentLinkPaid', 'notifyPublicSalePaid']]] as any[]) {
        for (const f of fns) (svc as any)[f] = async (...a: any[]) => { notified.push(f); };
    }

    const linkToken = await mkLink();
    try {
        await step('resolving a payment link: who, how much, can it be paid, and the payer\'s wallets with balances', async () => {
            const r = await payLinkService.resolvePayTarget(payer.id, { token: linkToken });
            must(r.status === 'READY' && r.amount === 100 && r.fee === 2.5 && r.total === 102.5 && r.amountEditable === false && r.recipient.orgId === biz.id && !r.own, JSON.stringify(r));
            must(r.wallets.length === 1 && r.wallets[0].balance === 500 && r.wallets[0].is_main, JSON.stringify(r.wallets));
        });
        await step('a quick link resolves with an amount the payer chooses; unknown / not-ready / own / booking links are not payable', async () => {
            const q = await payLinkService.resolvePayTarget(payer.id, { username: `ZZBIZ${stamp}` });
            must(q.kind === 'QUICK' && q.status === 'READY' && q.amount === null && q.fee === 0 && q.total === null && q.amountEditable === true && q.recipient.orgId === biz.id, JSON.stringify(q));
            must((await refusal(payLinkService.resolvePayTarget(payer.id, { token: 'nope-not-a-link' })))?.httpStatus === 404, 'unknown link');
            const b = await mkLink({ items: [{ product_id: productId, name: 'Stay', quantity: 2, unit_price: 50, check_in: '2026-12-01', check_out: '2026-12-03' }] });
            const br = await payLinkService.resolvePayTarget(payer.id, { token: b });
            must(br.status === 'UNAVAILABLE' && /browser/i.test(br.reason ?? ''), JSON.stringify(br));
            const own = await payLinkService.resolvePayTarget(biz.id, { token: linkToken });
            must(own.own === true, 'own link flag');
        });
        await step('refused before any money moves: not the account holder, own link, not enough money, bad quick amount', async () => {
            const before = calls.length;
            must((await refusal(payLinkService.payWithWallet({ ...ctx, role: 'CASHIER' }, { token: linkToken })))?.code === 'FORBIDDEN', 'role');
            must((await refusal(payLinkService.payWithWallet({ ...ctx, organizationId: biz.id }, { token: linkToken })))?.code === 'OWN', 'own');
            const big = await mkLink({ amount: 900 });
            must((await refusal(payLinkService.payWithWallet(ctx, { token: big })))?.code === 'INSUFFICIENT', 'insufficient');
            must((await refusal(payLinkService.payWithWallet(ctx, { username: `zzbiz${stamp}`, amount: 0 })))?.code === 'AMOUNT', 'zero amount');
            must((await refusal(payLinkService.payWithWallet(ctx, { username: `zzbiz${stamp}` })))?.code === 'AMOUNT', 'no amount');
            must(calls.length === before, 'nothing may be attempted');
        });
        let reference = '';
        await step('paying a payment link: recipient credited once, link PAID and tied to the payment, sale completed, receipts sent', async () => {
            const r = await payLinkService.payWithWallet(ctx, { token: linkToken });
            must(r.status === 'paid' && r.amount === 100 && r.fee === 2.5 && r.total === 102.5 && r.recipient.includes('ZZ PayLink biz'), JSON.stringify(r));
            reference = r.reference!;
            must(/^MWPAY-/.test(reference), `reference ${reference}`);
            const { data: inflow } = await supabase.from('cashbook_entries').select('debit, status').eq('organization_id', biz.id).eq('external_reference', reference);
            must((inflow || []).length === 1 && Number((inflow as any)[0].debit) === 100, `the business is credited the amount, not the fee: ${JSON.stringify(inflow)}`);
            const { data: link } = await supabase.from('payment_links').select('status, reference').eq('token', linkToken).maybeSingle();
            must((link as any).status === 'PAID' && (link as any).reference === reference, JSON.stringify(link));
            if (productId) {
                const { data: sales } = await supabase.from('product_sales').select('status, amount_paid').eq('reference', reference);
                must((sales || []).length === 1 && (sales as any)[0].status === 'COMPLETED' && Number((sales as any)[0].amount_paid) === 100, `sales ${JSON.stringify(sales)}`);
            }
            must(notified.includes('notifyPaymentLinkPaid'), `receipts not sent: ${notified.join()}`);
            // Fees, exactly as for a payment link paid any other way
            must(lastRequisition.estimated_total === 102.5, `payer is charged amount + fee: ${lastRequisition.estimated_total}`);
            must(lastRequisition.items.length === 2 && lastRequisition.items[1].description === 'MoneyWise processing fee' && lastRequisition.items[1].estimated_amount === 2.5, JSON.stringify(lastRequisition.items));
            must(sweeps.length === 1 && sweeps[0].amount === 2.5 && sweeps[0].reference === `SPLIT-${reference}` && sweeps[0].till === '9838830', `fee must be forwarded once to the settlement till: ${JSON.stringify(sweeps)}`);
            const { data: memo } = await supabase.from('app_settings').select('key').in('key', [`paylink:${reference}`, `paylink-lock:${linkToken}`]);
            must((memo || []).length === 0, 'bookkeeping rows must be cleaned up');
        });
        await step('the same link cannot be paid twice', async () => {
            const before = calls.length;
            const e = await refusal(payLinkService.payWithWallet(ctx, { token: linkToken }));
            must(e?.code === 'PAID' && calls.length === before, JSON.stringify(e?.message));
        });
        await step('a quick link: the payer\'s amount and reason go through; the page stays open; recipient credited', async () => {
            const r = await payLinkService.payWithWallet(ctx, { username: `zzbiz${stamp}`, amount: 25.5, purpose: 'Lunch order' });
            const sweepsBefore = sweeps.length;
            must(r.status === 'paid' && r.amount === 25.5 && r.fee === 0 && r.total === 25.5, JSON.stringify(r));
            must(lastRequisition.estimated_total === 25.5 && lastRequisition.items.length === 1 && sweeps.length === sweepsBefore, 'a quick link carries no MoneyWise fee');
            const { data: inflow } = await supabase.from('cashbook_entries').select('debit').eq('organization_id', biz.id).eq('external_reference', r.reference!);
            must((inflow || []).length === 1 && Number((inflow as any)[0].debit) === 25.5, JSON.stringify(inflow));
            const { data: req } = await supabase.from('requisitions').select('description').eq('id', r.requisitionId).maybeSingle();
            must((req as any).description === 'Lunch order', JSON.stringify(req));
        });
        await step('a transfer still pending at Lenco is reported as processing; the link stays locked and unpaid until it is confirmed', async () => {
            lencoStatus = 'pending';
            const t = await mkLink();
            const r = await payLinkService.payWithWallet(ctx, { token: t });
            must(r.status === 'processing', JSON.stringify(r));
            const { data: link } = await supabase.from('payment_links').select('status').eq('token', t).maybeSingle();
            must((link as any).status === 'ACTIVE', 'must not be marked paid before confirmation');
            const again = await refusal(payLinkService.payWithWallet(ctx, { token: t }));
            must(again?.code === 'LOCKED', `second payer must be told it's in progress: ${again?.code}`);
            // Lenco confirms later (the poller credits the recipient, which settles the link):
            lencoStatus = 'successful';
            await payLinkService.finalizeByReference(r.reference!);
            const { data: after } = await supabase.from('payment_links').select('status').eq('token', t).maybeSingle();
            must((after as any).status === 'PAID', 'settles once confirmed');
            await payLinkService.finalizeByReference(r.reference!);   // a repeat is harmless
            must(sweeps.filter((x) => x.reference === `SPLIT-${r.reference}`).length === 1, 'the fee is forwarded exactly once, however many times it settles')
            const { data: inflow } = await supabase.from('cashbook_entries').select('id').eq('organization_id', biz.id).eq('external_reference', r.reference!);
            must((inflow || []).length === 1, 'credited exactly once');
        });
        await step('the balance check includes the fee: a K495 link needs K504.90, so K500 is not enough', async () => {
            const t = await mkLink({ amount: 495 });
            const e = await refusal(payLinkService.payWithWallet(ctx, { token: t }));
            must(e?.code === 'INSUFFICIENT' && /MoneyWise fee/.test(e.message) && e.message.includes('504.90'), `${e?.code}: ${e?.message}`);
        });
        await step('the fee tiers match the public pay pages (shared calculatePlatformFee)', async () => {
            const cases: [number, number][] = [[50, 1.25], [100, 2.5], [101, 2.02], [500, 10], [501, 9.02], [750, 13.5], [751, 11.26], [2500, 37.5], [2501, 25.01], [5000, 50], [5001, 45.01], [7500, 67.5], [7501, 75], [50000, 75]];
            for (const [amt, fee] of cases) must(calculatePlatformFee(amt) === fee, `K${amt} → ${calculatePlatformFee(amt)}, expected ${fee}`);
        });
        await step('a business that can\'t receive MoneyWise payments is refused', async () => {
            const { data: l } = await supabase.from('payment_links').insert({ organization_id: noLenco.id, wallet_id: noLenco.walletId, token: `zznl${stamp}`, customer_name: 'x', customer_phone: '0971111111', amount: 10, status: 'ACTIVE' }).select('token').single();
            const e = await refusal(payLinkService.payWithWallet(ctx, { token: (l as any).token }));
            must(e?.code === 'UNAVAILABLE', JSON.stringify(e?.message));
        });
    } finally {
        (internalCall as any).callHandler = original;
        L.getTransferStatus = savedLenco.st; L.transferToLencoMerchant = savedLenco.tx;
        const orgs = [payer.id, biz.id, noLenco.id];
        const { data: refs } = await supabase.from('app_settings').select('key').or('key.like.paylink:%,key.like.paylink-lock:%,key.like.mwpay:MWPAY-%');
        for (const org of orgs) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je || []).map((j: any) => j.id);
            for (let i = 0; i < ids.length; i += 100) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 100));
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
        }
        const { data: reqs } = await supabase.from('requisitions').select('id').in('organization_id', orgs);
        for (const r of reqs || []) {
            const id = (r as any).id;
            await supabase.from('app_settings').delete().eq('key', `mwpay:MWPAY-${id.slice(0, 8)}`).then(() => undefined);
            await supabase.from('requisition_messages').delete().eq('requisition_id', id);
            await supabase.from('line_items').delete().eq('requisition_id', id);
            await supabase.from('disbursements').delete().eq('requisition_id', id);
            await supabase.from('requisitions').delete().eq('id', id);
        }
        await supabase.from('product_sales').delete().eq('organization_id', biz.id);
        await supabase.from('payment_links').delete().in('organization_id', orgs);
        await supabase.from('products').delete().eq('organization_id', biz.id);
        for (const org of orgs) {
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            await supabase.from('accounts').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
        }
        void refs;
        console.log('\n(test organizations removed)');
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
