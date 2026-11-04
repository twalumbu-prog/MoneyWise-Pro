import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { payLinkService } from '../services/payLink.service';
import { ImageSearchError, describeImage } from '../services/imageSearch.service';
import { AdError, cancelCampaign, catalog, createCampaign, myCampaigns, pendingCampaigns, recentReviewed, recordAdEvents, reviewCampaign } from '../services/ads.service';

const ctxOf = (req: any) => ({ userId: req.user.id, orgId: req.user.organization_id, role: req.user.role });

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof AdError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Ads] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

/** GET /marketplace/ads  The prices, the seller's campaigns, the items they can promote and their wallets. */
export const adsOverview = async (req: any, res: Response) => {
    try {
        const orgId = req.user.organization_id;
        const [cat, campaigns, items, wallets] = await Promise.all([
            catalog(),
            myCampaigns(orgId),
            supabase.from('products').select('id, name, image_url, price').eq('organization_id', orgId).eq('is_active', true).eq('marketplace_listed', true).order('created_at', { ascending: false }).limit(200),
            payLinkService.payerWallets(orgId),
        ]);
        res.json({ catalog: cat, campaigns, items: items.data ?? [], wallets });
    } catch (e) { fail(res, e, 'load your ads'); }
};

/** POST /marketplace/ads  { kind, productId?, days, startDate?, walletId?, idempotencyKey? } */
export const buyAd = async (req: any, res: Response) => {
    try {
        const b = req.body ?? {};
        res.status(201).json({ campaign: await createCampaign(ctxOf(req), { kind: b.kind, productId: b.productId, days: Number(b.days), startDate: b.startDate, walletId: b.walletId, idempotencyKey: b.idempotencyKey }) });
    } catch (e) { fail(res, e, 'book the ad'); }
};

/** POST /marketplace/ads/:id/cancel  Withdraws an ad that hasn't been reviewed yet, and returns the payment. */
export const cancelAd = async (req: any, res: Response) => {
    try { res.json(await cancelCampaign(ctxOf(req), req.params.id)); }
    catch (e) { fail(res, e, 'cancel the ad'); }
};

/** POST /marketplace/ads/events  { ids, kind: 'impression' | 'click' } */
export const adEvents = async (req: any, res: Response) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === 'string') : [];
    const kind = req.body?.kind === 'click' ? 'click' : 'impression';
    void recordAdEvents(ids, kind);
    res.json({ ok: true });
};

/** POST /marketplace/image-search  { image: data URL or https link }  What a photo shows and what to search for. */
export const imageSearch = async (req: any, res: Response) => {
    try { res.json(await describeImage(req.user.id, req.body?.image)); }
    catch (e: any) {
        if (e instanceof ImageSearchError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
        console.error('[Marketplace] image search:', e);
        res.status(500).json({ error: 'Could not search with that photo. Please try again.' });
    }
};

/* ── Admin ── */

/** GET /admin/ads  Ads waiting for review, and what was decided recently. */
export const adminAds = async (_req: any, res: Response) => {
    try { res.json({ pending: await pendingCampaigns(), recent: await recentReviewed() }); }
    catch (e) { fail(res, e, 'load the ads'); }
};

/** POST /admin/ads/:id/approve */
export const adminApprove = async (req: any, res: Response) => {
    try { res.json(await reviewCampaign(req.params.id, 'APPROVE', String(req.user?.email ?? req.user?.id ?? 'admin'))); }
    catch (e) { fail(res, e, 'approve the ad'); }
};

/** POST /admin/ads/:id/reject  { reason } */
export const adminReject = async (req: any, res: Response) => {
    try { res.json(await reviewCampaign(req.params.id, 'REJECT', String(req.user?.email ?? req.user?.id ?? 'admin'), req.body?.reason)); }
    catch (e) { fail(res, e, 'reject the ad'); }
};
