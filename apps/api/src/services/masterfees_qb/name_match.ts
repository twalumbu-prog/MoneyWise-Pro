/**
 * Student-name matching between Master Fees and QuickBooks.
 *
 * QuickBooks display names at Twalumbu carry trailing identity/class junk that
 * is NOT part of the name — an admission code ("2025-10-0013", "2025-01-23"),
 * a class tag ("3A", "2B", "G5"), or both. Master Fees carries the plain name,
 * sometimes with a middle name QuickBooks omits, and sometimes in the opposite
 * word order ("CHIBWE KELVIN" in QB vs "Kelvin Chibwe" in Master Fees).
 *
 * So matching is done on an order-insensitive token SET after stripping the
 * junk, with containment (not equality) as the primary test — that's what lets
 * "Amelia Musonda" match "Amelia Mapalo Musonda" — plus a bounded edit-distance
 * pass for spelling variants ("Zgambo"/"Zgamboo").
 *
 * Deliberately conservative: two shared name tokens minimum, and any candidate
 * set that resolves to more than one distinct customer is returned AMBIGUOUS
 * rather than silently picking one. Surname collisions across unrelated
 * families are common in this data and a wrong auto-match posts real money
 * against the wrong student's invoice.
 */

/** Tokens that are identity/class codes rather than parts of a person's name. */
function isJunkToken(t: string): boolean {
    if (!t) return true;
    if (/^\d+$/.test(t)) return true;              // 2025, 0013
    if (/^\d[\d-]*$/.test(t)) return true;         // 2025-10-0013, 2025-01-23
    if (/^[A-Z]?\d+[A-Z]?$/.test(t)) return true;  // 3A, 2B, G5, 12
    if (/\d/.test(t)) return true;                 // anything else carrying a digit
    if (t.length === 1) return true;               // stray initials — not distinguishing
    const STOP = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'JNR', 'JR', 'SNR', 'SR', 'THE', 'AND']);
    if (STOP.has(t)) return true;
    return false;
}

export function nameTokens(raw: string | null | undefined): string[] {
    return (raw || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s-]/g, ' ')
        .split(/[\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0 && !isJunkToken(t));
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = cur;
    }
    return prev[b.length];
}

/**
 * Edit distance tolerance scaled to token length — short names get no slack.
 *
 * Kept deliberately tight. At tolerance 2 on 6-7 character tokens, unrelated
 * Zambian surnames start colliding: MAPALO/MAKAZO and MUSONDA/MUYUNDA are both
 * distance 2, which was enough to match "Amelia Mapalo Musonda" against a
 * completely unrelated "Makazo Muyunda". Real spelling variants in this data
 * (DANIEL/DANNIEL, CELESTE/CELESTTE, NKANGI/NKHANGI, SIMAAMBA/SIMAMBA) are all
 * distance 1, so 2 only buys false positives until tokens are long enough for
 * a two-character difference to still be distinctive.
 */
function tokensEquivalent(a: string, b: string): boolean {
    if (a === b) return true;
    const minLen = Math.min(a.length, b.length);
    if (minLen <= 3) return false;
    const tolerance = minLen >= 8 ? 2 : 1;
    return levenshtein(a, b) <= tolerance;
}

/** How many tokens of `needle` have an equivalent in `hay` (greedy, no reuse). */
function sharedTokenCount(needle: string[], hay: string[]): number {
    const used = new Set<number>();
    let shared = 0;
    for (const t of needle) {
        for (let i = 0; i < hay.length; i++) {
            if (used.has(i)) continue;
            if (tokensEquivalent(t, hay[i])) { used.add(i); shared++; break; }
        }
    }
    return shared;
}

export type MatchTier = 'EXACT' | 'CONTAINED' | 'FUZZY' | 'AMBIGUOUS' | 'NONE';

export interface NameCandidate {
    id: string;
    name: string;
}

export interface NameMatchResult {
    tier: MatchTier;
    match?: NameCandidate;
    /** Populated when tier is AMBIGUOUS — every candidate that tied. */
    alternatives?: NameCandidate[];
    detail: string;
}

/**
 * Match one Master Fees student name against a roster of QuickBooks customers.
 *
 * Tiers, best first:
 *  EXACT     — identical token sets (order-insensitive).
 *  CONTAINED — one token set is a subset of the other, i.e. a middle name is
 *              present on one side only. Requires >= 2 shared tokens.
 *  FUZZY     — >= 2 tokens match within edit-distance tolerance.
 *  AMBIGUOUS — the best tier produced more than one distinct customer.
 */
export function matchStudentName(student: string, roster: NameCandidate[]): NameMatchResult {
    const sTokens = nameTokens(student);
    if (sTokens.length === 0) return { tier: 'NONE', detail: 'Student name had no usable name tokens' };

    const exact: NameCandidate[] = [];
    const contained: NameCandidate[] = [];
    const fuzzy: NameCandidate[] = [];

    for (const cand of roster) {
        const cTokens = nameTokens(cand.name);
        if (cTokens.length === 0) continue;

        const sharedSC = sharedTokenCount(sTokens, cTokens);
        const sharedCS = sharedTokenCount(cTokens, sTokens);
        const shared = Math.min(sharedSC, sharedCS);
        if (shared < 2) {
            // A single-token person (mononym) on either side can still match exactly.
            if (!(sTokens.length === 1 && cTokens.length === 1 && tokensEquivalent(sTokens[0], cTokens[0]))) continue;
        }

        const sameSize = sTokens.length === cTokens.length;
        const allSharedBothWays = shared === sTokens.length && shared === cTokens.length;
        const subsetEitherWay = shared === sTokens.length || shared === cTokens.length;

        const exactStrings = sTokens.slice().sort().join(' ') === cTokens.slice().sort().join(' ');

        // Only true token-set equality counts as EXACT. A same-size set that
        // only lines up through edit-distance tolerance is a spelling guess and
        // is reported as FUZZY, so the review sheet doesn't overstate it.
        if (exactStrings) exact.push(cand);
        else if (subsetEitherWay && !(allSharedBothWays && sameSize)) contained.push(cand);
        else fuzzy.push(cand);
    }

    const dedupe = (list: NameCandidate[]) => {
        const seen = new Map<string, NameCandidate>();
        for (const c of list) if (!seen.has(c.id)) seen.set(c.id, c);
        return [...seen.values()];
    };

    for (const [tier, list] of [['EXACT', dedupe(exact)], ['CONTAINED', dedupe(contained)], ['FUZZY', dedupe(fuzzy)]] as Array<[MatchTier, NameCandidate[]]>) {
        if (list.length === 1) {
            return { tier, match: list[0], detail: `${tier} name match: "${student}" -> "${list[0].name}"` };
        }
        if (list.length > 1) {
            return {
                tier: 'AMBIGUOUS',
                alternatives: list,
                detail: `${list.length} QuickBooks customers match "${student}" equally well at ${tier} level — needs a human to pick: ${list.map(c => `"${c.name}"`).join(', ')}`,
            };
        }
    }

    return { tier: 'NONE', detail: `No QuickBooks customer shares 2+ name tokens with "${student}"` };
}
