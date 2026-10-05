/**
 * OCR Service — uses Gemini Vision (primary) and OpenRouter vision (parallel) to
 * extract structured data from receipt images.  Both providers run in parallel
 * when configured; the first valid JSON response wins.  Set OPENROUTER_OCR_MODEL
 * to enable the OpenRouter path (e.g. google/gemini-2.0-flash-001 or
 * meta-llama/llama-3.2-90b-vision-instruct).
 */
import { callAllOcrProviders } from './ai.provider';

export interface ReceiptOcrData {
    vendor?: string | null;
    vendor_address?: string | null;
    date?: string | null;         // ISO 8601 date string e.g. "2025-12-25"
    time?: string | null;
    total_amount?: number | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    vat_rate?: number | null;     // percentage e.g. 16 for 16%
    currency?: string | null;     // e.g. "ZMW", "USD"
    exchange_rate?: number | null; // rate used to convert currency → ZMW (populated for non-ZMW receipts)
    zmw_equivalent?: number | null; // total_amount converted to ZMW using exchange_rate
    exchange_rate_source?: string | null; // which rate feed supplied exchange_rate
    exchange_rate_date?: string | null;   // when that rate was published
    payment_method?: string | null;
    receipt_number?: string | null;
    til_number?: string | null;
    line_items?: Array<{
        description: string;
        quantity?: number;
        unit_price?: number;
        total?: number;
        zmw_total?: number | null; // total converted to ZMW (non-ZMW receipts only)
    }>;
    notes?: string | null;
    raw_text?: string | null;
    confidence?: number;           // 0-1
    error?: string | null;
}

const RECEIPT_ANALYSIS_PROMPT = `You are a receipt data extraction specialist. Analyze this receipt image and extract as much structured information as possible.

Return a JSON object with the following fields (use null for fields not found):
{
  "vendor": "Store or business name",
  "vendor_address": "Physical address of the vendor",
  "date": "Date of purchase in ISO format YYYY-MM-DD (convert from any format)",
  "time": "Time of purchase e.g. 14:30",
  "total_amount": 0.00,
  "subtotal": 0.00,
  "vat_amount": 0.00,
  "vat_rate": 0,
  "currency": "ISO 4217 code of the currency the amounts are printed in, e.g. ZMW, USD, GBP, ZAR",
  "payment_method": "Cash, Card, Mobile Money, etc.",
  "receipt_number": "Receipt or invoice number",
  "til_number": "Till or terminal number if present",
  "line_items": [
    {
      "description": "Item name",
      "quantity": 1,
      "unit_price": 0.00,
      "total": 0.00
    }
  ],
  "notes": "Any other relevant information (e.g. discounts, tax IDs, etc.)",
  "raw_text": "Full verbatim text extracted from the receipt",
  "confidence": 0.95
}

CURRENCY: Work out the currency from the receipt itself — symbols, codes, country, vendor and address. "$" or "US$" is USD unless the receipt says otherwise (e.g. "CA$", "A$"); "£" is GBP; "€" is EUR; "R" with a South African address is ZAR; "K", "ZK", "ZMW" or "Kwacha" is ZMW. Online services and software subscriptions (e.g. Vercel, AWS, Google, OpenAI, Anthropic, Supabase) normally bill in USD. Never assume ZMW just because the user is in Zambia — only use ZMW when the receipt shows kwacha. Report amounts exactly as printed; do NOT convert them yourself.

Be accurate with numbers. For VAT (Value Added Tax), look for entries like VAT, GST, Tax, or percentages near total amounts.

IMPORTANT: Even if a receipt is extremely simple and lacks a formal table of items (e.g., a toll gate receipt or a single-item retail receipt), you MUST identify the primary item or service being charged for and include it in the 'line_items' array. Use the most descriptive text available on the receipt for the description (e.g. 'Toll Fee' rather than just 'Total').`;

const ITEM_MATCHING_PROMPT = `You are a financial reconciliation expert. Your task is to match line items extracted from a receipt to the original requested items in a requisition.

Requested Items (from our records):
{{requested_items}}

Extracted Items (found on the uploaded receipts):
{{extracted_items}}

### MATCHING RULES:
1. **Semantic Context is King**: Rely heavily on the 'description' AND the 'source_receipt_vendor' (if available). For example, if the vendor is "Mount Meru Petroleum" and the receipt item is "Low Sulphur Die sel", it is OBVIOUSLY a match for a requested item named "fuel".
2. **Amounts are just Estimates**: The "amount" in requested items is an ESTIMATE and will often differ from the receipt's actual amount. Do NOT rely strictly on amounts aligning. Use them as secondary clues.
3. **Handle Terminology**: "total" in extracted items corresponds to the actual spent amount.
4. **Multiple Receipts**: If multiple receipts were uploaded, the "Extracted Items" list contains items from all of them. Use the vendor name to differentiate them.
5. **Confidence**: If the semantic context (vendor + description) points strongly to a requested item, match it with high confidence (>0.8) even if the amounts differ significantly.

Return ONLY a JSON object:
{
  "matches": [
    {
      "requested_item_id": "ID of the requested item",
      "extracted_description": "Description found on receipt",
      "extracted_amount": 0.00, // The numerical total for this item from the receipt
      "source_receipt_id": "The exact ID of the receipt this item came from (as provided in extracted_items)",
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation"
    }
  ],
  "unmatched_extracted": ["Descriptions of receipt items that didn't match anything"],
  "unmatched_requested_ids": ["IDs of requested items that have no match"]
}
`;

const CURRENCY_ALIASES: Record<string, string> = {
    K: 'ZMW', ZK: 'ZMW', ZMK: 'ZMW', KWACHA: 'ZMW',
    $: 'USD', US$: 'USD', 'US DOLLAR': 'USD', DOLLAR: 'USD', DOLLARS: 'USD',
    '£': 'GBP', '€': 'EUR', RAND: 'ZAR',
};

/** Normalise whatever the model returned ("$", "Kwacha", "usd") to an ISO code. */
export function normalizeCurrency(raw?: string | null): string | null {
    if (!raw) return null;
    const v = String(raw).trim().toUpperCase();
    if (!v) return null;
    return CURRENCY_ALIASES[v] ?? (/^[A-Z]{3}$/.test(v) ? v : null);
}

interface ZmwRate { rate: number; source: string; date: string | null }

// Rates move slowly relative to receipt scanning; an hour keeps a batch of
// receipts on one consistent rate and spares the free feeds.
const RATE_TTL_MS = 60 * 60 * 1000;
const rateCache = new Map<string, { value: ZmwRate; at: number }>();

/**
 * Latest ZMW rate for a currency. open.er-api.com first, then the
 * fawazahmed0 currency feed on jsDelivr as a fallback — a single free feed
 * being down used to mean the receipt silently stayed unconverted.
 */
export async function fetchZmwRate(currency: string): Promise<ZmwRate | null> {
    const code = currency.toUpperCase();
    const cached = rateCache.get(code);
    if (cached && Date.now() - cached.at < RATE_TTL_MS) return cached.value;

    let value: ZmwRate | null = null;
    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${code}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const data: any = await res.json();
            if (typeof data?.rates?.ZMW === 'number') {
                value = { rate: data.rates.ZMW, source: 'open.er-api.com', date: data.time_last_update_utc ?? null };
            }
        }
    } catch { /* fall through to the next feed */ }

    if (!value) {
        try {
            const lower = code.toLowerCase();
            const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lower}.json`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data: any = await res.json();
                const rate = data?.[lower]?.zmw;
                if (typeof rate === 'number') value = { rate, source: 'fawazahmed0/currency-api', date: data?.date ?? null };
            }
        } catch { /* no rate available */ }
    }

    if (value) rateCache.set(code, { value, at: Date.now() });
    return value;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ocrService = {
    async analyzeReceipt(imageUrl?: string, imageData?: Buffer | Uint8Array): Promise<ReceiptOcrData> {
        const hasGemini = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY');
        // OpenRouter only needs an API key; the model is configured via the DB (ai_model_settings),
        // not required to be an env var anymore.
        const hasOpenRouterVision = !!(process.env.OPENROUTER_API_KEY);

        if (!hasGemini && !hasOpenRouterVision) {
            console.warn('[OCR Service] No vision provider configured (GEMINI_API_KEY or OPENROUTER_API_KEY+OPENROUTER_OCR_MODEL).');
            return { error: 'AI analysis not configured', confidence: 0 };
        }

        try {
            let base64Data: string;

            if (imageData) {
                base64Data = Buffer.from(imageData).toString('base64');
                console.log(`[OCR Service] Using provided image data, size: ${Math.round(base64Data.length / 1024)} KB`);
            } else if (imageUrl) {
                console.log(`[OCR Service] Fetching image from URL: ${imageUrl.split('?')[0]}`);
                base64Data = await this.fetchImageAsBase64(imageUrl);
                console.log(`[OCR Service] Fetched Base64 from URL, size: ${Math.round(base64Data.length / 1024)} KB`);
            } else {
                throw new Error('Either imageUrl or imageData must be provided');
            }

            let mimeType = 'image/jpeg';
            if (imageData) {
                const buf = Buffer.from(imageData);
                const headerHex = buf.subarray(0, 12).toString('hex');
                if (headerHex.startsWith('25504446')) { // %PDF
                    mimeType = 'application/pdf';
                } else if (headerHex.startsWith('89504e47')) { // \x89PNG
                    mimeType = 'image/png';
                } else if (headerHex.startsWith('52494646') && headerHex.substring(16, 24) === '57454250') { // RIFF ... WEBP
                    mimeType = 'image/webp';
                }
            }
            if (mimeType === 'image/jpeg' && imageUrl) {
                const ext = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
                if (ext === 'pdf') mimeType = 'application/pdf';
                else if (ext === 'png') mimeType = 'image/png';
                else if (ext === 'webp') mimeType = 'image/webp';
                else if (ext === 'heic') mimeType = 'image/heic';
                else if (ext === 'heif') mimeType = 'image/heif';
            }

            // Run all configured vision providers in parallel; use the first valid response.
            const responses = await callAllOcrProviders(RECEIPT_ANALYSIS_PROMPT, base64Data, mimeType);

            if (responses.length === 0) {
                throw new Error('All OCR providers failed to respond');
            }

            // Try each response in order until one parses cleanly.
            let lastErr: string = '';
            for (const resp of responses) {
                try {
                    const jsonText = resp.text.replace(/```json\n?|\n?```/g, '').trim();
                    const parsed: ReceiptOcrData = JSON.parse(jsonText);
                    console.log(`[OCR Service] Receipt analyzed via ${resp.provider}. Vendor: ${parsed.vendor}, Total: ${parsed.total_amount}, Currency: ${parsed.currency}`);

                    // Foreign-currency receipt: convert the total AND every line item to
                    // ZMW at the latest rate. Line items feed the expense amounts, and
                    // only converting the total left those in USD (etc.) shown as kwacha.
                    const currency = normalizeCurrency(parsed.currency);
                    parsed.currency = currency;
                    if (currency && currency !== 'ZMW') {
                        const fx = await fetchZmwRate(currency);
                        if (fx) {
                            parsed.exchange_rate = fx.rate;
                            parsed.exchange_rate_source = fx.source;
                            parsed.exchange_rate_date = fx.date;
                            if (parsed.total_amount != null) parsed.zmw_equivalent = round2(Number(parsed.total_amount) * fx.rate);
                            for (const li of parsed.line_items ?? []) {
                                if (li.total != null) li.zmw_total = round2(Number(li.total) * fx.rate);
                            }
                            console.log(`[OCR Service] FX: ${parsed.total_amount} ${currency} ≈ K${parsed.zmw_equivalent} (rate ${fx.rate} via ${fx.source})`);
                        } else {
                            console.warn(`[OCR Service] Could not fetch ZMW rate for ${currency}; skipping conversion`);
                        }
                    }

                    return parsed;
                } catch (parseErr: any) {
                    lastErr = parseErr.message;
                    console.warn(`[OCR Service] ${resp.provider} returned unparseable JSON: ${parseErr.message}`);
                }
            }

            throw new Error(`No provider returned valid JSON: ${lastErr}`);

        } catch (error: any) {
            console.error('[OCR Service] Critical failure during analysis:', {
                message: error.message,
                stack: error.stack
            });
            return { error: `Analysis failed: ${error.message}`, confidence: 0 };
        }
    },

    async matchExtractedItems(requestedItems: any[], extractedItems: any[]): Promise<any> {
        const { callAllCategorizationProviders } = await import('./ai.provider');
        const hasAny = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY')
            || !!process.env.OPENROUTER_API_KEY
            || !!process.env.PERPLEXITY_API_KEY;
        if (!hasAny) return null;

        try {
            const prompt = ITEM_MATCHING_PROMPT
                .replace('{{requested_items}}', JSON.stringify(requestedItems, null, 2))
                .replace('{{extracted_items}}', JSON.stringify(extractedItems, null, 2));

            const responses = await callAllCategorizationProviders([
                { role: 'user', content: prompt },
            ]);

            for (const resp of responses) {
                try {
                    return JSON.parse(resp.text.replace(/```json\n?|\n?```/g, '').trim());
                } catch { /* try next */ }
            }
            return null;
        } catch (error: any) {
            console.error('[OCR Service] Matching failed:', error.message);
            return null;
        }
    },

    async fetchImageAsBase64(url: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for image fetch

        try {
            console.log(`[OCR] Fetching image for base64 conversion: ${url.split('?')[0]}`);
            const response = await fetch(url, { signal: controller.signal as any });
            if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
            
            clearTimeout(timeoutId);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            return base64;
        } catch (error: any) {
            console.error('[OCR] fetchImageAsBase64 failed:', error.message);
            throw error;
        }
    }
};

