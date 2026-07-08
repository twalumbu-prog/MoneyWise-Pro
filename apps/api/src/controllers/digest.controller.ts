import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

interface DigestCard {
    id: string;
    title: string;
    body: string;
    tone: 'positive' | 'neutral' | 'warning';
}

const money = (n: number) =>
    `K${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / Math.abs(prev)) * 100);
};

/**
 * Financial Digest — bite-size "here's what changed since you were last here"
 * summaries for the Reports screen. We compute the raw week-over-week movement
 * from the cashbook ledger server-side, then (optionally) let Gemini phrase it
 * in a warm, encouraging voice. If the model is unavailable or misbehaves we
 * fall back to deterministic phrasing so the endpoint always returns cards.
 */
export const getFinancialDigest = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization' });

        const now = new Date();
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 7);
        const lastWeekStart = new Date(now); lastWeekStart.setDate(now.getDate() - 14);

        const { data: entries, error } = await supabase
            .from('cashbook_entries')
            .select('debit, credit, description, date, entry_type, created_at')
            .eq('organization_id', organizationId)
            .neq('status', 'PENDING')
            .gte('date', iso(lastWeekStart));

        if (error) throw error;

        const rows = entries || [];
        const inWindow = (r: any, start: Date, end: Date) => {
            const t = new Date(r.date || r.created_at).getTime();
            return t >= start.getTime() && t < end.getTime();
        };

        const sum = (arr: any[], key: 'debit' | 'credit') =>
            arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

        const thisWeek = rows.filter(r => inWindow(r, thisWeekStart, now));
        const lastWeek = rows.filter(r => inWindow(r, lastWeekStart, thisWeekStart));

        // In this ledger, debit = money in, credit = money out.
        const revThis = sum(thisWeek, 'debit');
        const revPrev = sum(lastWeek, 'debit');
        const expThis = sum(thisWeek, 'credit');
        const expPrev = sum(lastWeek, 'credit');

        // Largest single new inflow this week (nice "you made a sale" moment).
        const topInflow = [...thisWeek]
            .filter(r => Number(r.debit) > 0)
            .sort((a, b) => Number(b.debit) - Number(a.debit))[0];

        // Build the raw signal set. We only surface a card when there's a real
        // movement so the digest never pads itself with empty noise.
        const signals: DigestCard[] = [];

        if (revThis > 0 || revPrev > 0) {
            const change = pctChange(revThis, revPrev);
            const extra = revThis - revPrev;
            signals.push({
                id: 'revenue',
                tone: change >= 0 ? 'positive' : 'warning',
                title: 'Revenue this week',
                body: change >= 0
                    ? `Your revenue is up ${change}% this week. You made an extra ${money(extra)} compared to last week.`
                    : `Revenue dipped ${Math.abs(change)}% this week, ${money(extra)} less than last week.`,
            });
        }

        if (expThis > 0 || expPrev > 0) {
            const change = pctChange(expThis, expPrev);
            signals.push({
                id: 'expenses',
                tone: change <= 0 ? 'positive' : 'neutral',
                title: 'Spending this week',
                body: change <= 0
                    ? `Spending is down ${Math.abs(change)}% this week — ${money(expThis)} out the door versus ${money(expPrev)} last week.`
                    : `Spending rose ${change}% this week to ${money(expThis)}. Worth a quick look at where it went.`,
            });
        }

        const netThis = revThis - expThis;
        const netPrev = revPrev - expPrev;
        if (netThis !== 0 || netPrev !== 0) {
            signals.push({
                id: 'net',
                tone: netThis >= 0 ? 'positive' : 'warning',
                title: 'Net position',
                body: netThis >= 0
                    ? `You're net positive by ${money(netThis)} this week. Keep it up!`
                    : `You spent ${money(netThis)} more than you brought in this week.`,
            });
        }

        if (topInflow && Number(topInflow.debit) > 0) {
            const label = (topInflow.description || 'A payment').split(' | Ref:')[0].split('PENDING_INTENT:').pop();
            signals.push({
                id: 'top-inflow',
                tone: 'positive',
                title: 'Biggest win',
                body: `Your largest inflow this week was ${money(Number(topInflow.debit))} from ${label}.`,
            });
        }

        if (signals.length === 0) {
            return res.json({
                cards: [{
                    id: 'quiet',
                    tone: 'neutral',
                    title: 'All quiet',
                    body: "No major money movements since you were last here. We'll flag anything new the moment it lands.",
                }],
            });
        }

        // Try to warm up the phrasing with Gemini; fall back to the deterministic
        // signals if the model isn't configured or returns something unusable.
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) return res.json({ cards: signals.slice(0, 5) });

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
            const prompt = `You are a friendly financial assistant for a small-business owner using MoneyWise.
Rewrite each of these raw financial signals as an upbeat, bite-size digest card. Keep each body under 30 words, plain and encouraging, currency stays in Kwacha (K). Do NOT invent numbers — only rephrase what's given.
Return STRICT JSON: {"cards":[{"id","title","body","tone"}]}. Keep the same id and tone for each signal, keep at most 5 cards, most important first.

SIGNALS:
${JSON.stringify(signals)}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json' },
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
                        const cleaned: DigestCard[] = parsed.cards
                            .filter((c: any) => c && c.title && c.body)
                            .slice(0, 5)
                            .map((c: any, i: number) => ({
                                id: c.id || `card-${i}`,
                                title: String(c.title),
                                body: String(c.body),
                                tone: ['positive', 'neutral', 'warning'].includes(c.tone) ? c.tone : 'neutral',
                            }));
                        if (cleaned.length > 0) return res.json({ cards: cleaned });
                    }
                }
            }
        } catch (aiErr) {
            console.error('[Digest] Gemini phrasing failed, using raw signals:', aiErr);
        }

        return res.json({ cards: signals.slice(0, 5) });
    } catch (err: any) {
        console.error('[Digest] Failed to build financial digest:', err);
        return res.status(500).json({ error: 'Failed to build digest' });
    }
};
