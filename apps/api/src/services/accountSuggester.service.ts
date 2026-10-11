/**
 * accountSuggester.service.ts — when a transaction fits none of the accounts in a chart of accounts,
 * the AI reasons about what it is and creates the right new account, so the user never has to stop
 * and build one before the transaction can be categorised.
 *
 * Only ever ADDS an ordinary EXPENSE/INCOME account to the organisation's own chart (never edits or
 * deletes one). If the AI is unavailable or answers badly, a plain "Other expenses / Other income"
 * account is used so the transaction is still categorised and shows up in reports.
 */
import { supabase } from '../lib/supabase';
import { callAllCategorizationProviders } from './ai/ai.provider';

export type NewAccountType = 'EXPENSE' | 'INCOME';

export interface CreatedAccount {
    id: string;
    code: string;
    name: string;
    type: NewAccountType;
    created: boolean;      // false when an existing account turned out to be the right one
    reasoning: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍\s]+/u;
const stripEmoji = (s: string) => s.replace(EMOJI_PREFIX, '').trim();

/** Next free code in the org's own style (EXP-201 → EXP-251, EXP231 → EXP251 …). */
async function nextCode(organizationId: string, type: NewAccountType): Promise<string> {
    const prefix = type === 'EXPENSE' ? 'EXP' : 'INC';
    const { data } = await supabase.from('accounts').select('code').eq('organization_id', organizationId).ilike('code', `${prefix}%`);
    let max = type === 'EXPENSE' ? 200 : 100;
    let hyphen = true;
    for (const a of data || []) {
        const m = String((a as any).code || '').match(new RegExp(`^${prefix}(-?)(\\d+)$`, 'i'));
        if (!m) continue;
        hyphen = hyphen && m[1] === '-' ? true : hyphen;
        max = Math.max(max, Number(m[2]));
    }
    return `${prefix}${hyphen ? '-' : ''}${max + 1}`;
}

interface Suggestion { name: string; emoji: string; subtype: string; description: string; reasoning: string }

async function askModel(description: string, amount: number, type: NewAccountType, existingNames: string[]): Promise<Suggestion | null> {
    const kind = type === 'EXPENSE' ? 'an expense (money spent)' : 'income (money received)';
    const system =
        'You are an accountant setting up a personal-finance chart of accounts for a person in Zambia. ' +
        'A transaction does not fit any existing account. Decide what kind of transaction it is and propose ONE new, ' +
        'general-purpose account that this and similar future transactions belong in. ' +
        'Rules: the name is a short, plain category (2-4 words, Title Case) such as "Medical & Health" or "School Fees" — ' +
        'never the merchant or person, never an amount, never a date. Do not duplicate an existing account. ' +
        'Reply with JSON only: {"name": string, "emoji": string (one emoji), "subtype": string, "description": string (one sentence), "reasoning": string (one sentence explaining why this account is right)}.';
    const user =
        `Transaction: "${description}" — K${amount.toFixed(2)} — it is ${kind}.\n` +
        `Existing ${type.toLowerCase()} accounts (do not repeat): ${existingNames.join('; ') || 'none'}.`;

    const responses = await callAllCategorizationProviders([
        { role: 'system', content: system },
        { role: 'user', content: user },
    ]).catch(() => []);
    for (const r of responses) {
        try {
            const data = JSON.parse(r.text.replace(/```json\n?|\n?```/g, '').trim());
            const name = stripEmoji(String(data.name || '')).replace(/\s+/g, ' ').slice(0, 40).trim();
            if (name.length < 3) continue;
            return {
                name,
                emoji: String(data.emoji || '').trim().slice(0, 4) || '📁',
                subtype: String(data.subtype || (type === 'EXPENSE' ? 'Operating Expenses' : 'Other Income')).slice(0, 40),
                description: String(data.description || '').slice(0, 200),
                reasoning: String(data.reasoning || '').slice(0, 300),
            };
        } catch { /* try the next provider's answer */ }
    }
    return null;
}

export async function createAccountForTransaction(
    organizationId: string,
    tx: { description: string; amount: number; type: NewAccountType },
): Promise<CreatedAccount | null> {
    try {
        const { data: existing } = await supabase
            .from('accounts').select('id, code, name, type')
            .eq('organization_id', organizationId).eq('type', tx.type).eq('is_active', true);
        const rows = (existing || []) as any[];
        const byName = new Map(rows.map(a => [norm(stripEmoji(String(a.name))), a]));

        let s = await askModel(tx.description, tx.amount, tx.type, rows.map(a => stripEmoji(String(a.name))));
        const fallback = tx.type === 'EXPENSE'
            ? { name: 'Other Expenses', emoji: '🧾', subtype: 'Operating Expenses', description: 'Spending that doesn’t fit another category yet.', reasoning: 'No existing account fit and no better category could be determined, so it was filed under Other Expenses.' }
            : { name: 'Other Income', emoji: '💵', subtype: 'Other Income', description: 'Money received that doesn’t fit another category yet.', reasoning: 'No existing account fit and no better category could be determined, so it was filed under Other Income.' };
        if (!s) s = fallback;

        // The model may propose something that already exists (different casing/emoji): use that account.
        const dup = byName.get(norm(s.name));
        if (dup) return { id: dup.id, code: dup.code, name: dup.name, type: tx.type, created: false, reasoning: s.reasoning };

        for (let attempt = 0; attempt < 3; attempt++) {
            const code = await nextCode(organizationId, tx.type);
            const { data, error } = await supabase.from('accounts').insert({
                organization_id: organizationId,
                code,
                name: `${s.emoji} ${s.name}`,
                type: tx.type,
                subtype: s.subtype,
                description: s.description || null,
                is_active: true,
            }).select('id, code, name').single();
            if (!error && data) {
                console.log(`[AccountSuggester] org ${organizationId}: created "${data.name}" (${data.code}) for "${tx.description}"`);
                return { id: data.id, code: data.code, name: data.name, type: tx.type, created: true, reasoning: s.reasoning };
            }
            // Code clash from a concurrent request — loop picks the next number.
            if ((error as any)?.code !== '23505') { console.error('[AccountSuggester] insert failed:', error?.message); break; }
        }
        return null;
    } catch (e: any) {
        console.error('[AccountSuggester] failed:', e?.message);
        return null;
    }
}
