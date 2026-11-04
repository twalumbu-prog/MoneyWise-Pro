/**
 * Search the Marketplace with a photo. A vision model looks at the picture and says what the item is, with words people would search
 * for it by and which Marketplace category it belongs in; the app then finds matching listings. It needs OPENROUTER_API_KEY (the same
 * key the rest of the app's AI features use); without it the feature says it isn't switched on.
 */
export class ImageSearchError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

const CATEGORIES = ['food', 'stays', 'events', 'fashion', 'tech', 'home', 'gifts', 'services', 'other'] as const;
export interface ImageMatch { summary: string; keywords: string[]; category: (typeof CATEGORIES)[number] }

const MAX_BYTES = 1_500_000;
const hits = new Map<string, number[]>();
/** 20 photo searches an hour per person. */
function allow(userId: string): boolean {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 20) { hits.set(userId, recent); return false; }
    hits.set(userId, [...recent, now]);
    return true;
}

export function validImage(image: unknown): string {
    const s = String(image ?? '').trim();
    if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) {
        if (s.length > MAX_BYTES * 1.4) throw new ImageSearchError('That picture is too large. Try a smaller one.', 413, 'TOO_LARGE');
        return s;
    }
    if (/^https:\/\/[^\s]{1,1000}$/.test(s)) return s;
    throw new ImageSearchError('Add a photo, or paste a link to one that starts with https://', 400, 'IMAGE');
}

export async function describeImage(userId: string, image: unknown): Promise<ImageMatch> {
    const url = validImage(image);
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new ImageSearchError('Search with a photo isn’t switched on yet.', 503, 'NOT_ENABLED');
    if (!allow(userId)) throw new ImageSearchError('That’s a lot of photo searches. Try again in a little while.', 429, 'RATE_LIMIT');

    const model = process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-flash-lite';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://moneywise.blueopus.cloud', 'X-Title': 'MoneyWise Pro' },
            body: JSON.stringify({
                model, temperature: 0.2, response_format: { type: 'json_object' },
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Look at the main item in this photo. We are searching a marketplace in Zambia for similar things to buy. Reply with only JSON: {"summary": "one short sentence saying what it is", "keywords": [3 to 8 lowercase words or short phrases someone would search for it by, including common synonyms], "category": one of "food","stays","events","fashion","tech","home","gifts","services","other"}.' },
                        { type: 'image_url', image_url: { url } },
                    ],
                }],
            }),
            signal: controller.signal as any,
        });
        if (!resp.ok) throw new ImageSearchError('We couldn’t read that picture. Try another one.', 502, 'VISION');
        const data: any = await resp.json();
        const text = String(data.choices?.[0]?.message?.content ?? '').replace(/^```json|```$/g, '').trim();
        const j = JSON.parse(text);
        const keywords = (Array.isArray(j.keywords) ? j.keywords : []).map((k: unknown) => String(k).toLowerCase().trim()).filter((k: string) => k.length > 1 && k.length < 40).slice(0, 8);
        if (keywords.length === 0) throw new ImageSearchError('We couldn’t tell what that is. Try a clearer photo.', 422, 'NO_MATCH');
        return {
            summary: String(j.summary ?? '').slice(0, 160),
            keywords,
            category: (CATEGORIES as readonly string[]).includes(j.category) ? j.category : 'other',
        };
    } catch (e: any) {
        if (e instanceof ImageSearchError) throw e;
        throw new ImageSearchError(e?.name === 'AbortError' ? 'That took too long. Try again.' : 'We couldn’t read that picture. Try another one.', 502, 'VISION');
    } finally {
        clearTimeout(timer);
    }
}
