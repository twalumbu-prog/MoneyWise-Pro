#!/usr/bin/env node
/**
 * One-shot triage seeder. Applies the porting decisions agreed in
 * docs/mobile-app/PLAN.md to every unit in the generated inventory, so the
 * parity check starts from a real baseline instead of 472 UNTRIAGED rows.
 *
 * Re-runnable: existing entries are preserved unless --force is passed, so
 * progress made by hand (PLANNED → IN_PROGRESS → DONE) is never clobbered.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const inv = JSON.parse(readFileSync(join(ROOT, 'docs/mobile-app/parity.inventory.json'), 'utf8'));
const STATUS = join(ROOT, 'docs/mobile-app/parity.status.json');
const force = process.argv.includes('--force');
const existing = JSON.parse(readFileSync(STATUS, 'utf8'));
const out = { ...existing };

const set = (key, state, phase, note) => {
    if (!force && existing[key] && existing[key].state !== 'UNTRIAGED') return;
    out[key] = { state, phase, note };
};

// ── Routes / screens ─────────────────────────────────────────────────────────
const ROUTE_PLAN = {
    '/login':               ['PLANNED', 'P0', 'Native auth screen; username-or-email resolve + password'],
    '/join':                ['PLANNED', 'P0', 'Join-org flow; reached via invite deep link'],
    '/reset-password':      ['PLANNED', 'P0', 'Must handle the Supabase recovery deep link'],
    '/':                    ['PLANNED', 'P0', 'HomeRedirect → role-based initial tab'],
    '/requisitions':        ['PLANNED', 'P1', 'Inbox tab — primary surface'],
    '/requisitions/new':    ['PLANNED', 'P1', 'MobileRequisitionWizard is the direct spec'],
    '/menu':                ['PLANNED', 'P1', 'Menu tab — hub for Other Services'],
    '/cashbook':            ['PLANNED', 'P2', 'Wallet tab — largest screen (2.8k LOC), 10 overlays'],
    '/sales/new':           ['PLANNED', 'P2', 'POS / New Sale'],
    '/approvals':           ['PLANNED', 'P3', ''],
    '/disbursements':       ['PLANNED', 'P3', 'Cashier queue + payout confirmation'],
    '/vouchers':            ['PLANNED', 'P3', ''],
    '/vouchers/:id':        ['PLANNED', 'P3', 'Voucher PDF must render server-side'],
    '/reporting':           ['PLANNED', 'P4', 'Charts → victory-native; exports → server-side'],
    '/intelligence':        ['PLANNED', 'P4', 'Streaming assistant — SSE needs expo/fetch'],
    '/settings':            ['PLANNED', 'P5', ''],
    '/products':            ['PLANNED', 'P5', 'Image upload → expo-image-picker'],
    '/audit':               ['PLANNED', 'P5', ''],
    '/schedules':           ['PLANNED', 'P5', ''],
    '/onboarding':          ['PLANNED', 'P5', 'Full signup wizard incl. wallet activation'],
    '/apps':                ['PLANNED', 'P6', ''],
    '/apps/payroll':        ['PLANNED', 'P6', ''],
    '/apps/payroll/run':    ['PLANNED', 'P6', 'Batch payroll — 30s ceiling applies'],
    '/invest':              ['PLANNED', 'P6', ''],
    '/invest/company/:id':  ['PLANNED', 'P6', ''],
    '/invest/product/:id':  ['PLANNED', 'P6', ''],
    // Customer-facing surfaces: these are consumed by the merchant's CUSTOMERS in
    // a browser, not by signed-in staff. The app deep-links out rather than porting.
    '/pay/:wallet_id':      ['WEB_ONLY', '—', 'Customer payment page; app shares the URL, never renders it'],
    '/pl/:token':           ['WEB_ONLY', '—', 'One-time payment link for customers'],
    '/privacy':             ['WEB_ONLY', '—', 'Linked out from Settings (store listing also links here)'],
    '/terms':               ['WEB_ONLY', '—', 'Linked out from Settings'],
    '/disconnect':          ['WEB_ONLY', '—', 'OAuth disconnect callback — browser only'],
};
for (const [path, [state, phase, note]] of Object.entries(ROUTE_PLAN)) set(`route:${path}`, state, phase, note);

// Screens inherit their route's decision; unrouted screens are dead code.
const SCREEN_BY_ROUTE = Object.fromEntries(inv.routes.map((r) => [r.component, r.path]));
const DEAD = { PublicPay: 'Unrouted legacy pay page (superseded by PublicPaymentLink)',
               QuickPay: 'Unrouted legacy', Dashboard: 'Unrouted legacy',
               StaffPortfolio: 'Unrouted legacy', ComingSoonPage: 'Unrouted stub' };
for (const s of inv.screens) {
    if (DEAD[s.name]) { set(`screen:${s.name}`, 'NOT_APPLICABLE', '—', DEAD[s.name]); continue; }
    const route = SCREEN_BY_ROUTE[s.name];
    const plan = route ? ROUTE_PLAN[route] : null;
    if (plan) set(`screen:${s.name}`, plan[0], plan[1], plan[2]);
    else set(`screen:${s.name}`, 'PLANNED', 'P6', 'Sub-screen reached from a parent route');
}

// ── Services: the whole layer moves to packages/core in the foundation phase ──
for (const svc of inv.services) {
    for (const m of svc.methods) {
        set(`service:${svc.name}.${m}`, 'PLANNED', 'P0',
            svc.touchesSupabaseDirectly ? 'Storage/direct-supabase calls need a native file adapter' : '');
    }
}

// ── Endpoints ────────────────────────────────────────────────────────────────
const ENDPOINT_PHASE = [
    [/^\/webhooks/,        'NOT_APPLICABLE', '—',  'Server-to-server (Lenco); no client consumes it'],
    [/^\/admin/,           'WEB_ONLY',       '—',  'Reconciliation console lives in apps/admin'],
    [/^\/auth/,            'PLANNED',        'P0', ''],
    [/^\/users/,           'PLANNED',        'P0', ''],
    [/^\/requisitions/,    'PLANNED',        'P1', ''],
    [/^\/departments/,     'PLANNED',        'P1', ''],
    [/^\/cashbook/,        'PLANNED',        'P2', ''],
    [/^\/lenco/,           'PLANNED',        'P2', ''],
    [/^\/accounts/,        'PLANNED',        'P2', ''],
    [/^\/vouchers/,        'PLANNED',        'P3', ''],
    [/^\/reports/,         'PLANNED',        'P4', ''],
    [/^\/budgets/,         'PLANNED',        'P4', ''],
    [/^\/ai/,              'PLANNED',        'P4', ''],
    [/^\/organizations\/products/, 'PLANNED','P5', ''],
    [/^\/organizations\/payment-links/, 'PLANNED','P5', ''],
    [/^\/organizations/,   'PLANNED',        'P5', ''],
    [/^\/integrations/,    'PLANNED',        'P5', ''],
    [/^\/onboarding/,      'PLANNED',        'P5', ''],
    [/^\/schedules/,       'PLANNED',        'P5', ''],
    [/^\/billing/,         'PLANNED',        'P5', ''],
    [/^\/payroll/,         'PLANNED',        'P6', ''],
];
for (const e of inv.endpoints) {
    const rule = ENDPOINT_PHASE.find(([re]) => re.test(e.path));
    const [, state, phase, note] = rule ?? [null, 'PLANNED', 'P6', ''];
    set(`api:${e.method} ${e.path}`, state, phase, note);
}

writeFileSync(STATUS, JSON.stringify(out, null, 2) + '\n');
const tally = Object.values(out).reduce((a, v) => ((a[v.state] = (a[v.state] ?? 0) + 1), a), {});
console.log('Seeded', Object.keys(out).length, 'units:', tally);
