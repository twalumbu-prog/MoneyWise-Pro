/**
 * bankLogos.ts — native port of apps/web/src/utils/bankLogos.ts.
 *
 * Same bank → { local asset key | Clearbit domain | Google favicon domain,
 * brand colour } map and matching logic; kept in sync with the web file by
 * hand since they can't share a module across the web/RN boundary (one
 * needs a require()'d asset map, the other a /public path).
 */

interface BankMeta {
    /** Key into LOCAL_LOGOS (BankAvatar's own require() map) — highest quality, no network. */
    local?: string;
    /** Clearbit domain — use parent company (.co.za / .com), not .co.zm. */
    clearbit?: string;
    /** Google favicon domain — any website with a favicon works here. */
    favicon?: string;
    color: string;
}

const BANK_MAP: [string[], BankMeta][] = [
    [['zanaco', 'zambia national commercial'],
        { local: 'zanaco', color: '#FF6600' }],
    [['absa'],
        { local: 'absa', clearbit: 'absa.co.za', color: '#DC0037' }],
    [['barclays'],
        { local: 'absa', clearbit: 'absa.co.za', color: '#DC0037' }],
    [['fnb', 'first national bank'],
        { local: 'fnb', clearbit: 'fnb.co.za', color: '#00A699' }],
    [['access bank'],
        { local: 'access-bank', clearbit: 'accessbankplc.com', color: '#E38B00' }],
    [['bank of china'],
        { local: 'bank-of-china', clearbit: 'boc.cn', color: '#CC0000' }],
    [['first alliance'],
        { local: 'first-alliance', color: '#0066CC' }],
    [['first capital'],
        { local: 'first-capital', color: '#2E4057' }],
    [['natsave', 'national savings'],
        { local: 'natsave', color: '#1A6B3C' }],
    [['znbs', 'zambia national building'],
        { local: 'znbs', color: '#003580' }],
    [['ab bank'],
        { local: 'ab-bank', color: '#8B1A1A' }],

    [['stanbic'],
        { clearbit: 'standardbank.com', favicon: 'standardbank.com', color: '#0083CA' }],
    [['standard chartered'],
        { clearbit: 'sc.com', favicon: 'sc.com', color: '#00AA6C' }],
    [['uba', 'united bank for africa'],
        { clearbit: 'ubagroup.com', favicon: 'ubagroup.com', color: '#CC0000' }],
    [['ecobank'],
        { clearbit: 'ecobank.com', favicon: 'ecobank.com', color: '#009A77' }],
    [['citibank', 'citi bank'],
        { clearbit: 'citi.com', favicon: 'citi.com', color: '#003B70' }],
    [['atlas mara'],
        { favicon: 'accessbankplc.com', color: '#E38B00' }],
    [['cavmont'],
        { favicon: 'cavmont.co.zm', color: '#8B0000' }],
    [['zicb', 'zambia industrial'],
        { favicon: 'zicb.co.zm', color: '#1B5E20' }],
    [['indo-zambia', 'indo zambia', 'izb'],
        { favicon: 'izb.co.zm', color: '#1565C0' }],
    [['investrust'],
        { favicon: 'investrustbank.co.zm', color: '#1B5E20' }],
    [['madison'],
        { favicon: 'madisonfinance.co.zm', color: '#003366' }],
    [['bank of zambia'],
        { favicon: 'boz.zm', color: '#006633' }],
    [['development bank'],
        { favicon: 'dbzambia.co.zm', color: '#5C1E91' }],
];

function matchBank(bankName: string): BankMeta | null {
    const lower = bankName.toLowerCase();
    for (const [keys, meta] of BANK_MAP) {
        if (keys.some((k) => lower.includes(k))) return meta;
    }
    return null;
}

/** Key into BankAvatar's LOCAL_LOGOS require() map, if this bank has a bundled asset. */
export function getLocalLogoKey(bankName: string): string | undefined {
    return matchBank(bankName)?.local;
}

/** Ordered remote URLs to try (after the local asset, before the initials badge). */
export function getBankLogoUrls(bankName: string): string[] {
    const meta = matchBank(bankName);
    if (!meta) return [];
    const urls: string[] = [];
    if (meta.clearbit) urls.push(`https://logo.clearbit.com/${meta.clearbit}?size=128`);
    if (meta.favicon) urls.push(
        `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${meta.favicon}&size=128`
    );
    return urls;
}

/** Brand hex colour for the initials badge. */
export function getBankColor(bankName: string): string {
    const meta = matchBank(bankName);
    if (meta) return meta.color;
    const hash = Array.from(bankName).reduce((a, c) => a + c.charCodeAt(0), 0);
    const hues = [200, 220, 160, 280, 30, 340, 0, 120];
    return `hsl(${hues[hash % hues.length]}, 60%, 38%)`;
}

/** 1-3 letter initials for the badge — "Zambia National Commercial Bank" → "ZNC". */
export function getBankInitials(bankName: string): string {
    const STOP = new Set(['bank', 'of', 'the', 'and', '&', 'zambia', 'limited', 'ltd', 'plc']);
    const words = bankName
        .replace(/[()]/g, '')
        .split(/[\s-]+/)
        .filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()));

    if (words.length === 0) return bankName.slice(0, 2).toUpperCase();
    return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
}
