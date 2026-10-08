/**
 * savings.service.ts — wishlist items, savings goals and group savings.
 *
 * Each savings item is a real MoneyWise sub-wallet with its own ASSET account (subtype
 * "Savings") of the same name. The ledger already resolves a sub-wallet to the asset account
 * with its name (ledger.service resolveCashAccount), so "add money" and "transfer out" are
 * ordinary wallet-to-wallet transfers — Dr Savings / Cr Main Wallet and back — and every
 * savings pot appears in Reporting as a savings account without special cases.
 *
 * Group savings: the creator's organization holds the wallet. Other MoneyWise users join with
 * an invite code and contribute by mobile money, collected straight into that wallet (the same
 * public collection endpoints the Invest feature uses), so a member's money really lands there.
 */
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { pushService } from './push.service';
import { finalizeIfPaid } from './collectionRecovery.service';
import { ensureSavingsTransferAccount } from './ledger.service';
import { LencoService } from './lenco.service';
import { classifyRecentSavingsEntries } from './inflowClassifier.service';

export type SavingsKind = 'WISHLIST' | 'GOAL' | 'GROUP';

export class SavingsError extends Error {
    constructor(public code: string, message: string, public httpStatus = 400) {
        super(message);
    }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().split('T')[0];
const clean = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function inviteCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid misreads
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

async function displayName(userId: string): Promise<string> {
    const { data } = await supabase.from('users').select('name, email').eq('id', userId).maybeSingle();
    return data?.name || data?.email || 'Member';
}

async function walletBalance(orgId: string, walletId: string): Promise<number> {
    return round2(await cashbookService.getCurrentBalance(orgId, 'MONEYWISE_WALLET', walletId));
}

async function loadGoal(goalId: string) {
    const { data } = await supabase.from('savings_goals').select('*').eq('id', goalId).eq('status', 'ACTIVE').maybeSingle();
    return data as any | null;
}

/** Owner org members manage the pot; group members may only view and contribute. */
async function access(goal: any, orgId: string, userId: string): Promise<'OWNER' | 'MEMBER' | null> {
    if (goal.organization_id === orgId) return 'OWNER';
    if (goal.kind !== 'GROUP') return null;
    const { data } = await supabase.from('savings_group_members').select('id').eq('goal_id', goal.id).eq('user_id', userId).maybeSingle();
    return data ? 'MEMBER' : null;
}

/** Two balanced wallet entries, exactly like a sub-wallet transfer. */
async function moveBetweenWallets(orgId: string, userId: string, fromId: string, toId: string, amount: number, label: string) {
    const { data: wallets } = await supabase.from('organization_wallets').select('id, name').eq('organization_id', orgId).in('id', [fromId, toId]);
    const from = wallets?.find(w => w.id === fromId);
    const to = wallets?.find(w => w.id === toId);
    if (!from || !to) throw new SavingsError('WALLET_NOT_FOUND', 'Wallet not found', 404);

    const available = await walletBalance(orgId, fromId);
    if (available < amount) throw new SavingsError('INSUFFICIENT_FUNDS', `Not enough in ${from.name}. Available: K${available.toFixed(2)}`);

    // Source and destination are both known, so the movement is classified here — no AI, nothing left
    // for the user to assign. Both legs carry the same account; their contras cancel in the ledger.
    const accountId = await ensureSavingsTransferAccount(orgId);
    const classified = accountId ? { account_id: accountId, status: 'ACCOUNTED' } : { status: 'COMPLETED' };

    const desc = `${label}: ${from.name} ➜ ${to.name}`;
    await cashbookService.createEntry(orgId, {
        entry_type: 'ADJUSTMENT', description: `${desc} (Outflow)`, debit: 0, credit: amount, date: today(),
        created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: fromId, ...classified,
    } as any);
    await cashbookService.createEntry(orgId, {
        entry_type: 'ADJUSTMENT', description: `${desc} (Inflow)`, debit: amount, credit: 0, date: today(),
        created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: toId, ...classified,
    } as any);
}

function toSummary(goal: any, balance: number, role: 'OWNER' | 'MEMBER', members: { name: string; userId: string; avatarUrl?: string | null; role?: string }[]) {
    const target = goal.target_amount != null ? Number(goal.target_amount) : null;
    return {
        id: goal.id,
        kind: goal.kind as SavingsKind,
        name: goal.name,
        targetAmount: target,
        imageUrl: goal.image_url,
        description: goal.description ?? null,
        targetDate: goal.target_date ?? null,
        frequency: (goal.frequency ?? null) as 'DAILY' | 'WEEKLY' | 'MONTHLY' | null,
        productUrl: goal.product_url ?? null,
        balance,
        progress: target ? Math.min(1, balance / target) : null,
        walletId: goal.wallet_id,
        organizationId: goal.organization_id,
        role,
        inviteCode: role === 'OWNER' ? goal.invite_code : null,
        members,
        createdAt: goal.created_at,
    };
}

async function membersOf(goalIds: string[]) {
    type M = { name: string; userId: string; avatarUrl: string | null; role: string };
    if (goalIds.length === 0) return new Map<string, M[]>();
    const { data, error } = await supabase
        .from('savings_group_members')
        .select('goal_id, user_id, display_name, role, joined_at, organization_id')
        .in('goal_id', goalIds)
        .order('joined_at', { ascending: true });
    if (error) console.error('[Savings] members lookup failed:', error.message);

    // Logos are looked up separately: the members table has no foreign key to organizations, so a
    // PostgREST embed (organizations(logo_url)) isn't possible and would silently return nothing.
    const orgIds = [...new Set((data ?? []).map(m => m.organization_id).filter(Boolean))] as string[];
    const logos = new Map<string, string | null>();
    if (orgIds.length) {
        const { data: orgs } = await supabase.from('organizations').select('id, logo_url').in('id', orgIds);
        for (const o of orgs ?? []) logos.set(o.id, o.logo_url ?? null);
    }

    const map = new Map<string, M[]>();
    for (const m of data ?? []) {
        const list = map.get(m.goal_id) ?? [];
        list.push({ name: m.display_name || 'Member', userId: m.user_id, avatarUrl: (m.organization_id && logos.get(m.organization_id)) || null, role: m.role });
        map.set(m.goal_id, list);
    }
    return map;
}

/** Asks Lenco about a PENDING mobile-money contribution and records the outcome. */
async function settleContribution(c: any, organizationId: string): Promise<'CONFIRMED' | 'PENDING' | 'FAILED'> {
    const outcome = await finalizeIfPaid(c.reference, organizationId);
    if (outcome === 'finalized') {
        await supabase.from('savings_contributions').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'PENDING');
        return 'CONFIRMED';
    }
    const ageMs = Date.now() - new Date(c.created_at).getTime();
    // Declined at the phone, or never paid within a day: stop showing it as pending.
    if (outcome === 'failed' || ageMs > 24 * 60 * 60 * 1000) {
        await supabase.from('savings_contributions').update({ status: 'FAILED' }).eq('id', c.id).eq('status', 'PENDING');
        return 'FAILED';
    }
    return 'PENDING';
}

/** Before showing balances, settle any of this user's recent deposits that are still pending. */
async function settleMine(userId: string, goalIds?: string[]) {
    let q = supabase
        .from('savings_contributions')
        .select('*, goal:savings_goals(organization_id)')
        .eq('user_id', userId).eq('status', 'PENDING').in('method', ['MOBILE_MONEY', 'WALLET'])
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3);
    if (goalIds?.length) q = q.in('goal_id', goalIds);
    const { data } = await q;
    await Promise.all((data ?? []).map((c: any) => {
        const goal = Array.isArray(c.goal) ? c.goal[0] : c.goal;
        if (String(c.reference || '').startsWith('SVT-')) return settleWalletTransfer(c).catch(() => undefined);
        return goal?.organization_id && c.method === 'MOBILE_MONEY' ? settleContribution(c, goal.organization_id).catch(() => undefined) : undefined;
    }));
}


/**
 * A group member paying from their OWN MoneyWise wallet. They belong to a different organization from the
 * group's owner, so this is a real Lenco merchant-to-merchant transfer (member's Lenco account → the
 * owner's), not a ledger-only move: balances stay true on both sides. The two ledger entries are booked
 * only once Lenco confirms the transfer, both carrying the transfer's reference so the 5-minute Lenco
 * sync recognises them instead of logging the same movement a second time.
 */
async function bookWalletTransfer(c: any, goal: any, memberOrgId: string, sourceWalletId: string, sourceWalletName: string, amount: number) {
    // Flip PENDING → CONFIRMED first: only the caller that wins this update books the entries (idempotent).
    const { data: won } = await supabase.from('savings_contributions')
        .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
        .eq('id', c.id).eq('status', 'PENDING').select('id');
    if (!won || won.length === 0) return;

    const ref = c.reference as string;
    const label = `Savings contribution: ${sourceWalletName} ➜ ${goal.name}`;
    const [memberAcct, ownerAcct] = await Promise.all([ensureSavingsTransferAccount(memberOrgId), ensureSavingsTransferAccount(goal.organization_id)]);
    const classified = (id: string | null) => (id ? { account_id: id, status: 'ACCOUNTED' } : { status: 'COMPLETED' });

    await cashbookService.createEntry(memberOrgId, {
        entry_type: 'ADJUSTMENT', description: `${label} (Outflow) | Ref: ${ref}`, debit: 0, credit: amount, date: today(),
        created_by: c.user_id, account_type: 'MONEYWISE_WALLET', wallet_id: sourceWalletId, external_reference: ref, ...classified(memberAcct),
    } as any);
    await cashbookService.createEntry(goal.organization_id, {
        entry_type: 'ADJUSTMENT', description: `${label} (Inflow) | Ref: ${ref}`, debit: amount, credit: 0, date: today(),
        created_by: c.user_id, account_type: 'MONEYWISE_WALLET', wallet_id: goal.wallet_id, external_reference: ref, ...classified(ownerAcct),
    } as any);
}

/** Asks Lenco whether a pending member wallet transfer went through; books it or fails it. */
async function settleWalletTransfer(c: any): Promise<'CONFIRMED' | 'PENDING' | 'FAILED'> {
    const meta = (c.meta || {}) as any;
    const { data: goal } = await supabase.from('savings_goals').select('*').eq('id', c.goal_id).maybeSingle();
    const { data: member } = await supabase.from('savings_group_members').select('organization_id').eq('goal_id', c.goal_id).eq('user_id', c.user_id).maybeSingle();
    if (!goal || !member?.organization_id) return 'PENDING';
    const { data: org } = await supabase.from('organizations').select('lenco_secret_key').eq('id', member.organization_id).maybeSingle();
    let status: any = null;
    try { status = await LencoService.getTransferStatus(c.reference, (org as any)?.lenco_secret_key || undefined); } catch { return 'PENDING'; }
    const st = String(status?.status || '').toLowerCase();
    if (st === 'successful') {
        const wallet = meta.sourceWalletId ? meta : await loadTransferSource(c.reference);
        if (!wallet?.sourceWalletId) return 'PENDING';
        await bookWalletTransfer(c, goal, member.organization_id, wallet.sourceWalletId, wallet.sourceWalletName || 'MoneyWise wallet', Number(c.amount));
        return 'CONFIRMED';
    }
    if (st === 'failed' || st === 'declined' || st === 'rejected') {
        await supabase.from('savings_contributions').update({ status: 'FAILED' }).eq('id', c.id).eq('status', 'PENDING');
        return 'FAILED';
    }
    if (!status && Date.now() - new Date(c.created_at).getTime() > 60 * 60 * 1000) {
        // Lenco has never heard of it an hour later: the transfer was never sent.
        await supabase.from('savings_contributions').update({ status: 'FAILED' }).eq('id', c.id).eq('status', 'PENDING');
        return 'FAILED';
    }
    return 'PENDING';
}

/** The source wallet for a pending transfer is remembered in app_settings (no schema change needed). */
const transferKey = (ref: string) => `savings_transfer:${ref}`;
async function rememberTransferSource(ref: string, sourceWalletId: string, sourceWalletName: string) {
    await supabase.from('app_settings').upsert({ key: transferKey(ref), value: { sourceWalletId, sourceWalletName }, description: 'Pending group-savings wallet transfer (safe to delete once settled).', updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
async function loadTransferSource(ref: string): Promise<{ sourceWalletId?: string; sourceWalletName?: string } | null> {
    const { data } = await supabase.from('app_settings').select('value').eq('key', transferKey(ref)).maybeSingle();
    return (data?.value as any) ?? null;
}

export const savingsService = {
    async create(params: {
        orgId: string; userId: string; kind: string; name: string; targetAmount?: unknown; imageUrl?: unknown;
        description?: unknown; targetDate?: unknown; frequency?: unknown; productUrl?: unknown;
    }) {
        const kind = params.kind as SavingsKind;
        if (!['WISHLIST', 'GOAL', 'GROUP'].includes(kind)) throw new SavingsError('BAD_KIND', 'Unknown savings type');
        const name = clean(params.name, 60);
        if (name.length < 2) throw new SavingsError('VALIDATION', 'Give it a name');

        let target: number | null = null;
        if (params.targetAmount !== undefined && params.targetAmount !== null && params.targetAmount !== '') {
            target = round2(Number(params.targetAmount));
            if (!Number.isFinite(target) || target <= 0) throw new SavingsError('VALIDATION', 'The target must be more than zero');
        }
        if ((kind === 'WISHLIST' || kind === 'GROUP') && !target) throw new SavingsError('VALIDATION', 'Enter how much you need');

        const imageUrl = typeof params.imageUrl === 'string' && /^https:\/\//.test(params.imageUrl) ? params.imageUrl.slice(0, 500) : null;

        // Optional details. Only sent to the database when given, so creating without them keeps working
        // even before the details migration (20261007120000) has been applied.
        const details: Record<string, any> = {};
        const description = clean(params.description, 500);
        if (description) details.description = description;
        if (typeof params.targetDate === 'string' && params.targetDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(params.targetDate) || Number.isNaN(Date.parse(params.targetDate))) throw new SavingsError('VALIDATION', 'Enter a valid goal date');
            if (params.targetDate <= today()) throw new SavingsError('VALIDATION', 'The goal date must be in the future');
            details.target_date = params.targetDate;
        }
        if (params.frequency) {
            if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(params.frequency))) throw new SavingsError('VALIDATION', 'Choose daily, weekly or monthly');
            details.frequency = params.frequency;
        }
        if (kind === 'WISHLIST' && typeof params.productUrl === 'string' && params.productUrl.trim()) {
            let url = params.productUrl.trim();
            if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
            try { const u = new URL(url); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('bad'); }
            catch { throw new SavingsError('VALIDATION', 'Enter a valid product link'); }
            details.product_url = url.slice(0, 500);
        }

        // The wallet name doubles as the ledger account name, so it must be unique in the org.
        let walletName = `${name} (Savings)`;
        let wallet: any = null;
        for (let attempt = 0; attempt < 3 && !wallet; attempt++) {
            const { data, error } = await supabase
                .from('organization_wallets')
                .insert({ organization_id: params.orgId, name: walletName, is_main: false })
                .select()
                .single();
            if (!error) { wallet = data; break; }
            if ((error as any).code !== '23505') throw new Error(`Could not create the savings wallet: ${error.message}`);
            walletName = `${name} (Savings ${Math.random().toString(36).slice(2, 5).toUpperCase()})`;
        }
        if (!wallet) throw new SavingsError('NAME_TAKEN', 'You already have savings with that name');

        await cashbookService.createEntry(params.orgId, {
            entry_type: 'OPENING_BALANCE', description: `Opening Balance for ${wallet.name}`, debit: 0, credit: 0,
            date: today(), created_by: params.userId, account_type: 'MONEYWISE_WALLET', wallet_id: wallet.id,
        } as any);

        // The asset account the ledger books this wallet to (matched by name).
        const { data: account } = await supabase
            .from('accounts')
            .insert({
                organization_id: params.orgId,
                code: `SAV-${wallet.id.slice(0, 8).toUpperCase()}`,
                name: wallet.name,
                type: 'ASSET',
                subtype: 'Savings',
                description: `${kind === 'WISHLIST' ? 'Wishlist' : kind === 'GROUP' ? 'Group savings' : 'Savings goal'}: ${name}`,
                is_active: true,
            })
            .select('id')
            .single();

        const { data: goal, error: goalErr } = await supabase
            .from('savings_goals')
            .insert({
                organization_id: params.orgId,
                wallet_id: wallet.id,
                account_id: account?.id ?? null,
                kind,
                name,
                target_amount: target,
                image_url: imageUrl,
                invite_code: kind === 'GROUP' ? inviteCode() : null,
                created_by: params.userId,
                ...(kind === 'GROUP' ? {} : details),
            })
            .select('*')
            .single();
        if (goalErr || !goal) {
            // Don't leave an orphan wallet/account behind (e.g. if the savings tables aren't migrated yet).
            if (account?.id) await supabase.from('accounts').delete().eq('id', account.id);
            await supabase.from('cashbook_entries').delete().eq('wallet_id', wallet.id);
            await supabase.from('organization_wallets').delete().eq('id', wallet.id);
            throw new Error(`Could not save: ${goalErr?.message}`);
        }

        let members: { name: string; userId: string; avatarUrl?: string | null; role?: string }[] = [];
        if (kind === 'GROUP') {
            const owner = await displayName(params.userId);
            await supabase.from('savings_group_members').insert({
                goal_id: goal.id, user_id: params.userId, organization_id: params.orgId, display_name: owner, role: 'OWNER',
            });
            members = [{ name: owner, userId: params.userId, avatarUrl: null, role: 'OWNER' }];
        }
        return toSummary(goal, 0, 'OWNER', members);
    },

    /** Everything the caller can see: their own org's savings plus groups they've joined. */
    async list(orgId: string, userId: string) {
        await settleMine(userId).catch(() => undefined);
        await classifyRecentSavingsEntries(orgId).catch(() => 0); // anything still unassigned in a savings pot
        const { data: own } = await supabase
            .from('savings_goals').select('*').eq('organization_id', orgId).eq('status', 'ACTIVE').order('created_at', { ascending: false });
        const { data: memberships } = await supabase.from('savings_group_members').select('goal_id').eq('user_id', userId);
        const joinedIds = (memberships ?? []).map(m => m.goal_id).filter(id => !(own ?? []).some(g => g.id === id));
        const { data: joined } = joinedIds.length
            ? await supabase.from('savings_goals').select('*').in('id', joinedIds).eq('status', 'ACTIVE')
            : { data: [] as any[] };

        const all = [...(own ?? []).map(g => ({ g, role: 'OWNER' as const })), ...(joined ?? []).map(g => ({ g, role: 'MEMBER' as const }))];
        const members = await membersOf(all.filter(x => x.g.kind === 'GROUP').map(x => x.g.id));
        const items = await Promise.all(all.map(async ({ g, role }) =>
            toSummary(g, await walletBalance(g.organization_id, g.wallet_id), role, members.get(g.id) ?? [])));

        const sum = (k: SavingsKind) => round2(items.filter(i => i.kind === k).reduce((s, i) => s + i.balance, 0));
        return {
            wishlist: items.filter(i => i.kind === 'WISHLIST'),
            goals: items.filter(i => i.kind === 'GOAL'),
            groups: items.filter(i => i.kind === 'GROUP'),
            totals: { wishlist: sum('WISHLIST'), goals: sum('GOAL'), groups: sum('GROUP') },
        };
    },

    async detail(goalId: string, orgId: string, userId: string) {
        const goal = await loadGoal(goalId);
        if (!goal) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const role = await access(goal, orgId, userId);
        if (!role) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        await settleMine(userId, [goal.id]).catch(() => undefined);

        const balance = await walletBalance(goal.organization_id, goal.wallet_id);
        const members = (await membersOf([goal.id])).get(goal.id) ?? [];

        // Owners see the wallet's own movements; members see contributions only (not the owner's books).
        let activity: { id: string; date: string; description: string; amount: number; direction: 'IN' | 'OUT' }[] = [];
        if (role === 'OWNER') {
            const entries = await cashbookService.getEntries(goal.organization_id, { accountType: 'MONEYWISE_WALLET', walletId: goal.wallet_id, limit: 40 } as any);
            activity = (entries ?? [])
                .filter((e: any) => e.entry_type !== 'OPENING_BALANCE' && (Number(e.debit) > 0 || Number(e.credit) > 0))
                .map((e: any) => ({
                    id: e.id, date: e.date,
                    description: String(e.description || '').replace(/ \((Inflow|Outflow)\)$/, ''),
                    amount: Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit),
                    direction: Number(e.debit) > 0 ? 'IN' as const : 'OUT' as const,
                }));
        }

        let contributions: { userId: string; name: string; avatarUrl: string | null; amount: number; status: string; date: string; method: string }[] = [];
        let memberSummary: { userId: string; name: string; avatarUrl: string | null; role: string; count: number; total: number }[] = [];
        if (goal.kind === 'GROUP') {
            const { data } = await supabase
                .from('savings_contributions').select('user_id, display_name, amount, status, created_at, method')
                .eq('goal_id', goal.id).neq('status', 'FAILED').order('created_at', { ascending: false }).limit(200);
            const avatar = new Map(members.map(m => [m.userId, m.avatarUrl ?? null]));
            contributions = (data ?? []).map(c => ({
                userId: c.user_id, name: c.display_name || 'Member', avatarUrl: avatar.get(c.user_id) ?? null,
                amount: Number(c.amount), status: c.status, date: c.created_at, method: c.method,
            }));
            // Only money that actually landed counts towards a member's totals.
            memberSummary = members.map(m => {
                const mine = contributions.filter(c => c.userId === m.userId && c.status === 'CONFIRMED');
                return {
                    userId: m.userId, name: m.name, avatarUrl: m.avatarUrl ?? null, role: m.role ?? 'MEMBER',
                    count: mine.length, total: round2(mine.reduce((sum, c) => sum + c.amount, 0)),
                };
            }).sort((a, b) => b.total - a.total);
        }

        return { ...toSummary(goal, balance, role, members), activity, contributions, memberSummary };
    },

    async deposit(params: { goalId: string; orgId: string; userId: string; amount: unknown; sourceWalletId: string }) {
        const goal = await loadGoal(params.goalId);
        if (!goal || goal.organization_id !== params.orgId) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const amount = round2(Number(params.amount));
        if (!Number.isFinite(amount) || amount <= 0) throw new SavingsError('VALIDATION', 'Enter an amount');
        if (params.sourceWalletId === goal.wallet_id) throw new SavingsError('VALIDATION', 'Choose a different wallet to pay from');

        await moveBetweenWallets(params.orgId, params.userId, params.sourceWalletId, goal.wallet_id, amount, 'Savings deposit');
        if (goal.kind === 'GROUP') {
            await supabase.from('savings_contributions').insert({
                goal_id: goal.id, user_id: params.userId, display_name: await displayName(params.userId), amount,
                method: 'WALLET', reference: `SAVW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                status: 'CONFIRMED', confirmed_at: new Date().toISOString(),
            });
        }
        return { balance: await walletBalance(goal.organization_id, goal.wallet_id) };
    },


    /**
     * A group MEMBER (another organization) adds money from their own MoneyWise wallet by a real Lenco
     * transfer into the group's wallet. See bookWalletTransfer for how/when it's booked.
     */
    async memberWalletDeposit(params: { goalId: string; orgId: string; userId: string; amount: unknown; sourceWalletId: string }) {
        const goal = await loadGoal(params.goalId);
        if (!goal || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const role = await access(goal, params.orgId, params.userId);
        if (role === 'OWNER') return this.deposit(params);          // same organization: the normal ledger move
        if (role !== 'MEMBER') throw new SavingsError('NOT_FOUND', 'Savings not found', 404);

        const amount = round2(Number(params.amount));
        if (!Number.isFinite(amount) || amount <= 0) throw new SavingsError('VALIDATION', 'Enter an amount');

        const { data: src } = await supabase.from('organization_wallets').select('id, name').eq('id', params.sourceWalletId).eq('organization_id', params.orgId).maybeSingle();
        if (!src) throw new SavingsError('WALLET_NOT_FOUND', 'Wallet not found', 404);
        const ledger = await walletBalance(params.orgId, src.id);
        if (ledger < amount) throw new SavingsError('INSUFFICIENT_FUNDS', `Not enough in ${src.name}. Available: K${ledger.toFixed(2)}`);

        const [{ data: memberOrg }, { data: ownerOrg }] = await Promise.all([
            supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key').eq('id', params.orgId).maybeSingle(),
            supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key').eq('id', goal.organization_id).maybeSingle(),
        ]);
        const mKey = (memberOrg as any)?.lenco_secret_key as string | undefined;
        const oKey = (ownerOrg as any)?.lenco_secret_key as string | undefined;
        // A real Lenco account id is a UUID. Some organizations were linked with their till number in its place
        // (Lenco then answers "Invalid accountId" for everything), so check before trying to move money.
        const LENCO_ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!LENCO_ACCOUNT_ID.test(String((memberOrg as any)?.lenco_subaccount_id || ''))) {
            console.error(`[Savings] member org ${params.orgId} has an invalid Lenco account id (${(memberOrg as any)?.lenco_subaccount_id}) — wallet transfers unavailable until it's relinked.`);
            throw new SavingsError('UNAVAILABLE', 'Your wallet isn’t fully connected for transfers yet, so we can’t pay from it. Please pay by mobile money for now — our team has been told.', 409);
        }
        if (!LENCO_ACCOUNT_ID.test(String((ownerOrg as any)?.lenco_subaccount_id || ''))) {
            console.error(`[Savings] group owner org ${goal.organization_id} has an invalid Lenco account id (${(ownerOrg as any)?.lenco_subaccount_id}).`);
            throw new SavingsError('UNAVAILABLE', 'This group can’t receive wallet transfers right now. Please pay by mobile money.', 409);
        }
        if (!mKey || !oKey) {
            throw new SavingsError('UNAVAILABLE', 'Paying from a wallet isn’t available for this group right now. Please pay by mobile money.', 409);
        }

        // The money must really be in the member's Lenco account, not just on the ledger.
        const real = await LencoService.getAccountBalance((memberOrg as any).lenco_subaccount_id, mKey).catch(() => null);
        const available = Number(real?.availableBalance ?? real?.balance ?? NaN);
        if (Number.isFinite(available) && available < amount) {
            throw new SavingsError('INSUFFICIENT_FUNDS', `Your wallet doesn’t have K${amount.toFixed(2)} available at the moment.`);
        }

        const owner = await LencoService.getAccountDetails((ownerOrg as any).lenco_subaccount_id, oKey).catch(() => null);
        const till = owner?.details?.tillNumber ? String(owner.details.tillNumber) : '';
        if (!till) throw new SavingsError('UNAVAILABLE', 'The group’s wallet can’t receive a wallet transfer right now. Please pay by mobile money.', 409);

        const reference = `SVT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const { data: contribution, error: insErr } = await supabase.from('savings_contributions').insert({
            goal_id: goal.id, user_id: params.userId, display_name: await displayName(params.userId), amount,
            method: 'WALLET', reference, status: 'PENDING',
        }).select('*').single();
        if (insErr || !contribution) throw new Error(`Could not record the contribution: ${insErr?.message}`);
        await rememberTransferSource(reference, src.id, src.name);

        try {
            await LencoService.transferToLencoMerchant(
                { amount, reference, tillNumber: till, narration: `Savings: ${goal.name}`.slice(0, 60) },
                (memberOrg as any).lenco_subaccount_id, mKey,
            );
        } catch (e: any) {
            await supabase.from('savings_contributions').update({ status: 'FAILED' }).eq('id', contribution.id);
            throw new SavingsError('TRANSFER_FAILED', e?.message || 'The transfer could not be started. Nothing was taken.', 422);
        }

        // Lenco on-us transfers normally settle within seconds: wait briefly, otherwise settle later.
        let outcome: 'CONFIRMED' | 'PENDING' | 'FAILED' = 'PENDING';
        for (let i = 0; i < 6 && outcome === 'PENDING'; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            outcome = await settleWalletTransfer(contribution).catch(() => 'PENDING' as const);
        }
        return { status: outcome, reference, balance: await walletBalance(goal.organization_id, goal.wallet_id) };
    },

    /** "Transfer": move money back out of the savings wallet. Owner organization only. */
    async withdraw(params: { goalId: string; orgId: string; userId: string; amount: unknown; destinationWalletId: string }) {
        const goal = await loadGoal(params.goalId);
        if (!goal || goal.organization_id !== params.orgId) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const amount = round2(Number(params.amount));
        if (!Number.isFinite(amount) || amount <= 0) throw new SavingsError('VALIDATION', 'Enter an amount');
        if (params.destinationWalletId === goal.wallet_id) throw new SavingsError('VALIDATION', 'Choose a different wallet');

        await moveBetweenWallets(params.orgId, params.userId, goal.wallet_id, params.destinationWalletId, amount, 'Savings transfer');
        return { balance: await walletBalance(goal.organization_id, goal.wallet_id) };
    },

    async join(code: unknown, orgId: string, userId: string) {
        const c = clean(code, 12).toUpperCase();
        if (c.length < 6) throw new SavingsError('VALIDATION', 'Enter the invite code');
        const { data: goal } = await supabase.from('savings_goals').select('*').eq('invite_code', c).eq('status', 'ACTIVE').maybeSingle();
        if (!goal || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'That invite code isn’t valid', 404);

        const { error } = await supabase.from('savings_group_members').insert({
            goal_id: goal.id, user_id: userId, organization_id: orgId, display_name: await displayName(userId), role: 'MEMBER',
        });
        if (error && (error as any).code !== '23505') throw new Error(`Could not join: ${error.message}`);
        return { id: goal.id, name: goal.name, alreadyMember: !!error };
    },

    /** A member is about to pay by mobile money: remember who, so the deposit is credited to them. */
    async contributionIntent(params: { goalId: string; orgId: string; userId: string; amount: unknown; reference: unknown }) {
        const goal = await loadGoal(params.goalId);
        if (!goal) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        // Every mobile-money deposit is recorded here (not just group ones) so the server can always
        // find and confirm it later, even if the app was closed before Lenco confirmed.
        if (!(await access(goal, params.orgId, params.userId))) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const amount = round2(Number(params.amount));
        if (!Number.isFinite(amount) || amount <= 0) throw new SavingsError('VALIDATION', 'Enter an amount');
        const reference = typeof params.reference === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(params.reference) ? params.reference : null;
        if (!reference) throw new SavingsError('VALIDATION', 'Invalid reference');

        const { error } = await supabase.from('savings_contributions').insert({
            goal_id: goal.id, user_id: params.userId, display_name: await displayName(params.userId), amount,
            method: 'MOBILE_MONEY', reference, status: 'PENDING',
        });
        if (error && (error as any).code !== '23505') throw new Error(`Could not start the contribution: ${error.message}`);
        return { walletId: goal.wallet_id, organizationId: goal.organization_id, name: goal.name };
    },

    /**
     * Confirms a mobile-money deposit into a savings wallet. Doesn't wait for the app's finalise
     * call or the webhook: if Lenco says it was paid, it books it right here (same finaliser).
     */
    async confirmContribution(goalId: string, reference: string, userId: string) {
        const { data: c } = await supabase.from('savings_contributions').select('*').eq('goal_id', goalId).eq('reference', reference).eq('user_id', userId).maybeSingle();
        if (!c) throw new SavingsError('NOT_FOUND', 'Contribution not found', 404);
        if (c.status !== 'PENDING') return { status: c.status };
        const goal = await loadGoal(goalId);
        if (!goal) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        return { status: await settleContribution(c, goal.organization_id) };
    },

    /** Sweep: settle mobile-money deposits that never got confirmed (called from the automations tick). */
    async confirmPending(budgetMs = 8_000) {
        const started = Date.now();
        const { data: pending } = await supabase
            .from('savings_contributions')
            .select('*, goal:savings_goals(organization_id)')
            .eq('status', 'PENDING')
            .eq('method', 'MOBILE_MONEY')
            .order('created_at', { ascending: true })
            .limit(25);
        const out = { checked: 0, confirmed: 0, failed: 0 };
        for (const c of (pending ?? []) as any[]) {
            if (Date.now() - started > budgetMs) break;
            const goal = Array.isArray(c.goal) ? c.goal[0] : c.goal;
            if (!goal?.organization_id) continue;
            out.checked++;
            const st = await settleContribution(c, goal.organization_id).catch(() => 'PENDING');
            if (st === 'CONFIRMED') out.confirmed++;
            if (st === 'FAILED') out.failed++;
        }
        return out;
    },

    /** Public (no login): what someone sees on an invite link before joining. */
    async preview(code: unknown) {
        const c = clean(code, 12).toUpperCase();
        const { data: goal } = await supabase.from('savings_goals').select('*').eq('invite_code', c).eq('status', 'ACTIVE').maybeSingle();
        if (!goal || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'This invite link isn’t valid any more', 404);
        const members = (await membersOf([goal.id])).get(goal.id) ?? [];
        const balance = await walletBalance(goal.organization_id, goal.wallet_id);
        const target = goal.target_amount != null ? Number(goal.target_amount) : null;
        const organiser = members.find(m => m.role === 'OWNER')?.name ?? 'The organiser';
        return {
            name: goal.name,
            organiser: organiser.split(' ')[0],
            memberCount: members.length,
            targetAmount: target,
            progress: target ? Math.min(1, balance / target) : null,
        };
    },

    /** Owner-only: find MoneyWise users (by email, username or name) to add straight into the group. */
    async searchPeople(goalId: string, orgId: string, userId: string, q: unknown) {
        const goal = await loadGoal(goalId);
        if (!goal || goal.organization_id !== orgId || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'Group not found', 404);
        const query = clean(q, 60).replace(/^@/, '').replace(/[%,()]/g, '');
        if (query.length < 3) return [];

        const { data: users } = await supabase
            .from('users')
            .select('id, name, email, username, organization_id, organization:organizations(logo_url)')
            .or(`email.ilike.%${query}%,username.ilike.%${query}%,name.ilike.%${query}%`)
            .neq('status', 'DISABLED')
            .neq('id', userId)
            .limit(8);
        const memberIds = new Set(((await membersOf([goal.id])).get(goal.id) ?? []).map(m => m.userId));

        const mask = (email?: string | null) => {
            if (!email) return null;
            const [local, domain] = email.split('@');
            return `${local.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(4, local.length - 1)))}@${domain}`;
        };
        return (users ?? []).map((u: any) => {
            const org = Array.isArray(u.organization) ? u.organization[0] : u.organization;
            return {
                userId: u.id as string,
                name: (u.name as string) || (u.username as string) || 'MoneyWise user',
                username: (u.username as string | null) ?? null,
                email: mask(u.email),
                avatarUrl: (org?.logo_url as string | null) ?? null,
                isMember: memberIds.has(u.id),
            };
        });
    },

    /** Owner adds someone who has a MoneyWise account; they're told with a push. */
    async addMember(goalId: string, orgId: string, ownerId: string, newUserId: unknown) {
        const goal = await loadGoal(goalId);
        if (!goal || goal.organization_id !== orgId || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'Group not found', 404);
        if (typeof newUserId !== 'string') throw new SavingsError('VALIDATION', 'Choose a person to add');
        const { data: user } = await supabase.from('users').select('id, name, email, organization_id').eq('id', newUserId).neq('status', 'DISABLED').maybeSingle();
        if (!user) throw new SavingsError('NOT_FOUND', 'That person isn’t on MoneyWise', 404);

        const { error } = await supabase.from('savings_group_members').insert({
            goal_id: goal.id, user_id: user.id, organization_id: user.organization_id ?? null,
            display_name: user.name || user.email || 'Member', role: 'MEMBER',
        });
        if (error && (error as any).code !== '23505') throw new Error(`Could not add them: ${error.message}`);
        if (!error) {
            const inviter = await displayName(ownerId);
            pushService.sendToUser(user.id, {
                title: `You were added to ${goal.name}`,
                body: `${inviter} added you to a group savings. Open Savings to contribute.`,
                data: { type: 'savings_group', id: goal.id },
            }).catch(() => undefined);
        }
        return { added: !error };
    },

    /** A member leaves a group (the organiser can't — they'd close it instead). */
    async leave(goalId: string, orgId: string, userId: string) {
        const goal = await loadGoal(goalId);
        if (!goal) throw new SavingsError('NOT_FOUND', 'Group not found', 404);
        if (goal.organization_id === orgId) throw new SavingsError('OWNER', 'You’re the organiser. Close the group instead.');
        await supabase.from('savings_group_members').delete().eq('goal_id', goalId).eq('user_id', userId);
        return { left: true };
    },

    /** Close a savings item once it's empty (the wallet and its history are kept for the books). */
    async archive(goalId: string, orgId: string) {
        const goal = await loadGoal(goalId);
        if (!goal || goal.organization_id !== orgId) throw new SavingsError('NOT_FOUND', 'Savings not found', 404);
        const balance = await walletBalance(goal.organization_id, goal.wallet_id);
        if (balance > 0.004) throw new SavingsError('NOT_EMPTY', `Transfer the K${balance.toFixed(2)} out first, then close it.`);
        await supabase.from('savings_goals').update({ status: 'ARCHIVED', updated_at: new Date().toISOString() }).eq('id', goal.id);
        return { archived: true };
    },
};
