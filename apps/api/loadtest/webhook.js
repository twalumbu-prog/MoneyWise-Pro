// k6 load test for the Meta webhook (spec P1, P2, P3). STAGING ONLY: every request stores a message.
//
//   k6 run -e BASE_URL=https://<staging-api> -e APP_SECRET=<meta app secret> -e PHONE_IDS=111,222 -e SCENARIO=steady apps/api/loadtest/webhook.js
//
// SCENARIO: steady = 50 requests/s for 10 minutes (P1). burst = 2,000 messages in 60 s to the first number (P2).
// PHONE_IDS must be connected numbers, or requests are discarded without testing storage. P3's duplicates run in both.
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';

const SCENARIOS = {
    steady: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: '10m', preAllocatedVUs: 100 },
    burst: { executor: 'constant-arrival-rate', rate: 34, timeUnit: '1s', duration: '60s', preAllocatedVUs: 80 },
};
const name = __ENV.SCENARIO || 'steady';

export const options = {
    scenarios: { [name]: SCENARIOS[name] },
    thresholds: { http_req_duration: ['p(95)<1000'], http_req_failed: ['rate==0'] },
};

const phones = (__ENV.PHONE_IDS || '').split(',').filter(Boolean);
const CHATTER = ['Hello', 'ok thanks', 'Good morning', 'See you later'];

function deliver(body) {
    const signature = crypto.hmac('sha256', __ENV.APP_SECRET, body, 'hex');
    return http.post(`${__ENV.BASE_URL}/integrations/meta/webhook`, body, {
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${signature}` },
    });
}

export default function () {
    const phone = name === 'burst' ? phones[0] : phones[Math.floor(Math.random() * phones.length)];
    const id = `load-${__VU}-${__ITER}`;
    const text = Math.random() < 0.8 ? CHATTER[__ITER % CHATTER.length] : `sent K${100 + (__ITER % 900)}`;
    const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: {
            metadata: { phone_number_id: phone },
            contacts: [{ wa_id: `26097${__VU}`, profile: { name: 'Load Test' } }],
            messages: [{ id, from: `26097${__VU}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
        } }] }],
    });
    check(deliver(body), { 'accepted': (r) => r.status === 200 });
    // P3: one in ten is delivered twice; the second must change nothing.
    if (__ITER % 10 === 0) check(deliver(body), { 'duplicate accepted': (r) => r.status === 200 });
}
