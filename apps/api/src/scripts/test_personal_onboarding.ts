/**
 * Personal onboarding (PERSONAL_V2) rule checks. Run: npm run test:onboarding
 *
 * Also checks the API's copy of the step keys and required flags against packages/core/src/onboarding/personalSteps.ts,
 * which the app uses to drive the wizard.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
    PERSONAL_STEP_KEYS, REQUIRED_PERSONAL_STEPS, normaliseNamePart, validateDateOfBirth, checkStepTransition,
    missingRequiredSteps, parseStoredSteps, isDefaultWorkspaceName, isPersonalSignup, onboardingSeedRow,
} from '../services/personalOnboarding/steps';
import { parseMoney, walletName, holdingAccountName, providerByCode, findingsFromEmails, PROVIDERS } from '../services/personalOnboarding/money';
import { parseZambianMobile, hashOtp, checkOtp, resendWait, cleanIntents, isAvatarPreset, OTP_MAX_ATTEMPTS } from '../services/personalOnboarding/phone';

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// ── Parity with core ────────────────────────────────────────────────────────
check('step keys and required flags match core', () => {
    const corePath = [
        path.resolve(__dirname, '../../../../packages/core/src/onboarding/personalSteps.ts'),
        path.resolve(__dirname, '../../../packages/core/src/onboarding/personalSteps.ts'),
    ].find((p) => fs.existsSync(p));
    assert.ok(corePath, 'core personalSteps.ts not found');
    const src = fs.readFileSync(corePath!, 'utf8');
    const defs = [...src.matchAll(/key: '([a-z_]+)', chapter: '[a-z]+', required: (true|false)/g)].map((m) => ({ key: m[1], required: m[2] === 'true' }));
    assert.deepStrictEqual(defs.map((d) => d.key), [...PERSONAL_STEP_KEYS]);
    assert.deepStrictEqual(defs.filter((d) => d.required).map((d) => d.key), REQUIRED_PERSONAL_STEPS);
});

// ── Names ───────────────────────────────────────────────────────────────────
const name = (s: unknown) => { const r = normaliseNamePart(s); return 'value' in r ? r.value : `ERR:${r.error}`; };
check('names are trimmed and title-cased when typed all lower or all upper', () => {
    assert.strictEqual(name('  chanda  '), 'Chanda');
    assert.strictEqual(name('MWALE'), 'Mwale');
    assert.strictEqual(name('mary   jane'), 'Mary Jane');
    assert.strictEqual(name("o'brien-banda"), "O'Brien-Banda");
});
check('deliberate mixed casing is kept', () => {
    assert.strictEqual(name('McDonald'), 'McDonald');
    assert.strictEqual(name('de Souza'), 'de Souza');
});
check('empty, too long and non-letter names are rejected', () => {
    assert.ok(name('').startsWith('ERR'));
    assert.ok(name('   ').startsWith('ERR'));
    assert.ok(name(undefined).startsWith('ERR'));
    assert.ok(name('x'.repeat(51)).startsWith('ERR'));
    assert.ok(name('K1000').startsWith('ERR'));
    assert.ok(name('-Banda').startsWith('ERR'));
});
check('accented letters are accepted', () => assert.strictEqual(name('josé'), 'José'));

// ── Date of birth ───────────────────────────────────────────────────────────
const today = new Date(Date.UTC(2026, 10, 21));
const dob = (s: unknown) => validateDateOfBirth(s, today);
check('valid date returns age, birthday not yet reached counts one less', () => {
    assert.deepStrictEqual(dob('2000-11-21'), { iso: '2000-11-21', age: 26 });
    assert.deepStrictEqual(dob('2000-11-22'), { iso: '2000-11-22', age: 25 });
    assert.deepStrictEqual(dob('2008-11-22'), { iso: '2008-11-22', age: 17 });
});
check('impossible, future, today and too-old dates are rejected', () => {
    for (const bad of ['2001-02-29', '2000-13-01', '2026-11-21', '2027-01-01', '1900-01-01', '21/11/2000', '', null]) {
        assert.ok('error' in dob(bad), `expected error for ${bad}`);
    }
    assert.ok('iso' in dob('2000-02-29'), 'leap day in a leap year is fine');
});

// ── Transitions ─────────────────────────────────────────────────────────────
check('required steps cannot be skipped; optional can', () => {
    assert.ok('error' in checkStepTransition('name', 'skipped'));
    assert.ok('error' in checkStepTransition('dob', 'skipped'));
    assert.deepStrictEqual(checkStepTransition('gmail', 'skipped'), { state: 'skipped' });
    assert.deepStrictEqual(checkStepTransition('name', 'done'), { state: 'done' });
    assert.ok('error' in checkStepTransition('gmail', 'later'));
});
check('completion needs every required step done', () => {
    const at = '2026-11-21T00:00:00Z';
    assert.deepStrictEqual(missingRequiredSteps({}), ['name', 'dob']);
    assert.deepStrictEqual(missingRequiredSteps({ name: { state: 'done', at } }), ['dob']);
    assert.deepStrictEqual(missingRequiredSteps({ name: { state: 'done', at }, dob: { state: 'done', at }, gmail: { state: 'skipped', at } }), []);
});
check('stored steps: unknown keys and bad states dropped', () => {
    const parsed = parseStoredSteps({ name: { state: 'done', at: 'x' }, bogus: { state: 'done' }, gmail: { state: 'maybe' }, dob: null });
    assert.deepStrictEqual(Object.keys(parsed), ['name']);
    assert.deepStrictEqual(parseStoredSteps(null), {});
    assert.deepStrictEqual(parseStoredSteps('[]'), {});
});

// ── Workspace naming / sign-up type ─────────────────────────────────────────
check('default workspace names are recognised; chosen names are not', () => {
    assert.ok(isDefaultWorkspaceName("Kim's Workspace"));
    assert.ok(isDefaultWorkspaceName('Kim’s Workspace 3'));
    assert.ok(!isDefaultWorkspaceName('Kim Family Budget'));
    assert.ok(!isDefaultWorkspaceName("Kim's Workspace Ltd"));
    assert.ok(!isDefaultWorkspaceName(null));
});
check('email sign-up: personal from account type, else from the default name', () => {
    assert.ok(isPersonalSignup('INDIVIDUAL', 'Anything'));
    assert.ok(!isPersonalSignup('BUSINESS', "Kim's Workspace"));
    assert.ok(isPersonalSignup(undefined, "Kim's Workspace"));
    assert.ok(!isPersonalSignup(undefined, 'Blue Opus'));
});

// ── Seeding ─────────────────────────────────────────────────────────────────
check('seed row only carries flow when V2 is on and the org is personal', () => {
    const prev = process.env.PERSONAL_ONBOARDING_V2;
    delete process.env.PERSONAL_ONBOARDING_V2;
    assert.strictEqual(onboardingSeedRow('o', true).flow, undefined);
    process.env.PERSONAL_ONBOARDING_V2 = '1';
    assert.strictEqual(onboardingSeedRow('o', true).flow, 'PERSONAL_V2');
    assert.strictEqual(onboardingSeedRow('o', false).flow, undefined);
    if (prev === undefined) delete process.env.PERSONAL_ONBOARDING_V2; else process.env.PERSONAL_ONBOARDING_V2 = prev;
});

// ── Phone ───────────────────────────────────────────────────────────────────
check('Zambian mobile numbers in every common format', () => {
    for (const raw of ['0971234567', '+260971234567', '260 97 123 4567', '00260971234567', '971234567', '097-123-4567']) {
        const p = parseZambianMobile(raw);
        assert.ok('e164' in p, `expected ok for ${raw}`);
        assert.strictEqual((p as any).e164, '+260971234567');
        assert.strictEqual((p as any).national, '0971234567');
    }
});
check('network from the second digit', () => {
    const net = (r: string) => (parseZambianMobile(r) as any).network;
    assert.strictEqual(net('0961234567'), 'MTN');
    assert.strictEqual(net('0761234567'), 'MTN');
    assert.strictEqual(net('0971234567'), 'AIRTEL');
    assert.strictEqual(net('0771234567'), 'AIRTEL');
    assert.strictEqual(net('0951234567'), 'ZAMTEL');
    assert.strictEqual(net('0751234567'), 'ZAMTEL');
    assert.strictEqual(net('0981234567'), null);
});
check('landlines, short and long numbers are rejected', () => {
    for (const bad of ['0211234567', '097123456', '09712345678', 'abc', '', '+1 555 123 4567']) {
        assert.ok('error' in parseZambianMobile(bad), `expected error for ${bad}`);
    }
});
check('one-time code: right, wrong, lock, expiry', () => {
    const now = Date.UTC(2026, 10, 21, 10, 0, 0);
    const base = { phone: '+260971234567', code_hash: hashOtp('u1', '123456'), attempts: 0, sent_at: new Date(now).toISOString(), expires_at: new Date(now + 600_000).toISOString(), locked_until: null };
    assert.deepStrictEqual(checkOtp('u1', base, '123456', now).result, { ok: true });
    assert.deepStrictEqual(checkOtp('u1', base, '12 34 56', now).result, { ok: true }, 'spaces ignored');
    assert.strictEqual((checkOtp('u2', base, '123456', now).result as any).reason, 'wrong', 'hash is per user');
    const wrong = checkOtp('u1', base, '000000', now);
    assert.strictEqual((wrong.result as any).attemptsLeft, OTP_MAX_ATTEMPTS - 1);
    const last = checkOtp('u1', { ...base, attempts: OTP_MAX_ATTEMPTS - 1 }, '000000', now);
    assert.strictEqual((last.result as any).reason, 'locked');
    assert.ok(last.next?.locked_until);
    assert.strictEqual((checkOtp('u1', { ...base, locked_until: last.next!.locked_until! }, '123456', now + 1000).result as any).reason, 'locked', 'locked even with the right code');
    assert.strictEqual((checkOtp('u1', base, '123456', now + 600_001).result as any).reason, 'expired');
    assert.strictEqual((checkOtp('u1', null, '123456', now).result as any).reason, 'none');
});
check('resend waits 30 s, longer while locked', () => {
    const now = Date.UTC(2026, 10, 21, 10, 0, 0);
    const p = { phone: 'x', code_hash: 'x', attempts: 0, sent_at: new Date(now - 10_000).toISOString(), expires_at: new Date(now + 1).toISOString(), locked_until: null };
    assert.strictEqual(resendWait(null, now), 0);
    assert.strictEqual(resendWait(p, now), 20);
    assert.strictEqual(resendWait({ ...p, sent_at: new Date(now - 31_000).toISOString() }, now), 0);
    assert.strictEqual(resendWait({ ...p, locked_until: new Date(now + 300_000).toISOString() }, now), 300);
});
check('intents and avatar presets are whitelisted', () => {
    assert.deepStrictEqual(cleanIntents(['save', 'save', 'hack', 'pay_bills']), ['save', 'pay_bills']);
    assert.deepStrictEqual(cleanIntents('save'), []);
    assert.ok(isAvatarPreset('preset:1') && isAvatarPreset('preset:8'));
    assert.ok(!isAvatarPreset('preset:9') && !isAvatarPreset('https://x') && !isAvatarPreset(null));
});

// ── Money ───────────────────────────────────────────────────────────────────
check('amounts: commas, K prefix, decimals; negatives and junk rejected', () => {
    const v = (r: unknown) => { const x = parseMoney(r); return 'value' in x ? x.value : 'ERR'; };
    assert.strictEqual(v('1,320.50'), 1320.5);
    assert.strictEqual(v('K 600'), 600);
    assert.strictEqual(v('ZMW250'), 250);
    assert.strictEqual(v(0), 0);
    assert.strictEqual(v(12.34), 12.34);
    for (const bad of ['-5', '12.345', 'abc', '', -1, 12.345, 1e11, '99999999999']) assert.strictEqual(v(bad), 'ERR', `expected error for ${bad}`);
});
check('wallet names: nickname wins, else provider, else custom, else Cash', () => {
    assert.strictEqual(walletName(providerByCode('MTN'), ''), 'MTN MoMo');
    assert.strictEqual(walletName(providerByCode('MTN'), '  Work   line '), 'Work line');
    assert.strictEqual(walletName(undefined, '', 'Chilimba'), 'Chilimba');
    assert.strictEqual(walletName(undefined, '', ''), 'Cash');
});
check('holding account names carry the kind word (Grow buckets by name)', () => {
    assert.strictEqual(holdingAccountName('savings', 'Laptop fund'), 'Laptop fund (Savings)');
    assert.strictEqual(holdingAccountName('savings', 'Zanaco savings'), 'Zanaco savings');
    assert.strictEqual(holdingAccountName('investments', ''), 'Investment');
    assert.strictEqual(holdingAccountName('loan', 'Car loan'), 'Car loan');
});
check('provider codes match the shared reference list', () => {
    const coreRef = fs.readFileSync([
        path.resolve(__dirname, '../../../../packages/core/src/reference/providers.ts'),
        path.resolve(__dirname, '../../../packages/core/src/reference/providers.ts'),
    ].find((p) => fs.existsSync(p))!, 'utf8');
    for (const p of PROVIDERS) assert.ok(coreRef.includes(`code: '${p.code}'`), `core providers.ts is missing ${p.code}`);
});
check('Gmail findings: providers, bills with latest amount, newest bank statement, 90-day window', () => {
    const now = Date.UTC(2026, 10, 21);
    const d = (days: number) => new Date(now - days * 86400_000).toISOString();
    const f = findingsFromEmails([
        { id: 'a', from_address: 'alerts@zanaco.co.zm', subject: 'Debit alert', received_at: d(2) },
        { id: 'b', from_address: 'noreply@stanbic.com', subject: 'Your October statement', received_at: d(10), attachments: [{ filename: 'Statement_Oct.pdf' }] },
        { id: 'c', from_address: 'eStatements@zanaco.co.zm', subject: 'E-statement', received_at: d(3), attachments: [{ filename: 'statement.pdf' }] },
        { id: 'd', from_address: 'billing@dstv.com', subject: 'Your DStv payment', received_at: d(20), intent_amount: 540 },
        { id: 'e', from_address: 'billing@dstv.com', subject: 'Your DStv payment', received_at: d(50), intent_amount: 500 },
        { id: 'f', from_address: 'info@netflix.com', subject: 'Receipt', received_at: d(5) },
        { id: 'g', from_address: 'alerts@fnb.co.zm', subject: 'Alert', received_at: d(120) },
        { id: 'h', from_address: 'friend@gmail.com', subject: 'Lunch?', received_at: d(1) },
    ], now);
    assert.deepStrictEqual(f.providers.sort(), ['STANBIC', 'ZANACO']);
    assert.deepStrictEqual(f.bills.find((b) => b.key === 'dstv')?.amount, 540);
    assert.ok(f.bills.find((b) => b.key === 'netflix'));
    assert.strictEqual(f.statement?.emailId, 'c');
    assert.strictEqual(f.statement?.provider, 'ZANACO');
});

console.log(`\n${passed} checks passed`);
