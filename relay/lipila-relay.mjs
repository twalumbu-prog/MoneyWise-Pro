/**
 * Lipila relay: a tiny forwarder that runs on a server with a fixed public IP address, so Lipila payouts come from the one address that is
 * whitelisted on the wallet. The MoneyWise API calls it (over HTTPS, with a shared secret) instead of calling Lipila directly.
 *
 * It is deliberately NOT an open proxy:
 *  - every request needs the shared secret in `x-relay-secret` (RELAY_SECRET);
 *  - it only forwards to Lipila's two hosts, and only paths under /api/v1/disbursements/ and /api/v1/merchants/balance;
 *  - it keeps no logs of keys or bodies (method, path and status only).
 *
 * No dependencies. Needs Node 18 or newer. Run: RELAY_SECRET=... node lipila-relay.mjs   (listens on 127.0.0.1:8080; put HTTPS in front, see docs/lipila-relay.md)
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const SECRET = process.env.RELAY_SECRET || '';
if (SECRET.length < 24) { console.error('Set RELAY_SECRET to a long random value (24+ characters).'); process.exit(1); }

const UPSTREAM = { production: 'https://blz.lipila.io', sandbox: 'https://api.lipila.dev' };
const ALLOWED = [/^\/api\/v1\/disbursements\/(mobile-money|bank|check-status)(\?|$)/, /^\/api\/v1\/merchants\/balance$/];

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const reply = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
    try {
        if (req.url === '/health') return reply(res, 200, { ok: true });
        if (!same(req.headers['x-relay-secret'] ?? '', SECRET)) return reply(res, 401, { message: 'Unauthorized' });
        const path = req.url || '';
        if (!ALLOWED.some((re) => re.test(path))) return reply(res, 403, { message: 'This path is not relayed.' });
        if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, { message: 'Method not allowed' });
        const base = UPSTREAM[String(req.headers['x-lipila-env'] || 'sandbox')];
        if (!base) return reply(res, 400, { message: 'Unknown environment.' });
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > 64 * 1024) return reply(res, 413, { message: 'Too large' }); chunks.push(c); }
        const headers = { accept: 'application/json', 'x-api-key': String(req.headers['x-api-key'] || '') };
        if (req.method === 'POST') headers['content-type'] = 'application/json';
        const up = await fetch(base + path, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(25_000) });
        const text = await up.text();
        console.log(`${req.method} ${path.split('?')[0]} -> ${up.status}`);
        res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json' });
        res.end(text);
    } catch (e) {
        console.error('relay error:', e?.name || e);
        // The API treats a 5xx from a payout as "outcome unknown" and checks by reference, never resending blindly.
        reply(res, 502, { message: 'The relay could not reach Lipila.' });
    }
}).listen(PORT, HOST, () => console.log(`Lipila relay listening on ${HOST}:${PORT}`));
