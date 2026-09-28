export const PRESET_EMOJIS = [
    '💰', '💼', '📈', '🏢', '🎁', '💳', '🐷', '💵',
    '🛒', '🏠', '⚡', '🚗', '🍕', '🩺', '🎓', '🚀',
    '✈️', '📱', '⚖️', '🛍️', '🏖️', '🍿', '☕', '💡',
];

/** Regex to match an emoji at the beginning of a string. */
const EMOJI_PREFIX_REGEX = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E6}-\u{1F1FF}]+)\s*/u;

export function extractEmojiAndName(rawName: string): { emoji: string | null; cleanName: string } {
    if (!rawName) return { emoji: null, cleanName: '' };
    const match = rawName.match(EMOJI_PREFIX_REGEX);
    if (match) {
        const emoji = match[1];
        const cleanName = rawName.slice(match[0].length).trim();
        return { emoji, cleanName: cleanName || rawName };
    }
    return { emoji: null, cleanName: rawName.trim() };
}

export function getAccountEmoji(name: string, type?: string): string {
    const { emoji } = extractEmojiAndName(name);
    if (emoji) return emoji;

    const lower = name.toLowerCase();

    // Keyword match
    if (lower.includes('wallet') || lower.includes('main') || lower.includes('bank') || lower.includes('cash')) return '💳';
    if (lower.includes('salary') || lower.includes('wage') || lower.includes('pay')) return '💰';
    if (lower.includes('freelanc') || lower.includes('side') || lower.includes('business')) return '💼';
    if (lower.includes('invest') || lower.includes('dividend') || lower.includes('stock')) return '📈';
    if (lower.includes('rent') || lower.includes('hous') || lower.includes('mortgage')) return '🏠';
    if (lower.includes('groc') || lower.includes('food') || lower.includes('supermarket')) return '🛒';
    if (lower.includes('util') || lower.includes('electr') || lower.includes('water') || lower.includes('internet')) return '⚡';
    if (lower.includes('trans') || lower.includes('fuel') || lower.includes('car') || lower.includes('bus')) return '🚗';
    if (lower.includes('din') || lower.includes('eat') || lower.includes('restaur') || lower.includes('snack')) return '🍕';
    if (lower.includes('health') || lower.includes('medic') || lower.includes('doctor') || lower.includes('pharmacy')) return '🩺';
    if (lower.includes('educat') || lower.includes('school') || lower.includes('tuit') || lower.includes('book')) return '🎓';
    if (lower.includes('sav') || lower.includes('retain')) return '🐷';
    if (lower.includes('gift') || lower.includes('allowance')) return '🎁';
    if (lower.includes('equity') || lower.includes('worth')) return '⚖️';

    // Type fallback
    if (type === 'INCOME') return '💵';
    if (type === 'EXPENSE') return '💸';
    if (type === 'ASSET') return '🏦';
    if (type === 'LIABILITY') return '📄';
    if (type === 'EQUITY') return '💎';

    return '📁';
}
