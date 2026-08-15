/**
 * bankLogos.ts — Maps Zambian bank names to Clearbit logo domains and brand colours.
 *
 * getBankLogoUrl(name)   → Clearbit CDN URL or null
 * getBankColor(name)     → CSS hex colour for the fallback badge
 * getBankInitials(name)  → 1-3 letter abbreviation for the badge
 */

interface BankMeta {
    domain: string;
    color: string;
}

// Key = lowercase substring(s) that identify the bank.
// Domain is fed to the Clearbit logo API; color is the fallback badge bg.
const BANK_MAP: [string[], BankMeta][] = [
    [['zanaco', 'zambia national commercial'], { domain: 'zanaco.co.zm',          color: '#FF6600' }],
    [['stanbic'],                              { domain: 'stanbicbank.co.zm',      color: '#0083CA' }],
    [['fnb', 'first national bank'],          { domain: 'fnb.co.zm',              color: '#00A699' }],
    [['standard chartered'],                  { domain: 'sc.com',                 color: '#00AA6C' }],
    [['absa'],                                { domain: 'absa.co.zm',             color: '#DC0037' }],
    [['barclays'],                            { domain: 'absa.co.zm',             color: '#DC0037' }],
    [['bank of china'],                       { domain: 'boc.cn',                 color: '#CC0000' }],
    [['access bank'],                         { domain: 'accessbankplc.com',      color: '#E38B00' }],
    [['atlas mara'],                          { domain: 'accessbankplc.com',      color: '#E38B00' }],
    [['cavmont'],                             { domain: 'accessbankplc.com',      color: '#E38B00' }],
    [['zicb', 'zambia industrial'],           { domain: 'zicb.co.zm',             color: '#1B5E20' }],
    [['indo-zambia', 'indo zambia', 'izb'],   { domain: 'izb.co.zm',              color: '#1565C0' }],
    [['first alliance'],                      { domain: 'firstalliance.co.zm',    color: '#0066CC' }],
    [['investrust'],                          { domain: 'investrustbank.co.zm',   color: '#1B5E20' }],
    [['uba', 'united bank for africa'],       { domain: 'ubagroup.com',           color: '#CC0000' }],
    [['ecobank'],                             { domain: 'ecobank.com',            color: '#009A77' }],
    [['madison'],                             { domain: 'madisonfinance.co.zm',   color: '#003366' }],
    [['first capital'],                       { domain: 'fcbzambia.co.zm',        color: '#2E4057' }],
    [['citibank', 'citi bank'],               { domain: 'citi.com',               color: '#003B70' }],
    [['bank of zambia'],                      { domain: 'boz.zm',                 color: '#006633' }],
    [['development bank of zambia'],          { domain: 'dbzambia.co.zm',         color: '#5C1E91' }],
    [['african banking', 'abc bank'],         { domain: 'abcthebank.com',         color: '#8B1A1A' }],
];

function matchBank(bankName: string): BankMeta | null {
    const lower = bankName.toLowerCase();
    for (const [keys, meta] of BANK_MAP) {
        if (keys.some(k => lower.includes(k))) return meta;
    }
    return null;
}

/** Returns a Clearbit logo URL for the bank, or null if unrecognised. */
export function getBankLogoUrl(bankName: string): string | null {
    const meta = matchBank(bankName);
    return meta ? `https://logo.clearbit.com/${meta.domain}?size=64` : null;
}

/** Returns the brand hex colour for the bank badge (always defined). */
export function getBankColor(bankName: string): string {
    const meta = matchBank(bankName);
    if (meta) return meta.color;
    // Deterministic colour from name hash for unrecognised banks
    const hash = Array.from(bankName).reduce((a, c) => a + c.charCodeAt(0), 0);
    const hues = [200, 220, 160, 280, 30, 340, 0, 120];
    return `hsl(${hues[hash % hues.length]}, 60%, 38%)`;
}

/**
 * Returns 1–3 letter initials for the bank badge.
 * Strips common filler words so "Zambia National Commercial Bank" → "ZNC".
 */
export function getBankInitials(bankName: string): string {
    const STOP = new Set(['bank', 'of', 'the', 'and', '&', 'zambia', 'limited', 'ltd', 'plc']);
    const words = bankName
        .replace(/[()]/g, '')
        .split(/[\s-]+/)
        .filter(w => w.length > 0 && !STOP.has(w.toLowerCase()));

    if (words.length === 0) return bankName.slice(0, 2).toUpperCase();

    // Use up to 3 initials
    return words
        .slice(0, 3)
        .map(w => w[0].toUpperCase())
        .join('');
}
