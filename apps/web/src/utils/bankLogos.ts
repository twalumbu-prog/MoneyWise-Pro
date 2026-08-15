/**
 * bankLogos.ts — Maps Zambian bank names to logo URLs and brand colours.
 *
 * getBankLogoUrls(name)  → ordered URL list for the BankAvatar fallback chain
 * getBankColor(name)     → CSS hex colour for the initials badge
 * getBankInitials(name)  → 1-3 letter abbreviation for the badge
 *
 * Priority order:
 *   1. Local file in /public/bank-logos/  (provided by user, highest quality)
 *   2. Clearbit via parent-company domain (well-indexed global brands)
 *   3. Google favicon service             (works for any website)
 *   4. Coloured initials badge            (always available, last resort)
 */

interface BankMeta {
    /** Local asset in /public/bank-logos/ — served instantly, no network */
    local?: string;
    /** Clearbit domain — use parent company (.co.za / .com), not .co.zm */
    clearbit?: string;
    /** Google favicon domain — any website with a favicon works here */
    favicon?: string;
    color: string;
}

const BANK_MAP: [string[], BankMeta][] = [
    // ── Banks with provided logo files ────────────────────────────────────────
    [['zanaco', 'zambia national commercial'],
        { local: '/bank-logos/zanaco.png',        color: '#FF6600' }],
    [['absa'],
        { local: '/bank-logos/absa.webp',         clearbit: 'absa.co.za',          color: '#DC0037' }],
    [['barclays'],
        { local: '/bank-logos/absa.webp',         clearbit: 'absa.co.za',          color: '#DC0037' }],
    [['fnb', 'first national bank'],
        { local: '/bank-logos/fnb.png',           clearbit: 'fnb.co.za',           color: '#00A699' }],
    [['access bank'],
        { local: '/bank-logos/access-bank.png',   clearbit: 'accessbankplc.com',   color: '#E38B00' }],
    [['bank of china'],
        { local: '/bank-logos/bank-of-china.png', clearbit: 'boc.cn',              color: '#CC0000' }],
    [['first alliance'],
        { local: '/bank-logos/first-alliance.png',                                  color: '#0066CC' }],
    [['first capital'],
        { local: '/bank-logos/first-capital.png',                                   color: '#2E4057' }],
    [['natsave', 'national savings'],
        { local: '/bank-logos/natsave.png',                                         color: '#1A6B3C' }],
    [['znbs', 'zambia national building'],
        { local: '/bank-logos/znbs.png',                                            color: '#003580' }],
    [['ab bank'],
        { local: '/bank-logos/ab-bank.jpeg',                                        color: '#8B1A1A' }],

    // ── Banks without logo files — use Clearbit / Google favicon ─────────────
    [['stanbic'],
        { clearbit: 'standardbank.com',  favicon: 'standardbank.com',  color: '#0083CA' }],
    [['standard chartered'],
        { clearbit: 'sc.com',            favicon: 'sc.com',             color: '#00AA6C' }],
    [['uba', 'united bank for africa'],
        { clearbit: 'ubagroup.com',      favicon: 'ubagroup.com',       color: '#CC0000' }],
    [['ecobank'],
        { clearbit: 'ecobank.com',       favicon: 'ecobank.com',        color: '#009A77' }],
    [['citibank', 'citi bank'],
        { clearbit: 'citi.com',          favicon: 'citi.com',           color: '#003B70' }],
    [['atlas mara'],
        { favicon: 'accessbankplc.com',                                 color: '#E38B00' }],
    [['cavmont'],
        { favicon: 'cavmont.co.zm',                                     color: '#8B0000' }],
    [['zicb', 'zambia industrial'],
        { favicon: 'zicb.co.zm',                                        color: '#1B5E20' }],
    [['indo-zambia', 'indo zambia', 'izb'],
        { favicon: 'izb.co.zm',                                         color: '#1565C0' }],
    [['investrust'],
        { favicon: 'investrustbank.co.zm',                              color: '#1B5E20' }],
    [['madison'],
        { favicon: 'madisonfinance.co.zm',                              color: '#003366' }],
    [['bank of zambia'],
        { favicon: 'boz.zm',                                            color: '#006633' }],
    [['development bank'],
        { favicon: 'dbzambia.co.zm',                                    color: '#5C1E91' }],
];

function matchBank(bankName: string): BankMeta | null {
    const lower = bankName.toLowerCase();
    for (const [keys, meta] of BANK_MAP) {
        if (keys.some(k => lower.includes(k))) return meta;
    }
    return null;
}

/**
 * Returns an ordered list of logo URLs to try (highest quality first).
 * BankAvatar walks this list via onError, then falls back to initials badge.
 */
export function getBankLogoUrls(bankName: string): string[] {
    const meta = matchBank(bankName);
    if (!meta) return [];

    const urls: string[] = [];

    if (meta.local)    urls.push(meta.local);
    if (meta.clearbit) urls.push(`https://logo.clearbit.com/${meta.clearbit}?size=128`);
    if (meta.favicon)  urls.push(
        `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${meta.favicon}&size=128`
    );

    return urls;
}

/** Returns the brand hex colour for the bank badge. */
export function getBankColor(bankName: string): string {
    const meta = matchBank(bankName);
    if (meta) return meta.color;
    const hash = Array.from(bankName).reduce((a, c) => a + c.charCodeAt(0), 0);
    const hues = [200, 220, 160, 280, 30, 340, 0, 120];
    return `hsl(${hues[hash % hues.length]}, 60%, 38%)`;
}

/**
 * Returns 1–3 letter initials for the badge.
 * Strips filler words: "Zambia National Commercial Bank" → "ZNC".
 */
export function getBankInitials(bankName: string): string {
    const STOP = new Set(['bank', 'of', 'the', 'and', '&', 'zambia', 'limited', 'ltd', 'plc']);
    const words = bankName
        .replace(/[()]/g, '')
        .split(/[\s-]+/)
        .filter(w => w.length > 0 && !STOP.has(w.toLowerCase()));

    if (words.length === 0) return bankName.slice(0, 2).toUpperCase();
    return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
}
