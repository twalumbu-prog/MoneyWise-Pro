/**
 * Seeds the grocery and household catalogue (vertical GROCERY) used by price comparison for supermarkets and shops. Safe to run again.
 * Items are the everyday ones sold in Zambian supermarkets and tuck shops, with one standard size each so prices are comparable.
 * Run: npx tsx src/scripts/seed_catalog_grocery.ts
 */
import { supabase } from '../lib/supabase';

type Row = [name: string, unit: string, detail?: string, brand?: string, keywords?: string];
const CATALOG: Record<string, Row[]> = {
    'Staples': [
        ['Mealie meal (breakfast) 25 kg', 'bag', '25 kg', undefined, 'maize meal nshima roller breakfast'],
        ['Mealie meal (roller) 25 kg', 'bag', '25 kg', undefined, 'maize meal nshima'],
        ['Mealie meal 10 kg', 'bag', '10 kg', undefined, 'maize meal nshima breakfast roller'],
        ['Rice 5 kg', 'bag', '5 kg', undefined, 'long grain'],
        ['Sugar 2 kg', 'pack', '2 kg', undefined, 'white sugar'],
        ['Salt 1 kg', 'pack', '1 kg', undefined, 'table salt'],
        ['Flour (bread) 2.5 kg', 'pack', '2.5 kg', undefined, 'wheat flour baking'],
        ['Cooking oil 2 litre', 'bottle', '2 litre', undefined, 'sunflower vegetable oil'],
        ['Cooking oil 5 litre', 'bottle', '5 litre', undefined, 'sunflower vegetable oil'],
        ['Beans (sugar beans) 1 kg', 'pack', '1 kg', undefined, 'legumes'],
        ['Groundnuts 1 kg', 'pack', '1 kg', undefined, 'peanuts'],
        ['Pasta (spaghetti) 500 g', 'pack', '500 g', undefined, 'noodles'],
        ['Tea bags (100)', 'box', '100 bags', undefined, 'rooibos ricoffy'],
        ['Instant coffee 200 g', 'jar', '200 g', undefined, 'nescafe ricoffy'],
    ],
    'Protein & dairy': [
        ['Eggs (tray of 30)', 'tray', '30 eggs', undefined, 'egg'],
        ['Chicken (whole, frozen)', 'kg', undefined, undefined, 'broiler hen'],
        ['Beef (stewing)', 'kg', undefined, undefined, 'meat'],
        ['Kapenta (dried)', 'kg', undefined, undefined, 'fish sardines siavonga'],
        ['Bream (fresh or frozen)', 'kg', undefined, undefined, 'fish tilapia'],
        ['Fresh milk 1 litre', 'litre', '1 litre', undefined, 'dairy'],
        ['Long-life milk 1 litre', 'litre', '1 litre', undefined, 'uht dairy'],
        ['Butter or margarine 500 g', 'tub', '500 g', undefined, 'spread blue band'],
        ['Cheese 500 g', 'pack', '500 g', undefined, 'cheddar'],
        ['Bread loaf (white)', 'loaf', '700 g', undefined, 'sliced'],
    ],
    'Fruit & vegetables': [
        ['Tomatoes', 'kg', undefined, undefined, 'fresh'],
        ['Onions', 'kg', undefined, undefined, 'fresh'],
        ['Potatoes', 'kg', undefined, undefined, 'irish'],
        ['Cabbage', 'head', undefined, undefined, 'fresh'],
        ['Rape (leafy greens)', 'bundle', undefined, undefined, 'vegetable'],
        ['Bananas', 'kg', undefined, undefined, 'fruit'],
        ['Oranges', 'kg', undefined, undefined, 'fruit'],
        ['Sweet potatoes', 'kg', undefined, undefined, 'fresh'],
    ],
    'Drinks': [
        ['Bottled water 5 litre', 'bottle', '5 litre', undefined, 'drinking water'],
        ['Soft drink 2 litre', 'bottle', '2 litre', undefined, 'coca cola fanta sprite'],
        ['Fruit juice 1 litre', 'bottle', '1 litre', undefined, 'maheu'],
        ['Maheu 500 ml', 'bottle', '500 ml', undefined, 'sorghum drink'],
    ],
    'Cleaning': [
        ['Washing powder 2 kg', 'box', '2 kg', undefined, 'laundry omo surf'],
        ['Dishwashing liquid 750 ml', 'bottle', '750 ml', undefined, 'sunlight'],
        ['Bleach 750 ml', 'bottle', '750 ml', undefined, 'jik'],
        ['Laundry soap bar', 'bar', undefined, undefined, 'bar soap'],
        ['Toilet paper (9 rolls)', 'pack', '9 rolls', undefined, 'tissue'],
        ['Floor polish 500 ml', 'tin', '500 ml', undefined, 'cleaning'],
    ],
    'Toiletries & baby': [
        ['Bathing soap', 'bar', undefined, undefined, 'lux'],
        ['Toothpaste 100 ml', 'tube', '100 ml', undefined, 'colgate'],
        ['Body lotion 400 ml', 'bottle', '400 ml', undefined, 'vaseline'],
        ['Sanitary pads (pack)', 'pack', undefined, undefined, 'always'],
        ['Disposable nappies (pack)', 'pack', undefined, undefined, 'diapers pampers'],
        ['Baby formula 400 g', 'tin', '400 g', undefined, 'lactogen nan'],
    ],
    'Household': [
        ['Charcoal 50 kg bag', 'bag', '50 kg', undefined, 'cooking fuel'],
        ['Candles (pack of 6)', 'pack', '6', undefined, 'light'],
        ['Matches (box)', 'box', undefined, undefined, 'fire'],
        ['Gas refill 9 kg', 'cylinder', '9 kg', undefined, 'lpg cooking'],
        ['Batteries AA (4 pack)', 'pack', '4', undefined, 'duracell'],
        ['Airtime (K10 voucher)', 'voucher', 'K10', undefined, 'mobile credit'],
    ],
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

(async () => {
    const rows = Object.entries(CATALOG).flatMap(([category, items]) => items.map(([name, unit, unit_detail, brand, keywords]) => ({
        slug: slugify(name), name, category, vertical: 'GROCERY', unit, unit_detail: unit_detail ?? null, brand: brand ?? null, keywords: keywords ?? null, is_active: true, updated_at: new Date().toISOString(),
    })));
    const dupes = rows.length - new Set(rows.map((r) => r.slug)).size;
    if (dupes) { console.error(`${dupes} duplicate names would collide; fix the list first.`); process.exit(1); }
    const { error } = await supabase.from('catalog_items').upsert(rows, { onConflict: 'slug' });
    if (error) { console.error('seed failed:', error.message); process.exit(1); }
    const { count } = await supabase.from('catalog_items').select('id', { count: 'exact', head: true }).eq('vertical', 'GROCERY');
    console.log(`seeded ${rows.length} items across ${Object.keys(CATALOG).length} categories; grocery catalogue now holds ${count}.`);
    process.exit(0);
})();
