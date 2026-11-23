/**
 * Blue Opus share offers: the post-money maths, the checks on an offer, the round's limits, withdrawing, and Blue Opus's countersign / paid /
 * decline steps. Real service against the live database, with throwaway people; the round's settings are changed for a moment and put back.
 * Run: npx tsx src/scripts/test_share_round.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as S from '../services/shareRound.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'OK'; } catch (e: any) { return e?.code ?? e?.message ?? 'ERR'; } };

(async () => {
    // ── the maths (post-money K9,000,000)
    check('K900,000 buys 10% at a K9,000,000 post-money valuation', S.ownershipPct(900_000, 9_000_000) === 10);
    check('K90,000 is 1%, and one percent costs K90,000', S.ownershipPct(90_000, 9_000_000) === 1 && S.pricePerPercent(9_000_000) === 90_000);
    check('K1,000 buys 0.011111% (6 decimals)', S.ownershipPct(1000, 9_000_000) === 0.011111);
    check('the agreement states the valuation, the percentage for an amount, and that signing is only an offer', (() => { const c = S.agreementClauses({ enabled: true, postMoney: 9_000_000, currency: 'ZMW', minAmount: 1000, maxAmount: null, maxTotal: null, agreementVersion: 'v', inviteOnly: false, legalApprovedVersion: null, maxInvestors: null }, 450_000); const all = c.map((x) => x.text).join(' '); return /K9,000,000 post-money/.test(all) && /K450,000 buys 5%/.test(all) && /binding only when the Company countersigns/.test(all) && /lose all of the money/.test(all); })());

    const { data: orig } = await supabase.from('app_settings').select('value, description').eq('key', 'blue_opus_round').maybeSingle();
    let cur: Record<string, unknown> = { ...(orig?.value ?? {}) };   // each change builds on the last
    const set = async (patch: Record<string, unknown>) => { cur = { ...cur, ...patch }; await supabase.from('app_settings').upsert({ key: 'blue_opus_round', value: cur, description: orig?.description ?? 'Blue Opus share round', updated_at: new Date().toISOString() }); };
    const users: string[] = [];
    const person = () => { const id = randomUUID(); users.push(id); return { id, organization_id: null as string | null }; };
    const DECL = { invited: true, adult: true, canAffordLoss: true, ownDecision: true };
    const good = (over: Record<string, unknown> = {}) => ({ amount: 5000, fullName: 'Test Person', acceptedName: 'Test Person', agree: true, declarations: DECL, ...over });
    try {
        const VERSION = String(orig?.value?.agreementVersion ?? S.AGREEMENT_VERSION_DEFAULT);
        await set({ enabled: true, postMoney: 9_000_000, minAmount: 1000, maxAmount: null, maxTotal: null, inviteOnly: false, legalApprovedVersion: VERSION, maxInvestors: null });
        const u = person();
        const t = (await S.terms()) as any;
        check('the terms carry the valuation, limits and clauses', t.round.postMoney === 9_000_000 && t.round.minAmount === 1000 && t.pricePerPercent === 90_000 && t.clauses.length >= 6);

        // validation
        check('below the minimum is refused', await code(() => S.createOffer(u, good({ amount: 500 }), null)) === 'MIN');
        check('zero, negative and text amounts are refused', ['AMOUNT', 'AMOUNT', 'AMOUNT'].join() === [await code(() => S.createOffer(u, good({ amount: 0 }), null)), await code(() => S.createOffer(u, good({ amount: -5 }), null)), await code(() => S.createOffer(u, good({ amount: 'abc' }), null))].join());
        check('a single name is refused (full legal name needed)', await code(() => S.createOffer(u, good({ fullName: 'Madonna', acceptedName: 'Madonna' }), null)) === 'NAME');
        check('missing a declaration is refused', await code(() => S.createOffer(u, good({ declarations: { ...DECL, canAffordLoss: false } }), null)) === 'DECLARATIONS' && await code(() => S.createOffer(u, good({ declarations: undefined }), null)) === 'DECLARATIONS');
        check('not ticking "I agree" is refused', await code(() => S.createOffer(u, good({ agree: false }), null)) === 'AGREE');
        check('a typed signature that does not match the name is refused', await code(() => S.createOffer(u, good({ acceptedName: 'Someone Else' }), null)) === 'SIGNATURE');
        check('an absurdly large online offer (over half the company) is refused', await code(() => S.createOffer(u, good({ amount: 5_000_000 }), null)) === 'MAX');

        // a good offer
        const o = await S.createOffer(u, good({ amount: 450_000, acceptedName: '  test   PERSON ' }), '10.0.0.1') as any;
        check('a good offer is saved at the round\'s valuation with its percentage (5%), the version and a signature time', o.status === 'SUBMITTED' && Number(o.ownership_pct) === 5 && Number(o.post_money) === 9_000_000 && o.agreement_version === t.round.agreementVersion && !!o.accepted_at && o.accepted_ip === '10.0.0.1', JSON.stringify({ s: o.status, p: o.ownership_pct }));
        check('the signature ignores case and extra spaces', o.accepted_name === 'test PERSON');
        check('the person sees it, and only they do', (await S.myOffers(u.id)).length === 1 && (await S.myOffers(randomUUID())).length === 0);

        // later change to the valuation does not change a signed offer
        await set({ postMoney: 12_000_000 });
        const still = (await S.myOffers(u.id))[0] as any;
        check('changing the valuation later does not change a signed offer', Number(still.post_money) === 9_000_000 && Number(still.ownership_pct) === 5);
        await set({ postMoney: 9_000_000 });

        // limits
        await set({ maxAmount: 100_000 });
        check('a per-person maximum is enforced', await code(() => S.createOffer(person(), good({ amount: 200_000 }), null)) === 'MAX');
        // Real offers from real people may already be in the round: the cap is set relative to them so the numbers below are about THIS test's offers.
        const { data: realOffers } = await supabase.from('share_offers').select('amount, user_id').in('status', ['SUBMITTED', 'COUNTERSIGNED', 'PAID']);
        const realTotal = (realOffers ?? []).filter((x: any) => !users.includes(x.user_id)).reduce((a: number, x: any) => a + Number(x.amount), 0);
        await set({ maxAmount: null, maxTotal: realTotal + 500_000 });
        const before = ((await S.terms()) as any).remaining;
        check('with a total cap, what is left is shown (K50,000)', before === 50_000, String(before));
        check('an offer that would go over the cap is refused', await code(() => S.createOffer(person(), good({ amount: 60_000 }), null)) === 'FULL');
        check('one that fits is accepted', await code(() => S.createOffer(person(), good({ amount: 50_000 }), null)) === 'OK');
        await set({ maxTotal: null });
        await set({ enabled: false });
        check('a closed round refuses offers', await code(() => S.createOffer(person(), good(), null)) === 'CLOSED');
        await set({ enabled: true });

        // at most three open offers per person
        const busy = person();
        for (let i = 0; i < 3; i++) await S.createOffer(busy, good({ amount: 1000 }), null);
        check('a person can have three offers open, not four', await code(() => S.createOffer(busy, good({ amount: 1000 }), null)) === 'TOO_MANY');

        // withdraw
        const mine = (await S.myOffers(busy.id)) as any[];
        await S.withdraw(busy.id, mine[0].id);
        check('a waiting offer can be withdrawn, and then a new one is allowed', (await S.myOffers(busy.id)).some((x: any) => x.status === 'WITHDRAWN') && await code(() => S.createOffer(busy, good({ amount: 1000 }), null)) === 'OK');
        check('nobody else can withdraw it, and it can\'t be withdrawn twice', await code(() => S.withdraw(randomUUID(), mine[1].id)) === 'NOT_WAITING' && await code(() => S.withdraw(busy.id, mine[0].id)) === 'NOT_WAITING');

        // Blue Opus's steps
        check('an offer can\'t jump from submitted to paid', await code(() => S.adminDecide(o.id, 'PAID', null)) === 'BAD_STEP');
        const cs = await S.adminDecide(o.id, 'COUNTERSIGNED', 'Pay to the account we emailed.') as any;
        check('Blue Opus countersigns with a note', cs.status === 'COUNTERSIGNED' && cs.note === 'Pay to the account we emailed.' && !!cs.decided_at);
        check('a countersigned offer can no longer be withdrawn by the person', await code(() => S.withdraw(u.id, o.id)) === 'NOT_WAITING');
        const paid = await S.adminDecide(o.id, 'PAID', null) as any;
        check('then it is marked paid', paid.status === 'PAID');
        check('a paid offer is final', await code(() => S.adminDecide(o.id, 'DECLINED', null)) === 'BAD_STEP');
        const dec = await S.adminDecide(mine[1].id, 'DECLINED', 'Not at this time.') as any;
        check('an offer can be declined', dec.status === 'DECLINED');
        check('an unknown offer is a 404', await code(() => S.adminDecide(randomUUID(), 'COUNTERSIGNED', null)) === 'NOT_FOUND');
        const list = await S.adminList();
        check('Blue Opus sees the offers with running totals', list.offers.length >= 3 && list.totals.paid >= 450_000, JSON.stringify(list.totals));

        // ── invite-only and the lawyer gate
        const admin = person(); const guest = person(); const guest2 = person(); const stranger = person();
        await set({ inviteOnly: true });
        const hidden = (await S.terms(false)) as any;
        check('without an invitation nothing about the offer is shown (no valuation, no agreement)', hidden.access === false && hidden.round === undefined && hidden.clauses === undefined && JSON.stringify(hidden).indexOf('9000000') === -1, JSON.stringify(hidden));
        check('a stranger cannot make an offer', await code(() => S.createOffer(stranger, good(), null)) === 'NOT_INVITED');
        check('Blue Opus can see and test the page itself', ((await S.terms(await S.hasAccess(admin.id, true))) as any).access === true);
        const inv = await S.adminCreateInvite(admin.id, { name: 'Guest One', email: 'g1@example.com', expiresInDays: 7 }) as any;
        check('an invitation is a readable one-time code tied to a name', /^BO-[A-HJ-NP-Z2-9]{8}$/.test(inv.code) && inv.name === 'Guest One' && !!inv.expires_at && !inv.redeemed_by, inv.code);
        check('a person with no code has no access yet', (await S.hasAccess(guest.id)) === false);
        check('a wrong or badly formed code is refused', await code(() => S.redeemInvite(guest.id, 'BO-AAAAAAAA')) === 'BAD_CODE' && await code(() => S.redeemInvite(guest.id, 'hello')) === 'BAD_CODE' && await code(() => S.redeemInvite(guest.id, '')) === 'BAD_CODE');
        await S.redeemInvite(guest.id, ` ${inv.code.toLowerCase()} `);
        check('the right code (any case, with spaces) opens the offer for that account', (await S.hasAccess(guest.id)) === true && ((await S.terms(true)) as any).access === true);
        check('redeeming the same code again as the same person is fine', (await S.redeemInvite(guest.id, inv.code) as any).ok === true);
        check('the same code cannot be used by a second person', await code(() => S.redeemInvite(guest2.id, inv.code)) === 'BAD_CODE' && (await S.hasAccess(guest2.id)) === false);
        const offer1 = await S.createOffer(guest, good({ amount: 2000 }), null) as any;
        check('an invited person can make an offer; it records the declarations and the invite', offer1.status === 'SUBMITTED' && offer1.declarations?.canAffordLoss === true && offer1.invite_id === inv.id);

        // the lawyer gate
        await set({ legalApprovedVersion: null });
        check('no offers until a lawyer has approved the wording', await code(() => S.createOffer(guest, good({ amount: 2000 }), null)) === 'NOT_APPROVED');
        check('approval needs the name of the lawyer or firm', await code(() => S.adminSetLegalApproval(true, '  ')) === 'REVIEWER');
        await S.adminSetLegalApproval(true, 'Test Legal LLP');
        check('once approved, offers open again', await code(() => S.createOffer(guest, good({ amount: 2000 }), null)) === 'OK' && (await S.getRound()).legalApprovedVersion === VERSION);
        await set({ agreementVersion: 'changed-wording' });
        check('changing the wording (a new version) blocks offers until it is approved again', await code(() => S.createOffer(guest, good({ amount: 2000 }), null)) === 'NOT_APPROVED');
        await set({ agreementVersion: VERSION });
        await S.adminSetLegalApproval(false, null);
        check('the approval can be withdrawn', (await S.getRound()).legalApprovedVersion === null);
        await set({ legalApprovedVersion: VERSION });

        // revoke, expiry, limit
        await S.adminRevokeInvite(inv.id);
        check('revoking an invitation closes the offer for that person', (await S.hasAccess(guest.id)) === false && await code(() => S.createOffer(guest, good(), null)) === 'NOT_INVITED');
        check('a revoked code cannot be used', await code(() => S.redeemInvite(guest2.id, inv.code)) === 'BAD_CODE');
        const expired = await S.adminCreateInvite(admin.id, { name: 'Late Guest' }) as any;
        await supabase.from('share_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.id);
        check('an expired code cannot be used', await code(() => S.redeemInvite(guest2.id, expired.code)) === 'BAD_CODE');
        await set({ maxInvestors: 1 });
        const inv2 = await S.adminCreateInvite(admin.id, { name: 'Guest Two' }) as any; const inv3 = await S.adminCreateInvite(admin.id, { name: 'Guest Three' }) as any;
        await S.redeemInvite(guest2.id, inv2.code);
        check('a limit on the number of investors is enforced', await code(() => S.redeemInvite(stranger.id, inv3.code)) === 'FULL_LIST');
        await set({ maxInvestors: null });
        check('Blue Opus lists the invitations with who used them', (await S.adminListInvites()).filter((i: any) => i.created_by === admin.id).length >= 4);
        // guessing: only a few wrong tries an hour
        const guesser = person(); let last = '';
        for (let i = 0; i < 12; i++) last = await code(() => S.redeemInvite(guesser.id, 'BO-ZZZZZZZZ'));
        check('many wrong guesses are stopped', last === 'THROTTLED', last);
        await set({ inviteOnly: false });
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (orig) await supabase.from('app_settings').upsert({ key: 'blue_opus_round', value: orig.value, description: orig.description, updated_at: new Date().toISOString() });
        if (users.length) { await supabase.from('share_offers').delete().in('user_id', users); await supabase.from('share_invites').delete().in('created_by', users); }
        const { count } = await supabase.from('share_offers').select('id', { count: 'exact', head: true }).in('user_id', users);
        console.log(`cleanup: ${count ?? 0} test offers left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
