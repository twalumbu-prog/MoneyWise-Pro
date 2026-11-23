/**
 * Loads Siba's Hair Braiding price list (hair, nails, lashes & brows, and braiding-hair packs) into the business's products, with free stock photos.
 * Safe to re-run: a product whose name already exists for the business is left alone.
 * Run: npx tsx src/scripts/seed_sibas_menu.ts <photo-folder> [--apply]    (without --apply it only prints what it would add)
 */
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase';

const ORG = '8f7ee72f-868f-4bcf-9281-4bfc45f3955b';
const dir = process.argv[2];
const apply = process.argv.includes('--apply');
if (!dir) { console.error('Pass the photo folder.'); process.exit(1); }

type Item = { name: string; price: number; category: string; photo: string; mins?: number; desc?: string; pack?: boolean };
const H = 'Hair', N = 'Nails', L = 'Lashes & Brows', P = 'Braiding hair';
const hair = (name: string, price: number, photo: string, mins: number, desc?: string): Item => ({ name, price, category: H, photo, mins, desc });
const nail = (name: string, price: number, photo: string, mins: number): Item => ({ name, price, category: N, photo, mins });
const lash = (name: string, price: number, photo: string, mins: number): Item => ({ name, price, category: L, photo, mins });
const pack = (name: string, price: number, desc?: string): Item => ({ name: `${name} (per pack)`, price, category: P, photo: 'pack', pack: true, desc });

const ITEMS: Item[] = [
    // ── nails (Acrylic Nails already exists on the shop at its own price, so it is not added again)
    nail('Rubber Gel', 200, 'nail2', 90), nail('Poly Gel', 220, 'nail3', 90), nail('Polygel Extension', 300, 'nail4', 120), nail('Gel Paint', 150, 'nail2', 60),
    nail('Stick Ons', 200, 'nail1', 60), nail('Refill Polygel', 180, 'nail3', 75), nail('Refill Acrylic', 200, 'nail4', 75),
    nail('Removal – Polygel', 100, 'nail1', 30), nail('Removal – Acrylic', 100, 'nail1', 30), nail('Removal – Stick Ons', 60, 'nail1', 20),
    nail('Pedicure – Foot Scrub (no gel paint)', 220, 'nail2', 60), nail('Pedicure – Foot Scrub with Gel Paint', 300, 'nail2', 75), nail('Nail Replacement (per nail)', 20, 'nail3', 15),
    // ── lashes & brows
    lash('Lash & Brow Tint', 120, 'lash3', 30), lash('Eyebrow Tweezing', 30, 'lash3', 20), lash('Cluster Lashes', 180, 'lash1', 60),
    // ── twists & curls
    hair('Natural Twist + Shea Butter / Cantu / Aunty Jackie\'s', 280, 'loc1', 180), hair('Knotted Twist', 280, 'loc1', 180), hair('Knotted Twist + Shea Butter / Cantu / Aunty Jackie\'s', 300, 'loc1', 180),
    hair('Curls on Hair – Small', 300, 'braid2', 150), hair('Curls on Hair – Medium', 250, 'braid2', 120),
    hair('Vivian Twist – Short', 280, 'loc1', 180), hair('Vivian Twist – Medium', 300, 'loc1', 210), hair('Vivian Twist – Long', 350, 'loc1', 240), hair('Vivian Twist – Extra Long', 380, 'loc1', 270),
    hair('Passion Twist (labour) – Shoulder Length', 300, 'loc1', 210), hair('Passion Twist (labour) – Upper Back Length', 350, 'loc1', 240), hair('Passion Twist (labour) – Mid-Back Length', 450, 'loc1', 300),
    hair('Afro Kinky Twists', 350, 'braid2', 210), hair('Afro Kinky with Side Cornrows', 420, 'braid2', 240),
    // ── braids
    hair('Fishtail Braid', 300, 'braid3', 180), hair('Fulani Braids', 350, 'braid1', 210),
    hair('Stitch Braids – Straight Back', 300, 'braid1', 180), hair('Stitch Braids – Puff', 350, 'braid1', 210),
    hair('Flat Twist – Straight Back', 300, 'braid1', 150), hair('Flat Twist – Puff', 350, 'braid1', 180), hair('Flat Twist – Zip Pattern', 350, 'braid1', 180),
    hair('Goddess / Bohemian Braids – Mid Back', 300, 'wig2', 240), hair('Goddess / Bohemian Braids – Waist Length', 350, 'wig2', 300), hair('Goddess / Bohemian Braids – Bum Length', 400, 'wig2', 360),
    hair('Island Knotless Twists – Mid Back', 300, 'wig2', 240), hair('Island Knotless Twists – Waist Length', 350, 'wig2', 300), hair('Island Knotless Twists – Bum Length', 400, 'wig2', 360),
    hair('Spanish Curl Braids – Mid Back', 300, 'wig2', 240), hair('Spanish Curl Braids – Waist', 350, 'wig2', 300), hair('Spanish Curl Braids – Bum Length', 400, 'wig2', 360),
    hair('Half Cornrows, Half Weave (wigs included)', 550, 'braid1', 240),
    hair('Angel Twin Cornrows (labour only)', 250, 'braid1', 120), hair('Angel Twin Cornrows (wigs included)', 300, 'braid1', 120),
    // ── African threading
    hair('African Threading – Complex Styling', 480, 'braid4', 240), hair('African Threading – Semi-Complex Styling', 400, 'braid4', 210), hair('African Threading – Cornrows + Styling', 310, 'braid4', 180),
    hair('African Threading – Cornrows + Regular Threading', 280, 'braid4', 150), hair('African Threading – Regular Threading', 250, 'braid4', 120),
    // ── natural hair, locs, dreadlocks
    hair('Afro Cut', 550, 'twist2', 120), hair('Afro / Natural Puff', 430, 'braid4', 90),
    hair('Dreadlocks – Start', 200, 'loc1', 180), hair('Dreadlocks – Retouch', 150, 'loc1', 120),
    hair('Sister Locs – Start (Twist Locs)', 1500, 'loc1', 480), hair('Sister Locs (Instant Locs)', 3300, 'loc1', 600),
    hair('Sister Locs Retie – Minimal Undergrowth', 600, 'loc1', 240), hair('Sister Locs Retie – Medium Undergrowth', 600, 'loc1', 300), hair('Sister Locs Retie – Maximum Undergrowth', 1000, 'loc1', 420),
    // ── wig installation & weave
    hair('Wig Installation (Simple)', 350, 'wig1', 90), hair('Wig Installation Plus Styling', 450, 'wig1', 120), hair('Open Weave', 750, 'wig1', 180),
    // ── braiding hair packs (the shop sells these in-house)
    pack('Abuja Wig', 25), pack('Super Arena', 25), pack('Afro Kinky', 100), pack('Vivian Wig', 150), pack('Boho Curls', 100), pack('Spanish Bulk', 80), pack('Spanish Curl', 80),
    pack('Zambezi', 200), pack('Selfie', 150), pack('Razor Cut Wig', 200), pack('Passion Twist', 150, 'Price depends on the colour and length: K150 to K225 per pack.'),
    pack('Bambacha', 80), pack('Expression', 75), pack('Wave Braid', 250), pack('Havana Curls', 150),
];

// The photo names above stand for these photos of Black women (a1.jpg … in the folder).
const PHOTO_MAP: Record<string, string> = {
    nail1: 'a12', nail2: 'a14', nail3: 'a10', nail4: 'a12', lash1: 'a2', lash3: 'a12', loc1: 'a5', braid1: 'a8', braid2: 'a13', braid3: 'a9', braid4: 'a3',
    twist2: 'a13', wig1: 'a1', wig2: 'a14', pack: 'a4',
};
const HOURS = { 1: { start: '09:00', end: '17:00' }, 2: { start: '09:00', end: '17:00' }, 3: { start: '09:00', end: '17:00' }, 4: { start: '09:00', end: '17:00' }, 5: { start: '09:00', end: '17:00' }, 6: { start: '09:00', end: '17:00' } };
const config = (mins: number) => ({ hours: HOURS, capacity: 1, timezone: 'Africa/Lusaka', closed_dates: [], duration_minutes: mins, max_advance_days: 60, min_notice_hours: 2, slot_interval_minutes: 60 });

(async () => {
    const { data: have } = await supabase.from('products').select('name').eq('organization_id', ORG);
    const haveNames = new Set((have ?? []).map((p: any) => String(p.name).trim().toLowerCase()));
    const todo = ITEMS.filter((i) => !haveNames.has(i.name.toLowerCase()));
    const already = ITEMS.filter((i) => haveNames.has(i.name.toLowerCase()));
    console.log(`${ITEMS.length} on the list, ${ITEMS.length - todo.length} already there, ${todo.length} to add${apply ? '' : ' (dry run — pass --apply)'}`);
    if (!apply) { todo.forEach((i) => console.log(`  ${i.category.padEnd(14)} K${String(i.price).padStart(5)}  ${i.name}  [${i.photo}]`)); return; }

    const urls: Record<string, string> = {};
    for (const photo of [...new Set(ITEMS.map((i) => i.photo))]) {
        const file = path.join(dir, `${PHOTO_MAP[photo] ?? photo}.jpg`);
        const key = `${ORG}/stock-${PHOTO_MAP[photo] ?? photo}.jpg`;
        const { error } = await supabase.storage.from('product-images').upload(key, fs.readFileSync(file), { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
        if (error) throw new Error(`upload ${photo}: ${error.message}`);
        urls[photo] = supabase.storage.from('product-images').getPublicUrl(key).data.publicUrl;
    }
    const rows = todo.map((i) => ({
        organization_id: ORG, name: i.name, price: i.price, category: i.category, image_url: urls[i.photo], is_active: true, marketplace_listed: true, currency: 'ZMW',
        description: i.desc ?? null,
        ...(i.pack
            ? { product_type: 'PRODUCT' }
            : { product_type: 'SERVICE_APPOINTMENT', duration_minutes: i.mins, appointment_config: config(i.mins!) }),
    }));
    for (let n = 0; n < rows.length; n += 40) {
        const { error } = await supabase.from('products').insert(rows.slice(n, n + 40));
        if (error) throw new Error(error.message);
    }
    // items added earlier by this script get the current photos too
    for (const i of already) await supabase.from('products').update({ image_url: urls[i.photo] }).eq('organization_id', ORG).eq('name', i.name);
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', ORG);
    console.log(`added ${rows.length}; the business now has ${count} products`);
})().catch((e) => { console.error('FAILED:', e.message ?? e); process.exit(1); });
