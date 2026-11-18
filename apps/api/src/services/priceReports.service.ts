/**
 * Shopper price reports. Someone reports a price they saw at a place (ideally with a photo of the tag or receipt) and earns MoneyWise
 * points. Two different shoppers reporting about the same price at the same place confirm it. A price far from the others is held for the
 * team to check, so one bad report can't skew the comparison. Everything a shopper reports is shown as a shopper report until confirmed.
 */
import { supabase } from '../lib/supabase';
import { awardPlatformBonus } from './rewards.service';
import { PriceError, compare, getItem } from './priceCompare.service';

const DAY = 86_400_000;
export const POINTS = { report: 10, photo: 5, confirmed: 20 };
/** Only the first reports of the day earn points, so it can't be farmed. */
const POINTED_PER_DAY = 10;
const REPORTS_PER_DAY = 25;
/** A new price is held for review when it is below this share of, or above this multiple of, the typical price. */
const OUTLIER_LOW = 0.4;
const OUTLIER_HIGH = 2.5;
/** Two reports confirm each other when they are within this share of one another, and this many days apart. */
const CONFIRM_BAND = 0.1;
const CONFIRM_DAYS = 14;
const MAX_AGE_DAYS = 14;

const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** "ShopRite  Garden City" and "Shoprite, Garden-City" should be the same place. */
export const placeKey = (place: string, town?: string | null): string => {
    const skip = ['the', 'shop', 'store', 'ltd', 'limited', 'branch', 'zambia', 'zm'];
    const words = `${place} ${town ?? ''}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !skip.includes(w));
    return [...new Set(words)].sort().join(' ').slice(0, 120);
};

export interface ReportInput { catalogItemId?: string; placeName?: string; town?: string; province?: string; price?: number; observedOn?: string; evidenceUrl?: string; address?: string; phone?: string }

export async function submitReport(userId: string, input: ReportInput) {
    const item = await getItem(String(input.catalogItemId ?? ''));
    const price = Number(input.price);
    if (!(price > 0) || price > 10_000_000) throw new PriceError(`Enter the price for one ${item.unit}.`, 400, 'PRICE');
    const place = clean(input.placeName, 120);
    if (!place || place.length < 2) throw new PriceError('Say where you saw this price.', 400, 'PLACE');
    const town = clean(input.town, 60);
    const observed = clean(input.observedOn, 10) ?? dateOnly(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observed) || Date.parse(observed) > Date.now() + DAY) throw new PriceError('The date can’t be in the future.', 400, 'DATE');
    if (Date.now() - Date.parse(`${observed}T12:00:00Z`) > MAX_AGE_DAYS * DAY) throw new PriceError(`Report prices you saw in the last ${MAX_AGE_DAYS} days.`, 400, 'DATE');
    const evidence = clean(input.evidenceUrl, 500);
    if (evidence && !/^https:\/\//i.test(evidence)) throw new PriceError('The photo link isn’t valid.', 400, 'EVIDENCE');

    const since = new Date(Date.now() - DAY).toISOString();
    const { count: recent } = await supabase.from('price_points').select('id', { count: 'exact', head: true }).eq('reported_by', userId).gte('created_at', since);
    if ((recent ?? 0) >= REPORTS_PER_DAY) throw new PriceError('That’s a lot of reports for one day. Try again tomorrow.', 429, 'RATE');

    const key = placeKey(place, town);
    // The same shopper reporting the same place again within a day corrects their report instead of adding another.
    const { data: mine } = await supabase.from('price_points').select('id, status').eq('catalog_item_id', item.id).eq('reported_by', userId).eq('place_key', key).eq('source_type', 'SHOPPER_REPORT').gte('created_at', since).limit(1).maybeSingle();
    if (mine) {
        const { data: upd } = await supabase.from('price_points').update({ price: round2(price), observed_on: observed, ...(evidence ? { evidence_url: evidence } : {}), updated_at: new Date().toISOString() }).eq('id', mine.id).select('*').single();
        return { report: upd, status: mine.status as string, points: 0, confirmed: false, updated: true, message: 'Thanks, we updated your report.' };
    }

    // A price far from the others waits for the team to look at it.
    let flag: string | null = null;
    const c = await compare(item.id);
    if (c.stats.typical && c.stats.counted >= 2 && (price < c.stats.typical * OUTLIER_LOW || price > c.stats.typical * OUTLIER_HIGH)) flag = 'OUTLIER';
    const status = flag ? 'PENDING' : 'ACTIVE';

    const { data: row, error } = await supabase.from('price_points').insert({
        catalog_item_id: item.id, source_type: 'SHOPPER_REPORT', place_name: place, town, province: clean(input.province, 60), address: clean(input.address, 160), phone: clean(input.phone, 30),
        price: round2(price), observed_on: observed, status, trust: 'ENTERED', evidence_url: evidence, reported_by: userId, created_by: userId, place_key: key, flag, confirmations: 1,
    }).select('*').single();
    if (error) throw error;

    if (status === 'PENDING') return { report: row, status, points: 0, confirmed: false, updated: false, message: 'Thanks! This price is quite different from the others, so we’ll check it before it shows. You’ll get your points then.' };

    const confirmed = await confirmMatches(row);
    const points = await payPoints(userId, row, !!evidence, confirmed);
    const earned = points ? ` You earned ${points} points.` : '';
    return { report: row, status, points, confirmed, updated: false, message: confirmed ? `Thanks! Another shopper reported this too, so it’s now confirmed.${earned}` : `Thanks! Your price is live.${earned}` };
}

/** Points for a live report, within the day's limit. */
async function payPoints(userId: string, row: any, hasPhoto: boolean, confirmed: boolean): Promise<number> {
    const startOfDay = dateOnly(new Date());
    const { count } = await supabase.from('price_points').select('id', { count: 'exact', head: true }).eq('reported_by', userId).gt('points_awarded', 0).gte('created_at', `${startOfDay}T00:00:00Z`);
    let total = 0;
    if ((count ?? 0) < POINTED_PER_DAY) {
        const base = POINTS.report + (hasPhoto ? POINTS.photo : 0);
        if (await awardPlatformBonus(userId, `PRRPT:${row.id}`, base, 'Reported a price')) total += base;
    }
    if (confirmed && (await awardPlatformBonus(userId, `PRCONF:${row.id}`, POINTS.confirmed, 'A price you reported was confirmed'))) total += POINTS.confirmed;
    if (total) await supabase.from('price_points').update({ points_awarded: (row.points_awarded ?? 0) + total }).eq('id', row.id);
    return total;
}

/**
 * Finds other shoppers' live reports of about the same price at the same place. When there are some, they and this one are all marked
 * confirmed, and the earlier reporters are thanked with points.
 */
async function confirmMatches(row: any): Promise<boolean> {
    if (!row.place_key) return false;
    const from = dateOnly(new Date(Date.parse(`${row.observed_on}T12:00:00Z`) - CONFIRM_DAYS * DAY));
    const { data } = await supabase.from('price_points').select('id, price, reported_by, points_awarded').eq('catalog_item_id', row.catalog_item_id).eq('place_key', row.place_key).eq('source_type', 'SHOPPER_REPORT').eq('status', 'ACTIVE').gte('observed_on', from).neq('reported_by', row.reported_by).neq('id', row.id);
    const matches = (data ?? []).filter((m: any) => Math.abs(Number(m.price) - Number(row.price)) / Number(row.price) <= CONFIRM_BAND);
    if (!matches.length) return false;
    const reporters = new Set<string>([row.reported_by, ...matches.map((m: any) => m.reported_by)]);
    const ids = [row.id, ...matches.map((m: any) => m.id)];
    await supabase.from('price_points').update({ trust: 'VERIFIED', confirmations: reporters.size, updated_at: new Date().toISOString() }).in('id', ids);
    for (const m of matches) {
        if (m.reported_by && (await awardPlatformBonus(m.reported_by, `PRCONF:${m.id}`, POINTS.confirmed, 'A price you reported was confirmed'))) {
            await supabase.from('price_points').update({ points_awarded: (m.points_awarded ?? 0) + POINTS.confirmed }).eq('id', m.id);
        }
    }
    return true;
}

/* ───────────── The shopper's own reports, and place suggestions ───────────── */

export async function myReports(userId: string) {
    const { data, error } = await supabase.from('price_points').select('id, catalog_item_id, place_name, town, price, observed_on, status, trust, confirmations, flag, points_awarded, created_at').eq('reported_by', userId).eq('source_type', 'SHOPPER_REPORT').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((r: any) => r.catalog_item_id))];
    const { data: items } = ids.length ? await supabase.from('catalog_items').select('id, name, slug, unit').in('id', ids) : { data: [] as any[] };
    const by = new Map<string, any>((items ?? []).map((i: any) => [i.id, i]));
    const reports = (data ?? []).map((r: any) => ({ ...r, item: by.get(r.catalog_item_id) ?? null }));
    return { reports, totalPoints: reports.reduce((s: number, r: any) => s + (r.points_awarded ?? 0), 0) };
}

/** Places people have already reported prices at, so the form can suggest them (and the same place gets the same spelling). */
export async function knownPlaces(itemId?: string) {
    let q = supabase.from('price_points').select('place_name, town, place_key, observed_on').eq('status', 'ACTIVE').not('place_key', 'is', null).order('observed_on', { ascending: false }).limit(300);
    if (itemId) q = q.eq('catalog_item_id', itemId);
    const { data } = await q;
    const seen = new Map<string, { placeName: string; town: string | null }>();
    for (const r of data ?? []) if (!seen.has(r.place_key)) seen.set(r.place_key, { placeName: r.place_name, town: r.town });
    return { places: [...seen.values()].slice(0, 60) };
}

/* ───────────── The team's review queue ───────────── */

export async function reviewQueue() {
    const { data, error } = await supabase.from('price_points').select('*').eq('status', 'PENDING').order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((r: any) => r.catalog_item_id))];
    const { data: items } = ids.length ? await supabase.from('catalog_items').select('id, name, unit').in('id', ids) : { data: [] as any[] };
    const by = new Map<string, any>((items ?? []).map((i: any) => [i.id, i]));
    const out = [];
    for (const r of data ?? []) {
        const c = await compare(r.catalog_item_id).catch(() => null);
        out.push({ ...r, item: by.get(r.catalog_item_id) ?? null, typical: c?.stats.typical ?? null });
    }
    return { reports: out };
}

export async function approveReport(id: string, note?: string) {
    const { data: row } = await supabase.from('price_points').select('*').eq('id', id).eq('status', 'PENDING').maybeSingle();
    if (!row) throw new PriceError('That report isn’t waiting for review.', 404, 'NOT_FOUND');
    const { data: upd, error } = await supabase.from('price_points').update({ status: 'ACTIVE', flag: null, review_note: clean(note, 200), updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw error;
    const confirmed = row.reported_by ? await confirmMatches(upd) : false;
    const points = row.reported_by ? await payPoints(row.reported_by, upd, !!row.evidence_url, confirmed) : 0;
    return { report: upd, points, confirmed };
}

export async function rejectReport(id: string, note?: string) {
    const { data, error } = await supabase.from('price_points').update({ status: 'REJECTED', review_note: clean(note, 200), updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'PENDING').select('id');
    if (error) throw error;
    if (!data?.length) throw new PriceError('That report isn’t waiting for review.', 404, 'NOT_FOUND');
    return { ok: true };
}
