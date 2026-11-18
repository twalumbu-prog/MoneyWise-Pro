import { createHash } from 'crypto';
import { supabase } from '../lib/supabase';
import { openRouterComplete } from './ai/ai.provider';
import { SIZE_INFO } from './marketplaceDelivery';
import type { Size } from './marketplaceDelivery';

/**
 * How big and heavy one unit of an item is, when the seller hasn't said. Worked out the way a marketplace estimates shipping from a
 * listing: a weight written in the listing wins, then what the item is (a fridge, a phone, a bag of cement), then an AI guess from its
 * name, description and category. The answer is remembered per listing so it is only worked out once.
 */

export interface ParcelEstimate { size: Size; weightKg: number; source: 'LISTING' | 'ITEM' | 'AI' | 'DEFAULT' }

/** Typical weight of one unit, and the size class, for things people commonly sell. Checked in order, so specific words come first. */
const ITEMS: { test: RegExp; kg: number; size: Size }[] = [
    { test: /\b(cement|mealie ?meal|maize ?meal|rice|sugar|flour|fertili[sz]er|salt)\b.*\b(50 ?kg|bag)\b|\bcement\b/i, kg: 50, size: 'MEDIUM' },
    { test: /\b(sand|gravel|stone|quarry|crusher|aggregate|soil|bricks?|blocks?)\b/i, kg: 800, size: 'BULKY' },
    { test: /\b(roofing|iron sheets?|timber|planks?|poles|steel|rebar|pipes?)\b/i, kg: 200, size: 'BULKY' },
    { test: /\b(fridge|refrigerator|freezer|chest freezer|deep freezer)\b/i, kg: 60, size: 'LARGE' },
    { test: /\b(washing machine|washer|dryer|dishwasher)\b/i, kg: 65, size: 'LARGE' },
    { test: /\b(stove|cooker|oven|range)\b/i, kg: 40, size: 'LARGE' },
    { test: /\b(sofa|couch|sectional|settee|wardrobe|cupboard|dresser|bookshelf|cabinet)\b/i, kg: 60, size: 'LARGE' },
    { test: /\b(bed|bunk|mattress)\b/i, kg: 35, size: 'LARGE' },
    { test: /\b(dining|desk|table|bench)\b/i, kg: 30, size: 'LARGE' },
    { test: /\b(generator|inverter|solar panel|water tank|gas cylinder|compressor)\b/i, kg: 40, size: 'LARGE' },
    { test: /\b(bicycle|bike|treadmill|exercise|motorbike|scooter)\b/i, kg: 18, size: 'LARGE' },
    { test: /\b(tv|television|smart tv|monitor|screen)\b/i, kg: 12, size: 'MEDIUM' },
    { test: /\b(microwave|air ?fryer|blender|mixer|toaster|kettle|iron|heater|fan|rice cooker|pressure cooker)\b/i, kg: 5, size: 'MEDIUM' },
    { test: /\b(printer|desktop|computer|cpu|ups|router|speaker|sound ?bar|home theatre|subwoofer)\b/i, kg: 8, size: 'MEDIUM' },
    { test: /\b(tyres?|tires?|battery|car battery|engine|spare part|rim)\b/i, kg: 12, size: 'MEDIUM' },
    { test: /\b(chair|stool|shelf|rack|carpet|rug|curtain|bedding|duvet|blanket)\b/i, kg: 6, size: 'MEDIUM' },
    { test: /\b(suitcase|luggage|backpack|bag|handbag|school bag)\b/i, kg: 2, size: 'MEDIUM' },
    { test: /\b(laptop|tablet|ipad|notebook|camera|console|playstation|xbox|drone)\b/i, kg: 2.5, size: 'SMALL' },
    { test: /\b(phone|smartphone|iphone|samsung|earbuds|headphones|airpods|watch|charger|power ?bank|sim|router dongle)\b/i, kg: 0.4, size: 'SMALL' },
    { test: /\b(shoes?|sneakers?|boots?|sandals?|heels|crocs|slippers?)\b/i, kg: 1, size: 'SMALL' },
    { test: /\b(shirt|t-?shirt|dress|trousers|jeans|jacket|hoodie|skirt|suit|clothes|clothing|wear|vest|chitenge|kitenge|wig|weave|hair)\b/i, kg: 0.6, size: 'SMALL' },
    { test: /\b(book|textbook|magazine|stationery|pen|notebook|toy|game|puzzle|jewel(?:l)?ery|perfume|fragrance|cosmetics?|makeup|lotion|cream|soap|ring|necklace|bracelet)\b/i, kg: 0.5, size: 'SMALL' },
    { test: /\b(sack|bag of|crate|carton|case of|box of|dozen)\b/i, kg: 20, size: 'MEDIUM' },
];

/** A weight the seller wrote into the listing ("12kg", "2.5 kg", "500 g"). */
function weightInText(text: string): number | null {
    const kg = text.match(/(\d+(?:[.,]\d+)?)\s?(?:kgs?|kilos?|kilograms?)\b/i);
    if (kg) return Number(kg[1].replace(',', '.'));
    const g = text.match(/(\d+(?:[.,]\d+)?)\s?(?:g|grams?)\b/i);
    if (g) return Number(g[1].replace(',', '.')) / 1000;
    return null;
}

const sizeForWeight = (kg: number): Size => (kg < 3 ? 'SMALL' : kg < 25 ? 'MEDIUM' : kg < 250 ? 'LARGE' : 'BULKY');
const clampKg = (kg: number) => Math.min(1000, Math.max(0.05, Math.round(kg * 100) / 100));

const cache = new Map<string, ParcelEstimate>();
const keyOf = (id: string, text: string) => `parcel-est:${id}:${createHash('sha1').update(text).digest('hex').slice(0, 12)}`;

async function askAi(name: string, description: string, category: string): Promise<{ kg: number; size: Size } | null> {
    if (!process.env.OPENROUTER_API_KEY) return null;
    try {
        const out = await openRouterComplete(
            `Item for sale in Zambia.\nName: ${name}\nCategory: ${category || 'n/a'}\nDescription: ${description.slice(0, 500) || 'n/a'}\n\n` +
            'Estimate the shipping weight in kilograms of ONE unit including its packaging, and its size class: SMALL (fits in a bag), MEDIUM (a carton: TV, microwave), ' +
            'LARGE (fridge, sofa, wardrobe), BULKY (a full pickup load of materials). Reply with only JSON: {"kg": number, "size": "SMALL|MEDIUM|LARGE|BULKY"}',
            { jsonObject: true, timeoutMs: 8_000, system: 'You estimate parcel weights for a delivery service. Be realistic, never zero.' },
        );
        const j = JSON.parse(out.replace(/^```json|```$/g, '').trim());
        const kg = Number(j.kg);
        if (!(kg > 0)) return null;
        const size = (['SMALL', 'MEDIUM', 'LARGE', 'BULKY'] as Size[]).includes(j.size) ? (j.size as Size) : sizeForWeight(kg);
        return { kg: clampKg(kg), size };
    } catch (e: any) {
        console.warn('[ParcelEstimate] AI estimate failed:', e?.message);
        return null;
    }
}

export async function estimateParcel(p: { id: string; name: string; description?: string | null; category?: string | null }): Promise<ParcelEstimate> {
    const name = String(p.name ?? ''), description = String(p.description ?? ''), category = String(p.category ?? '');
    const text = `${name} ${description} ${category}`;
    const key = keyOf(p.id, text);
    const hit = cache.get(key);
    if (hit) return hit;

    let est: ParcelEstimate | null = null;
    const written = weightInText(`${name} ${description}`);
    if (written && written > 0 && written <= 1000) est = { size: sizeForWeight(written), weightKg: clampKg(written), source: 'LISTING' };

    if (!est) {
        const item = ITEMS.find((i) => i.test.test(`${name} ${category}`)) ?? ITEMS.find((i) => i.test.test(description));
        if (item) est = { size: item.size, weightKg: item.kg, source: 'ITEM' };
    }
    if (!est) {
        // Not a stored estimate from an earlier run?
        const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
        const v: any = data?.value;
        if (v?.kg > 0) est = { size: v.size, weightKg: v.kg, source: 'AI' };
    }
    if (!est) {
        const ai = await askAi(name, description, category);
        if (ai) {
            est = { size: ai.size, weightKg: ai.kg, source: 'AI' };
            await supabase.from('app_settings').upsert({ key, value: { kg: ai.kg, size: ai.size }, description: 'AI estimate of an item’s shipping weight (safe to delete).', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        }
    }
    if (!est) est = { size: 'MEDIUM', weightKg: SIZE_INFO.MEDIUM.defaultKg, source: 'DEFAULT' };
    cache.set(key, est);
    return est;
}
