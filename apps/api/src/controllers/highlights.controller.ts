import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
    getPeriodSummary,
    detectAchievements,
    getUnseenAchievements,
    markAchievementsSeen,
    achievementTitle,
    addDays,
    iso,
    Achievement,
    PeriodSummary,
} from '../services/highlights.service';
import {
    sendWeeklyHighlights,
    sendWeeklyHighlightsToAllOrgs,
} from '../services/weeklyHighlights.service';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

interface HighlightCard {
    id: string;
    title: string;
    body: string;
    tone: 'positive' | 'neutral' | 'warning';
}

export const money = (n: number) =>
    `K${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / Math.abs(prev)) * 100);
};

/**
 * Turn a week's figures into the headline cards.
 *
 * The order matters — this is what the owner reads top to bottom: what came in,
 * what went out (and where most of it went), then what's actually left. Each
 * card leads with the Kwacha figure rather than a percentage, because "you made
 * K14,200" lands and "revenue up 12%" doesn't.
 */
export function buildHighlightCards(
    current: PeriodSummary,
    previous: PeriodSummary,
    achievements: Achievement[] = []
): HighlightCard[] {
    const cards: HighlightCard[] = [];

    // Achievements lead — a broken record is the most interesting thing that
    // can be true about the week.
    for (const a of achievements.slice(0, 2)) {
        const beat = a.previous_value
            ? ` That beats your previous best of ${money(Number(a.previous_value))}.`
            : ' That\'s a first for your business.';
        cards.push({
            id: `achievement-${a.id}`,
            tone: 'positive',
            title: achievementTitle(a),
            body: `${money(Number(a.value))} — ${achievementTitle(a).toLowerCase()}.${beat}`,
        });
    }

    if (current.revenue > 0 || previous.revenue > 0) {
        const change = pctChange(current.revenue, previous.revenue);
        const diff = Math.abs(current.revenue - previous.revenue);
        cards.push({
            id: 'revenue',
            tone: change >= 0 ? 'positive' : 'warning',
            title: 'Money in this week',
            body: change >= 0
                ? `So far this week you've made ${money(current.revenue)} — ${money(diff)} more than last week.`
                : `So far this week you've made ${money(current.revenue)}, ${money(diff)} less than last week.`,
        });
    }

    if (current.spending > 0 || previous.spending > 0) {
        const change = pctChange(current.spending, previous.spending);
        const top = current.categories[0];
        const topLine = top
            ? ` Most of it went to ${top.name} (${money(top.amount)}).`
            : '';
        cards.push({
            id: 'spending',
            tone: change <= 0 ? 'positive' : 'neutral',
            title: 'Money out this week',
            body: `You've spent ${money(current.spending)} this week${change <= 0 ? ', down' : ', up'} from ${money(previous.spending)}.${topLine}`,
        });
    }

    if (current.revenue > 0 || current.spending > 0) {
        cards.push({
            id: 'profit',
            tone: current.profit >= 0 ? 'positive' : 'warning',
            title: 'Profit this week',
            body: current.profit >= 0
                ? `That leaves you ${money(current.profit)} in profit this week. Keep it up!`
                : `You're ${money(current.profit)} down this week — spending outpaced what came in.`,
        });
    }

    if (current.topInflow && current.topInflow.amount > 0) {
        cards.push({
            id: 'top-inflow',
            tone: 'positive',
            title: 'Biggest win',
            body: `Your largest single payment this week was ${money(current.topInflow.amount)} from ${current.topInflow.label}.`,
        });
    }

    return cards;
}

/**
 * Optionally warm up the phrasing with Gemini. Achievement cards are held back
 * from the model — their wording is celebratory and exact, and a rewrite tends
 * to soften or mangle the record figures. Falls back to the deterministic copy
 * whenever the model is unavailable or returns something unusable.
 */
async function phraseWithAI(cards: HighlightCard[]): Promise<HighlightCard[]> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return cards;

    const locked = cards.filter(c => c.id.startsWith('achievement-'));
    const rewritable = cards.filter(c => !c.id.startsWith('achievement-'));
    if (rewritable.length === 0) return cards;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
        const prompt = `You are a friendly financial assistant for a small-business owner using MoneyWise.
Rewrite each of these raw financial signals as an upbeat, bite-size highlight. Keep each body under 30 words, plain and encouraging, currency stays in Kwacha (K). Do NOT invent numbers or change any figure — only rephrase what's given.
Return STRICT JSON: {"cards":[{"id","title","body","tone"}]}. Keep the same id and tone for each signal, same order.

SIGNALS:
${JSON.stringify(rewritable)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' },
            }),
        });

        if (!response.ok) return cards;

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return cards;

        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) return cards;

        const cleaned: HighlightCard[] = parsed.cards
            .filter((c: any) => c && c.title && c.body)
            .map((c: any, i: number) => ({
                id: c.id || rewritable[i]?.id || `card-${i}`,
                title: String(c.title),
                body: String(c.body),
                tone: ['positive', 'neutral', 'warning'].includes(c.tone) ? c.tone : 'neutral',
            }));

        return cleaned.length > 0 ? [...locked, ...cleaned] : cards;
    } catch (aiErr) {
        console.error('[Highlights] Gemini phrasing failed, using raw signals:', aiErr);
        return cards;
    }
}

/**
 * Financial Highlights — headline figures for the current week, the categories
 * behind them, and any business records just broken. Powers the Highlights card
 * on the Reports screen.
 */
export const getFinancialHighlights = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization' });

        const now = new Date();
        const thisWeekStart = iso(addDays(now, -6));   // rolling 7 days, today inclusive
        const today = iso(now);
        const lastWeekStart = iso(addDays(now, -13));
        const lastWeekEnd = iso(addDays(now, -7));

        const [current, previous] = await Promise.all([
            getPeriodSummary(organizationId, thisWeekStart, today),
            getPeriodSummary(organizationId, lastWeekStart, lastWeekEnd),
        ]);

        // Record detection is best-effort — a failure here (e.g. the migration
        // hasn't been applied yet) must never take the highlights down with it.
        let achievements: Achievement[] = [];
        try {
            await detectAchievements(organizationId, now);
            achievements = await getUnseenAchievements(organizationId);
        } catch (achErr: any) {
            console.error('[Highlights] Achievement detection unavailable:', achErr?.message || achErr);
        }

        const cards = buildHighlightCards(current, previous, achievements);

        if (cards.length === 0) {
            return res.json({
                cards: [{
                    id: 'quiet',
                    tone: 'neutral',
                    title: 'All quiet',
                    body: "No major money movements since you were last here. We'll flag anything new the moment it lands.",
                }],
                headline: current,
                achievements: [],
            });
        }

        return res.json({
            cards: (await phraseWithAI(cards)).slice(0, 6),
            headline: {
                revenue: current.revenue,
                spending: current.spending,
                profit: current.profit,
                topCategory: current.categories[0] || null,
                periodStart: current.start,
                periodEnd: current.end,
            },
            achievements: achievements.map(a => ({
                id: a.id,
                metric: a.metric,
                period: a.period,
                value: Number(a.value),
                previousValue: a.previous_value === null ? null : Number(a.previous_value),
                periodStart: a.period_start,
                periodEnd: a.period_end,
                title: achievementTitle(a),
            })),
        });
    } catch (err: any) {
        console.error('[Highlights] Failed to build financial highlights:', err);
        return res.status(500).json({ error: 'Failed to build highlights' });
    }
};

/**
 * Weekly newsletter trigger.
 *
 * Two callers, one handler:
 *   - the Monday-morning cron (Supabase pg_cron -> edge function -> here),
 *     authenticated with LENCO_SYNC_SECRET like the Lenco sync endpoint;
 *   - an authenticated ADMIN hitting it manually to send a test or to kick off
 *     the first run.
 *
 * `organizationId` in the body scopes it to a single org; omit it to fan out to
 * every organization. `to` overrides the recipient list, which is how you send
 * yourself a test without emailing real admins.
 */
export const sendWeeklyHighlightsEmail = async (req: AuthRequest, res: Response) => {
    const syncSecret = process.env.LENCO_SYNC_SECRET;
    const authHeader = req.headers['authorization'];
    const isCron = !!syncSecret && authHeader === `Bearer ${syncSecret}`;

    // Without the cron secret the caller must be a signed-in admin of the org
    // they're targeting — never let an arbitrary user trigger a fan-out.
    if (!isCron) {
        if (!req.user?.organization_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Admins only' });
        }
    }

    try {
        const { organizationId, to, weekOffset } = req.body || {};
        const overrideRecipients = Array.isArray(to)
            ? to.filter((t: any) => typeof t === 'string')
            : (typeof to === 'string' && to ? [to] : undefined);

        // A manual caller is always pinned to their own organization.
        const targetOrg = isCron ? organizationId : req.user!.organization_id;

        if (targetOrg) {
            const result = await sendWeeklyHighlights(targetOrg, {
                weekOffset: Number(weekOffset) || 0,
                overrideRecipients,
            });
            return res.json(result);
        }

        const summary = await sendWeeklyHighlightsToAllOrgs({
            weekOffset: Number(weekOffset) || 0,
        });
        return res.json(summary);
    } catch (err: any) {
        console.error('[Highlights] Weekly email run failed:', err);
        return res.status(500).json({ error: 'Failed to send weekly highlights', details: err?.message });
    }
};

/**
 * Acknowledge achievement badges so their confetti only ever fires once.
 */
export const acknowledgeAchievements = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization' });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((i: any) => typeof i === 'string') : [];
        await markAchievementsSeen(organizationId, ids);

        return res.json({ acknowledged: ids.length });
    } catch (err: any) {
        console.error('[Highlights] Failed to acknowledge achievements:', err);
        return res.status(500).json({ error: 'Failed to acknowledge achievements' });
    }
};
