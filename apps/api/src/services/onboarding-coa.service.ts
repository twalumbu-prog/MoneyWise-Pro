/**
 * AI Chart-of-Accounts generation for onboarding (Step 9).
 *
 * Merges three sources into a Profit & Loss chart tailored to the business:
 *   1. The standard MoneyWise P&L backbone every business needs.
 *   2. Industry templates keyed off the industries chosen in Step 2.
 *   3. Business-specific revenue/cost accounts derived from the store
 *      categories (Step 6) and products (Step 7).
 *
 * When GEMINI_API_KEY is configured the merged draft is refined by the model
 * (dedupe, naming polish, industry-specific additions). The deterministic merge
 * is always computed first and is the fallback, so generation never fails hard.
 *
 * Statement-of-Financial-Position accounts are NOT generated here — the
 * standard MoneyWise template (see account-provisioning.service.ts) covers the
 * balance sheet and stays hidden during onboarding.
 */

const GEMINI_MODEL = process.env.GEMINI_CATEGORIZATION_MODEL || 'gemini-2.5-flash';

export type PlSection =
    | 'Revenue'
    | 'Cost of Sales'
    | 'Operating Expenses'
    | 'Other Income'
    | 'Other Expenses';

export interface GeneratedAccount {
    code: string;
    name: string;
    type: 'INCOME' | 'EXPENSE';
    subtype: PlSection;
    description: string;
}

export interface CoaGenerationInput {
    organizationName: string;
    industries: string[];
    storeCategories: string[];
    products: { name: string; product_type: string; category?: string | null }[];
}

export const PL_SECTIONS: PlSection[] = [
    'Revenue',
    'Cost of Sales',
    'Operating Expenses',
    'Other Income',
    'Other Expenses',
];

const SECTION_TYPE: Record<PlSection, 'INCOME' | 'EXPENSE'> = {
    'Revenue': 'INCOME',
    'Cost of Sales': 'EXPENSE',
    'Operating Expenses': 'EXPENSE',
    'Other Income': 'INCOME',
    'Other Expenses': 'EXPENSE',
};

// Code ranges per P&L section (MoneyWise convention).
const SECTION_CODE_BASE: Record<PlSection, number> = {
    'Revenue': 4000,
    'Cost of Sales': 5000,
    'Operating Expenses': 6000,
    'Other Income': 7000,
    'Other Expenses': 8000,
};

interface DraftAccount {
    name: string;
    subtype: PlSection;
    description: string;
}

// Standard P&L backbone — applies to every business.
const STANDARD_PL: DraftAccount[] = [
    { name: 'Sales Revenue', subtype: 'Revenue', description: 'Income from primary sales of goods and services' },
    { name: 'Cost of Goods Sold', subtype: 'Cost of Sales', description: 'Direct cost of goods and materials sold' },
    { name: 'Salaries & Wages', subtype: 'Operating Expenses', description: 'Employee salaries, wages and allowances' },
    { name: 'Rent Expense', subtype: 'Operating Expenses', description: 'Premises and equipment rental' },
    { name: 'Utilities', subtype: 'Operating Expenses', description: 'Electricity, water and waste services' },
    { name: 'Internet & Airtime', subtype: 'Operating Expenses', description: 'Connectivity, data bundles and airtime' },
    { name: 'Transport & Fuel', subtype: 'Operating Expenses', description: 'Business travel, deliveries and fuel' },
    { name: 'Marketing & Advertising', subtype: 'Operating Expenses', description: 'Promotions, adverts and branding' },
    { name: 'Repairs & Maintenance', subtype: 'Operating Expenses', description: 'Upkeep of premises and equipment' },
    { name: 'Bank & Payment Charges', subtype: 'Operating Expenses', description: 'Bank fees and payment processing charges' },
    { name: 'Office Supplies', subtype: 'Operating Expenses', description: 'Stationery and consumables' },
    { name: 'Professional Fees', subtype: 'Operating Expenses', description: 'Accounting, legal and consulting fees' },
    { name: 'Licences & Levies', subtype: 'Operating Expenses', description: 'Business licences, council levies and permits' },
    { name: 'Interest Income', subtype: 'Other Income', description: 'Interest earned on balances and deposits' },
    { name: 'Sundry Income', subtype: 'Other Income', description: 'Occasional income outside normal trading' },
    { name: 'Sundry Expenses', subtype: 'Other Expenses', description: 'Occasional costs outside normal operations' },
];

// Industry-specific additions, keyed by the Step 2 industry labels.
const INDUSTRY_TEMPLATES: Record<string, DraftAccount[]> = {
    'Retail': [
        { name: 'Inventory Shrinkage', subtype: 'Cost of Sales', description: 'Stock losses from damage, expiry or theft' },
        { name: 'Packaging Expense', subtype: 'Operating Expenses', description: 'Bags, wrapping and packaging materials' },
    ],
    'Wholesale': [
        { name: 'Freight & Haulage', subtype: 'Cost of Sales', description: 'Bulk transport of goods purchased for resale' },
        { name: 'Warehouse Expenses', subtype: 'Operating Expenses', description: 'Storage, handling and warehouse running costs' },
    ],
    'Grocery': [
        { name: 'Perishables Waste', subtype: 'Cost of Sales', description: 'Expired and spoiled stock written off' },
    ],
    'Restaurant': [
        { name: 'Food & Ingredients', subtype: 'Cost of Sales', description: 'Ingredients and consumables used in the kitchen' },
        { name: 'Kitchen Gas & Fuel', subtype: 'Operating Expenses', description: 'Cooking gas, charcoal and kitchen fuel' },
    ],
    'Hotel': [
        { name: 'Accommodation Revenue', subtype: 'Revenue', description: 'Room and lodging income' },
        { name: 'Housekeeping & Laundry', subtype: 'Operating Expenses', description: 'Cleaning, linen and laundry costs' },
        { name: 'Guest Supplies', subtype: 'Cost of Sales', description: 'Toiletries and consumables provided to guests' },
    ],
    'Pharmacy': [
        { name: 'Pharmaceutical Purchases', subtype: 'Cost of Sales', description: 'Medicines and medical supplies for resale' },
        { name: 'Regulatory & Pharmacy Licences', subtype: 'Operating Expenses', description: 'ZAMRA and professional licensing costs' },
    ],
    'Healthcare': [
        { name: 'Consultation Revenue', subtype: 'Revenue', description: 'Income from consultations and procedures' },
        { name: 'Medical Supplies', subtype: 'Cost of Sales', description: 'Clinical consumables and supplies' },
    ],
    'Agriculture': [
        { name: 'Crop & Produce Sales', subtype: 'Revenue', description: 'Income from crops and farm produce' },
        { name: 'Seeds & Inputs', subtype: 'Cost of Sales', description: 'Seed, fertiliser and chemicals' },
        { name: 'Farm Labour', subtype: 'Cost of Sales', description: 'Seasonal and casual farm labour' },
    ],
    'Construction': [
        { name: 'Contract Revenue', subtype: 'Revenue', description: 'Income from construction contracts' },
        { name: 'Building Materials', subtype: 'Cost of Sales', description: 'Cement, timber, steel and other materials' },
        { name: 'Site Labour', subtype: 'Cost of Sales', description: 'Casual and contracted site labour' },
        { name: 'Equipment Hire', subtype: 'Operating Expenses', description: 'Plant and machinery hire' },
    ],
    'Education': [
        { name: 'Tuition & Fees Revenue', subtype: 'Revenue', description: 'School fees and tuition income' },
        { name: 'Teaching Materials', subtype: 'Cost of Sales', description: 'Books, materials and learning aids' },
    ],
    'Manufacturing': [
        { name: 'Raw Materials', subtype: 'Cost of Sales', description: 'Raw material purchases for production' },
        { name: 'Production Labour', subtype: 'Cost of Sales', description: 'Direct factory and production wages' },
        { name: 'Factory Overheads', subtype: 'Cost of Sales', description: 'Indirect production costs' },
    ],
    'Professional Services': [
        { name: 'Service Fees Revenue', subtype: 'Revenue', description: 'Professional and consulting fee income' },
        { name: 'Subcontracted Services', subtype: 'Cost of Sales', description: 'Work outsourced to third parties' },
    ],
    'Beauty': [
        { name: 'Salon & Treatment Revenue', subtype: 'Revenue', description: 'Income from salon and beauty treatments' },
        { name: 'Beauty Products & Supplies', subtype: 'Cost of Sales', description: 'Products and consumables used in treatments' },
    ],
    'Automotive': [
        { name: 'Workshop Revenue', subtype: 'Revenue', description: 'Repairs, servicing and workshop income' },
        { name: 'Spare Parts', subtype: 'Cost of Sales', description: 'Parts and components used in jobs' },
    ],
    'Logistics': [
        { name: 'Freight Revenue', subtype: 'Revenue', description: 'Transport and delivery income' },
        { name: 'Vehicle Running Costs', subtype: 'Cost of Sales', description: 'Fuel, tyres and fleet maintenance' },
        { name: 'Driver Wages', subtype: 'Cost of Sales', description: 'Driver salaries and trip allowances' },
    ],
    'Technology': [
        { name: 'Software & Subscriptions', subtype: 'Operating Expenses', description: 'SaaS tools, hosting and licences' },
        { name: 'Development Services Revenue', subtype: 'Revenue', description: 'Income from development and IT services' },
    ],
    'Real Estate': [
        { name: 'Rental Income', subtype: 'Revenue', description: 'Income from property rentals' },
        { name: 'Property Maintenance', subtype: 'Operating Expenses', description: 'Upkeep and maintenance of properties' },
        { name: 'Agency Commissions', subtype: 'Cost of Sales', description: 'Commissions paid on lettings and sales' },
    ],
    'NGO': [
        { name: 'Grants & Donations Income', subtype: 'Revenue', description: 'Grant funding and donations received' },
        { name: 'Programme Costs', subtype: 'Cost of Sales', description: 'Direct costs of running programmes' },
    ],
    'Entertainment': [
        { name: 'Ticket & Event Revenue', subtype: 'Revenue', description: 'Ticket sales and event income' },
        { name: 'Event Production Costs', subtype: 'Cost of Sales', description: 'Venue, equipment and performer costs' },
    ],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Deterministic merge of the standard backbone + industry templates + business specifics. */
export function buildBaselineCoa(input: CoaGenerationInput): DraftAccount[] {
    const seen = new Set<string>();
    const out: DraftAccount[] = [];
    const push = (a: DraftAccount) => {
        const key = norm(a.name);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(a);
    };

    // Business-specific revenue lines from store categories, e.g. "Electronics Sales".
    for (const cat of input.storeCategories) {
        const clean = cat.trim();
        if (!clean) continue;
        push({
            name: /revenue|sales|income/i.test(clean) ? clean : `${clean} Sales`,
            subtype: 'Revenue',
            description: `Income from ${clean.toLowerCase()}`,
        });
    }

    // Service products → a services revenue line.
    if (input.products.some(p => p.product_type?.startsWith('SERVICE'))) {
        push({ name: 'Service Revenue', subtype: 'Revenue', description: 'Income from services rendered' });
    }

    for (const industry of input.industries) {
        for (const acc of INDUSTRY_TEMPLATES[industry] || []) push(acc);
    }

    for (const acc of STANDARD_PL) push(acc);

    return out;
}

/** Assign section-ranged codes (4xxx revenue, 5xxx COGS, …) in a stable order. */
export function assignCodes(drafts: DraftAccount[]): GeneratedAccount[] {
    const counters: Record<PlSection, number> = {
        'Revenue': 0, 'Cost of Sales': 0, 'Operating Expenses': 0, 'Other Income': 0, 'Other Expenses': 0,
    };
    // Keep sections grouped in P&L order, preserving insertion order within a section.
    const ordered = PL_SECTIONS.flatMap(section => drafts.filter(d => d.subtype === section));
    return ordered.map(d => {
        const seq = counters[d.subtype] += 10;
        return {
            code: String(SECTION_CODE_BASE[d.subtype] + seq),
            name: d.name,
            type: SECTION_TYPE[d.subtype],
            subtype: d.subtype,
            description: d.description,
        };
    });
}

/** Ask Gemini to refine the baseline draft. Throws on any failure — callers fall back. */
async function refineWithGemini(input: CoaGenerationInput, baseline: DraftAccount[]): Promise<DraftAccount[]> {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
        throw new Error('Gemini not configured');
    }

    const prompt = `You are an expert accountant setting up a Profit & Loss chart of accounts for a small business on MoneyWise, an accounting platform used in Zambia.

Business name: ${input.organizationName}
Industries: ${input.industries.join(', ') || 'not specified'}
Store categories: ${input.storeCategories.join(', ') || 'not specified'}
Products/services: ${input.products.slice(0, 40).map(p => `${p.name} (${p.product_type})`).join(', ') || 'none yet'}

Here is a draft chart of accounts (JSON): ${JSON.stringify(baseline)}

Refine this draft:
- Merge duplicates and near-duplicates.
- Rename accounts to be clear and professional.
- Add any accounts this specific business will clearly need; remove ones it clearly won't.
- Keep it lean: 12-25 accounts total. One clear purpose per account.
- Only Profit & Loss accounts. NEVER include assets, liabilities or equity.

Respond with ONLY a JSON array of objects with exactly these keys:
"name" (string), "subtype" (one of "Revenue", "Cost of Sales", "Operating Expenses", "Other Income", "Other Expenses"), "description" (short string).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
    });
    if (!response.ok) throw new Error(`Gemini API status ${response.status}`);

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Gemini returned no accounts');

    // Strict validation: drop anything malformed, dedupe by name.
    const seen = new Set<string>();
    const refined: DraftAccount[] = [];
    for (const row of parsed) {
        const name = typeof row?.name === 'string' ? row.name.trim() : '';
        const subtype = PL_SECTIONS.includes(row?.subtype) ? (row.subtype as PlSection) : null;
        if (!name || !subtype || seen.has(norm(name))) continue;
        seen.add(norm(name));
        refined.push({
            name,
            subtype,
            description: typeof row?.description === 'string' ? row.description.slice(0, 300) : '',
        });
    }

    // Sanity floor: a refinement that gutted the chart is worse than the baseline.
    if (refined.length < 8 || !refined.some(a => a.subtype === 'Revenue')) {
        throw new Error('Gemini refinement failed validation');
    }
    return refined;
}

/**
 * Generate the P&L chart of accounts for onboarding. AI-refined when possible,
 * deterministic template merge otherwise. Always returns a valid, coded chart.
 */
export async function generateOnboardingCoa(
    input: CoaGenerationInput
): Promise<{ accounts: GeneratedAccount[]; method: 'AI' | 'TEMPLATE' }> {
    const baseline = buildBaselineCoa(input);
    try {
        const refined = await refineWithGemini(input, baseline);
        return { accounts: assignCodes(refined), method: 'AI' };
    } catch (err: any) {
        console.warn('[Onboarding COA] AI refinement unavailable, using template merge:', err.message);
        return { accounts: assignCodes(baseline), method: 'TEMPLATE' };
    }
}
