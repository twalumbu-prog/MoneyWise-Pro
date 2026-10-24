/**
 * Unit tests for the Blue Opus CRM product-customer logic (pure functions — no database).
 *
 *   npx ts-node --transpile-only src/scripts/test_blue_opus_crm.ts
 *
 * Exit code 1 on any failure.
 */
import 'dotenv/config';
import {
    BLUE_OPUS_ORG_ID,
    buildMoneyWiseRows,
    normalizeProjectGeniusUser,
    attributeSubscriptionPayments,
} from '../services/blueOpusCrm.service';

let failed = 0;
const check = (name: string, cond: any, detail?: any) => {
    if (cond) console.log(`PASS  ${name}`);
    else { failed++; console.log(`FAIL  ${name}`, detail ?? ''); }
};

// ── MoneyWise accounts ──
const orgs = [
    { id: 'o1', name: 'Alpha Ltd', email: 'a@alpha.test', phone: '0977', created_at: '2026-01-01T00:00:00Z' },
    { id: 'o2', name: 'Beta Co', email: null, phone: null, created_at: '2026-02-01T00:00:00Z' },
    { id: 'o3', name: 'Dormant', email: null, phone: null, created_at: '2026-03-01T00:00:00Z' },
    { id: BLUE_OPUS_ORG_ID, name: 'Blue Opus Software', email: 'x@y.z', created_at: '2026-01-01T00:00:00Z' },
];
const users = [
    { organization_id: 'o1', name: 'Ann', email: 'ann@alpha.test', role: 'ADMIN', status: 'ACTIVE' },
    { organization_id: 'o1', name: 'Bob', email: 'bob@alpha.test', role: 'MEMBER', status: 'ACTIVE' },
    { organization_id: 'o2', name: 'Cy', email: 'cy@beta.test', role: 'ADMIN', status: 'ACTIVE' },
    { organization_id: 'o3', name: 'Di', email: 'di@dormant.test', role: 'ADMIN', status: 'DISABLED' },
];
const rows = buildMoneyWiseRows(orgs, users, [{ organization_id: 'o1', plan_id: 'premium' }]);
check('one row per org, Blue Opus excluded', rows.length === 3 && !rows.some(r => r.external_id === BLUE_OPUS_ORG_ID));
check('rows tagged MONEYWISE keyed on org id', rows.every(r => r.external_source === 'MONEYWISE') && rows.map(r => r.external_id).sort().join() === 'o1,o2,o3');
check('org email wins, admin email is the fallback', rows.find(r => r.external_id === 'o1')!.email === 'a@alpha.test' && rows.find(r => r.external_id === 'o2')!.email === 'cy@beta.test');
check('account with no active member is INACTIVE', rows.find(r => r.external_id === 'o3')!.status === 'INACTIVE' && rows.find(r => r.external_id === 'o1')!.status === 'ACTIVE');
check('plan + member count captured', rows.find(r => r.external_id === 'o1')!.metadata.plan === 'premium' && rows.find(r => r.external_id === 'o1')!.metadata.active_members === 2);
check('build is deterministic (idempotent input)', JSON.stringify(rows) === JSON.stringify(buildMoneyWiseRows(orgs, users, [{ organization_id: 'o1', plan_id: 'premium' }])));

// ── Project Genius users ──
check('PG user without id is rejected', normalizeProjectGeniusUser({ name: 'x' }) === null);
const pg = normalizeProjectGeniusUser({ id: 'u-1', full_name: ' Ada  Lovelace ', email: 'ADA@X.COM', role: 'teacher', school: 'Eagles Nest', payment_references: ['PG-SUB-1-abc123', ''] })!;
check('PG user normalised', pg.external_source === 'PROJECT_GENIUS' && pg.external_id === 'u-1' && pg.name === 'Ada Lovelace' && pg.email === 'ada@x.com');
check('PG payment references kept, blanks dropped', JSON.stringify(pg.metadata.payment_references) === JSON.stringify(['PG-SUB-1-abc123']));
check('PG user with same name stays distinct (own key)', normalizeProjectGeniusUser({ id: 'u-2', name: 'Ada Lovelace' })!.external_id !== pg.external_id);
check('PG status mapping', normalizeProjectGeniusUser({ id: 'u3', name: 'n', status: 'suspended' })!.status === 'INACTIVE');

// ── Payment attribution ──
const customers = [
    { id: 'c-mw', external_source: 'MONEYWISE', external_id: 'o1' },
    { id: 'c-pg', external_source: 'PROJECT_GENIUS', external_id: 'u-1', metadata: { payment_references: ['PG-SUB-1790000000000-8awv52'] } },
    { id: 'c-pg2', external_source: 'PROJECT_GENIUS', external_id: 'u-2', metadata: { payment_references: [] } },
];
const invoices = [
    { id: 'i1', organization_id: 'o1', invoice_number: 'INV-1', status: 'paid', net_zmw: 1000, period_start: '2026-07-29', period_end: '2026-08-29', paid_at: '2026-10-12T07:39:00Z', lenco_reference: 'PG-SUB-1791790745013-519475', created_at: '2026-07-29T00:00:00Z' },
    { id: 'i2', organization_id: 'o1', invoice_number: 'INV-2', status: 'pending', net_zmw: 500, period_start: '2026-08-29', period_end: '2026-09-29', paid_at: null, lenco_reference: null, created_at: '2026-08-29T00:00:00Z' },
    { id: 'i3', organization_id: 'other', invoice_number: 'INV-3', status: 'paid', net_zmw: 9, period_start: 'a', period_end: 'b', lenco_reference: null, created_at: '2026-01-01T00:00:00Z' },
];
const receipts = [
    { id: 'r1', description: 'Subscription Payment | Ref: PG-SUB-1791790745013-519475', debit: 1000, external_reference: null, created_at: '2026-10-12T07:41:00Z' },
    { id: 'r2', description: 'Subscription Payment | Ref: PG-SUB-1790076332695-8awv52', debit: 500, external_reference: 'PG-SUB-1790076332695-8awv52', created_at: '2026-09-22T12:15:00Z' },
    { id: 'r3', description: 'Subscription Payment | Ref: PG-SUB-1799999999999-zzzzzz', debit: 5, external_reference: 'PG-SUB-1799999999999-zzzzzz', created_at: '2026-10-01T00:00:00Z' },
];
const pays = attributeSubscriptionPayments(customers, invoices, receipts);
check('invoice paid + its receipt count once', pays.filter(p => p.customerId === 'c-mw' && p.paid).length === 1 && !pays.some(p => p.id === 'r1'));
check('pending invoice is OWING, not paid', pays.find(p => p.id === 'i2')?.status === 'OWING' && pays.find(p => p.id === 'i2')?.paid === false);
check("other org's invoice is not attributed", !pays.some(p => p.id === 'i3'));
check('PG receipt attributed through payment_references', pays.find(p => p.id === 'r2')?.customerId === 'c-pg' && pays.find(p => p.id === 'r2')?.amount === 500);
check('unclaimed receipt stays unattributed', !pays.some(p => p.id === 'r3'));
check('other PG user gets nothing', !pays.some(p => p.customerId === 'c-pg2'));

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
