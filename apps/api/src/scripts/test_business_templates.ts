/**
 * Business templates: the data is sound (pure), and every kind of listing a template produces is accepted by the REAL product-creation code
 * (against the live database with a throwaway business that is removed at the end).
 * Run: npx tsx src/scripts/test_business_templates.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { createProduct } from '../controllers/product.controller';
// Loaded at run time (not imported) because this file lives in the shared core package, outside the API's source folder: a normal import would
// stop the API's own build from compiling.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tpl = require('../../../../packages/core/src/onboarding/businessTemplates') as any;
interface Item { name: string; product_type: string; category?: string; duration_minutes?: number }
interface Tpl { id: string; name: string; blurb: string; industries: string[]; items: Item[] }
const BUSINESS_TEMPLATES: Tpl[] = tpl.BUSINESS_TEMPLATES;
const needsPrice: (item: any) => boolean = tpl.needsPrice;
const templatesForIndustries: (industries: string[]) => { template: Tpl; suggested: boolean }[] = tpl.templatesForIndustries;
const productFromTemplate: (item: any, price?: any) => any = tpl.productFromTemplate;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const VALID = ['PRODUCT', 'SERVICE_FIXED', 'SERVICE_VARIABLE', 'DONATION', 'SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY', 'DIGITAL', 'SERVICE_APPOINTMENT'];

(async () => {
    // ── the data
    check('there are templates, with unique ids', BUSINESS_TEMPLATES.length >= 10 && new Set(BUSINESS_TEMPLATES.map((t) => t.id)).size === BUSINESS_TEMPLATES.length, String(BUSINESS_TEMPLATES.length));
    check('every template has a name, a blurb, industries and at least 4 items', BUSINESS_TEMPLATES.every((t) => t.name && t.blurb && t.industries.length > 0 && t.items.length >= 4));
    check('item names are unique within a template (so a duplicate check by name is meaningful)', BUSINESS_TEMPLATES.every((t) => new Set(t.items.map((i) => i.name.toLowerCase())).size === t.items.length));
    check('every item has a valid listing type and a name', BUSINESS_TEMPLATES.every((t) => t.items.every((i) => VALID.includes(i.product_type) && i.name.trim().length > 1)));
    check('no template item carries a price (an invented price would be wrong for the business)', BUSINESS_TEMPLATES.every((t) => t.items.every((i) => !('price' in i))));
    check('no digital listing in a template (it needs an uploaded file)', BUSINESS_TEMPLATES.every((t) => t.items.every((i) => i.product_type !== 'DIGITAL')));
    check('appointment items say how long they take', BUSINESS_TEMPLATES.every((t) => t.items.filter((i) => i.product_type === 'SERVICE_APPOINTMENT').every((i) => (i.duration_minutes ?? 0) >= 5)));

    // ── the rules
    check('fixed items, bookings and appointments need a price; quotes and donations do not', needsPrice({ product_type: 'PRODUCT' }) && needsPrice({ product_type: 'SERVICE_FIXED' }) && needsPrice({ product_type: 'SERVICE_BOOKING' }) && needsPrice({ product_type: 'SERVICE_APPOINTMENT' }) && !needsPrice({ product_type: 'SERVICE_VARIABLE' }) && !needsPrice({ product_type: 'DONATION' }));
    const cake = { name: 'Whole cake', product_type: 'PRODUCT' as const, category: 'Bakery' };
    check('a priced item becomes a listing; the price is rounded to the ngwee', productFromTemplate(cake, '120')?.price === 120 && productFromTemplate(cake, 99.999) === null);
    check('a missing, zero, negative, text or huge price is refused for an item that needs one', [undefined, null, '', 0, -5, 'abc', 10_000_001].every((p) => productFromTemplate(cake, p as any) === null));
    check('a quote or donation needs no price and gets none', productFromTemplate({ name: 'Delivery', product_type: 'SERVICE_VARIABLE' })?.price === 0 && productFromTemplate({ name: 'Gift', product_type: 'DONATION' }, 500)?.price === 0);
    check('listings from a template are never put on the marketplace', BUSINESS_TEMPLATES.every((t) => t.items.every((i) => productFromTemplate(i, 100)?.marketplace_listed === false)));
    check('an appointment listing carries its length', (productFromTemplate({ name: 'Haircut', product_type: 'SERVICE_APPOINTMENT', duration_minutes: 45 }, 80) as any)?.appointment_config?.duration_minutes === 45);

    const order = (inds: string[]) => templatesForIndustries(inds).map((x) => x.template.id);
    check('Education suggests the school template first', order(['Education'])[0] === 'school' && templatesForIndustries(['Education'])[0].suggested);
    check('Beauty suggests the salon; Hotel the lodge; Automotive repairs; Agriculture the farm', order(['Beauty'])[0] === 'salon' && order(['Hotel'])[0] === 'lodge' && order(['Automotive'])[0] === 'repairs' && order(['Agriculture'])[0] === 'farm');
    check('industry matching ignores case and extra spaces', order([' education '])[0] === 'school');
    check('with no match every template is still offered, none suggested', templatesForIndustries([]).length === BUSINESS_TEMPLATES.length && templatesForIndustries(['Underwater basket weaving']).every((x) => !x.suggested));
    check('a business in two industries gets both suggested', (() => { const r = templatesForIndustries(['Education', 'Beauty']); return r[0].suggested && r[1].suggested && new Set([r[0].template.id, r[1].template.id]).size === 2; })());

    // ── every kind of listing is accepted by the real creation code
    const tag = randomUUID().slice(0, 6);
    let org = '';
    try {
        const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST template ${tag}`, slug: `zz-test-template-${tag}` }).select('id').single();
        if (error) throw error; org = data.id;
        const create = async (body: any) => {
            const out: { code: number; body: any } = { code: 200, body: null };
            const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } };
            await createProduct({ user: { organization_id: org, role: 'ADMIN', id: randomUUID() }, body } as any, res);
            return out;
        };
        const seenTypes = new Set<string>();
        let accepted = 0, rejected: string[] = [];
        for (const t of BUSINESS_TEMPLATES) {
            for (const item of t.items) {
                const body = productFromTemplate(item, 100);
                const r = await create(body);
                seenTypes.add(item.product_type);
                if (r.code === 201 && r.body?.id) accepted++; else rejected.push(`${t.id}/${item.name}: ${r.code} ${JSON.stringify(r.body)?.slice(0, 120)}`);
            }
        }
        const total = BUSINESS_TEMPLATES.reduce((s, t) => s + t.items.length, 0);
        check(`all ${total} template items are accepted by the real product creation`, accepted === total && rejected.length === 0, rejected.slice(0, 2).join(' | '));
        check('every listing type a template uses was exercised', ['PRODUCT', 'SERVICE_FIXED', 'SERVICE_VARIABLE', 'DONATION', 'SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY', 'SERVICE_APPOINTMENT'].every((x) => seenTypes.has(x)), [...seenTypes].join(','));
        const { data: rows } = await supabase.from('products').select('product_type, price, marketplace_listed, is_active, appointment_config').eq('organization_id', org);
        check('they were saved as sellable, off the marketplace, with the prices given (donations and quotes at 0)', (rows ?? []).length === total && (rows ?? []).every((r: any) => r.is_active === true && r.marketplace_listed === false && (['DONATION', 'SERVICE_VARIABLE'].includes(r.product_type) ? Number(r.price) === 0 : Number(r.price) === 100)));
        check('an appointment listing was saved with its length', (rows ?? []).filter((r: any) => r.product_type === 'SERVICE_APPOINTMENT').every((r: any) => Number(r.appointment_config?.duration_minutes) >= 5));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (org) {
            await supabase.from('products').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST template ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 90)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
