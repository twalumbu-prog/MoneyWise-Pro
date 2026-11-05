/**
 * Pure chat-capture checks: pre-filter sample, extraction validation, Meta webhook parsing, signature and token crypto
 * (spec U1, U2, U3, and samples of U4 and U5). Run: npm run test:capture-chat
 */
import assert from 'assert';
import crypto from 'crypto';
import { shouldExtract } from '../services/capture/capture.prefilter';
import { parseExtraction, amountAppearsInText, matchProducts } from '../services/capture/capture.extract';
import { parseWebhook, verifySignature, signConnectState, verifyConnectState, parseSignedRequest } from '../services/meta.service';
import { encryptToken, decryptToken } from '../lib/tokenCrypto';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ok  ${name}`); };

console.log('U4 pre-filter (sample; the 500-line labelled set needs real chats)');
test('keeps transaction lines', () => {
    for (const body of ['Sent you K450 for 2 chitenge', 'ZMW 1500.00 paid', 'nalipila 200', '1.5k done', 'I have deposited', 'send invoice please', 'price is 1,500'])
        assert.ok(shouldExtract({ type: 'text', body }), body);
});
test('drops chatter with no AI call', () => {
    for (const body of ['Hello', 'ok thanks', 'Good morning sir', '👍', "I'll take 2", 'See you at 5', 'Mukwai'])
        assert.ok(!shouldExtract({ type: 'text', body }), body);
});
test('drops stickers and reactions; keeps any attachment', () => {
    assert.ok(!shouldExtract({ type: 'sticker', body: null }));
    assert.ok(!shouldExtract({ type: 'reaction', body: 'K450' }));
    assert.ok(shouldExtract({ type: 'image', body: null, hasMedia: true }));
});

console.log('Extraction validation');
const good = { intent: 'PAYMENT_PROOF', direction: 'IN', amount: '450', currency: 'zmw', date: '2026-11-05', counterparty: 'Mary', line_items: [{ name: 'chitenge', qty: 2 }], payment_method: 'MOMO_PERSONAL', confidence: 1.4, evidence_summary: 'Sent K450' };
test('valid reply is normalised', () => {
    const x = parseExtraction(JSON.stringify(good))!;
    assert.strictEqual(x.amount, 450);
    assert.strictEqual(x.currency, 'ZMW');
    assert.strictEqual(x.confidence, 1);
    assert.strictEqual(x.line_items[0].qty, 2);
});
test('invalid JSON or unknown intent is rejected, never guessed', () => {
    assert.strictEqual(parseExtraction('not json'), null);
    assert.strictEqual(parseExtraction('{"intent":"TRANSFER_ALL"}'), null);
    assert.strictEqual(parseExtraction('null'), null);
});
test('bad fields fall back instead of passing through', () => {
    const x = parseExtraction(JSON.stringify({ ...good, amount: -5, date: 'tomorrow', direction: 'SIDEWAYS', payment_method: 'BITCOIN' }))!;
    assert.strictEqual(x.amount, null);
    assert.strictEqual(x.date, null);
    assert.strictEqual(x.direction, null);
    assert.strictEqual(x.payment_method, 'UNKNOWN');
});
test('amount must really be in the chat', () => {
    assert.ok(amountAppearsInText(450, 'sent K450'));
    assert.ok(amountAppearsInText(1500, 'K1,500'));
    assert.ok(amountAppearsInText(1500, 'ZMW 1500.00'));
    assert.ok(amountAppearsInText(1500, 'that is 1.5k'));
    assert.ok(!amountAppearsInText(50000, 'I sent you money'));
});
test('line items link to a product only when exactly one fits', () => {
    const products = [{ id: 'a', name: 'Chitenge' }, { id: 'b', name: 'Blue Shirt' }, { id: 'c', name: 'Red Shirt' }];
    const items = (name: string) => [{ name, qty: 1, unit_price: null, total: null, product_id: null }];
    assert.strictEqual(matchProducts(items('chitenge'), products)[0].product_id, 'a');
    assert.strictEqual(matchProducts(items('shirt'), products)[0].product_id, null);
});

console.log('U1 signature');
test('only the valid signature passes', () => {
    process.env.META_APP_SECRET = 'test-secret';
    const body = Buffer.from('{"a":1}');
    const sig = `sha256=${crypto.createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
    assert.ok(verifySignature(body, sig));
    assert.ok(!verifySignature(Buffer.from('{"a":2}'), sig));
    assert.ok(!verifySignature(body, undefined));
    assert.ok(!verifySignature(body, 'sha256=abc'));
    assert.ok(!verifySignature(undefined, sig));
});

console.log('Connect state and data-deletion request');
test('state round-trips and rejects tampering', () => {
    const state = signConnectState({ organizationId: 'org-a', userId: 'user-a' });
    assert.deepStrictEqual(verifyConnectState(state), { organizationId: 'org-a', userId: 'user-a' });
    const [payload, sig] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ o: 'org-b', u: 'user-a', e: Date.now() + 60_000 })).toString('base64url');
    assert.strictEqual(verifyConnectState(`${forged}.${sig}`), null);
    assert.strictEqual(verifyConnectState(payload), null);
    assert.strictEqual(verifyConnectState(undefined), null);
});
test('expired state is rejected', () => {
    const payload = Buffer.from(JSON.stringify({ o: 'org-a', u: 'user-a', e: Date.now() - 1 })).toString('base64url');
    const sig = crypto.createHmac('sha256', 'test-secret').update(payload).digest().toString('base64url');
    assert.strictEqual(verifyConnectState(`${payload}.${sig}`), null);
});
test('signed_request needs a valid signature', () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '123' })).toString('base64url');
    const sig = crypto.createHmac('sha256', 'test-secret').update(payload).digest().toString('base64url');
    assert.deepStrictEqual(parseSignedRequest(`${sig}.${payload}`), { userId: '123' });
    assert.strictEqual(parseSignedRequest(`abc.${payload}`), null);
    assert.strictEqual(parseSignedRequest(null), null);
});

console.log('U2 webhook parsing');
const wa = (messages: any[], extra: any = {}) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '260977000111', profile: { name: 'Mary' } }], messages, ...extra } }] }],
});
test('WhatsApp text', () => {
    const [m] = parseWebhook(wa([{ id: 'w1', from: '260977000111', timestamp: '1793800000', type: 'text', text: { body: 'sent K450' } }]));
    assert.strictEqual(m.body, 'sent K450');
    assert.strictEqual(m.contactName, 'Mary');
    assert.strictEqual(m.externalAccountId, '111');
});
test('WhatsApp image and document keep their media reference', () => {
    const [i, d] = parseWebhook(wa([
        { id: 'w2', from: '260977000111', timestamp: '1793800000', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'proof' } },
        { id: 'w3', from: '260977000111', timestamp: '1793800000', type: 'document', document: { id: 'm2', mime_type: 'application/pdf' } },
    ]));
    assert.strictEqual(i.mediaRef, 'm1');
    assert.strictEqual(i.body, 'proof');
    assert.strictEqual(d.mediaRef, 'm2');
});
test('status updates produce no messages', () => {
    assert.strictEqual(parseWebhook(wa([], { statuses: [{ id: 'w1', status: 'read' }] })).length, 0);
});
test('Messenger text, attachment and echo', () => {
    const out = parseWebhook({ object: 'page', entry: [{ id: 'p1', messaging: [
        { sender: { id: 's1' }, timestamp: 1793800000000, message: { mid: 'a', text: 'hi' } },
        { sender: { id: 's1' }, timestamp: 1793800000000, message: { mid: 'b', attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }] } },
        { sender: { id: 'p1' }, timestamp: 1793800000000, message: { mid: 'c', is_echo: true, text: 'ours' } },
    ] }] });
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[1].mediaRef, 'https://cdn/x.jpg');
});
test('Instagram maps to its own platform', () => {
    const [m] = parseWebhook({ object: 'instagram', entry: [{ id: 'g1', messaging: [{ sender: { id: 's2' }, timestamp: 1793800000000, message: { mid: 'i1', text: 'hello' } }] }] });
    assert.strictEqual(m.platform, 'INSTAGRAM');
});

console.log('U3 token crypto');
test('round trip, wrong key and tampering', () => {
    process.env.MESSAGING_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
    const enc = encryptToken('EAAtoken');
    assert.notStrictEqual(enc, 'EAAtoken');
    assert.strictEqual(decryptToken(enc), 'EAAtoken');
    const [iv, tag] = enc.split('.');
    assert.throws(() => decryptToken([iv, tag, Buffer.from('tampered').toString('base64')].join('.')));
    process.env.MESSAGING_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
    assert.throws(() => decryptToken(enc));
});

console.log(`\n${passed} chat capture checks passed`);
