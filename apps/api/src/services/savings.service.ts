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

    const desc = `${label}: ${from.name} ➜ ${to.name}`;
    await cashbookService.createEntry(orgId, {
        entry_type: 'ADJUSTMENT', description: `${desc} (Outflow)`, debit: 0, credit: amount, date: today(),
        created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: fromId, status: 'COMPLETED',
    } as any);
    await cashbookService.createEntry(orgId, {
        entry_type: 'ADJUSTMENT', description: `${desc} (Inflow)`, debit: amount, credit: 0, date: today(),
        created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: toId, status: 'COMPLETED',
    } as any);
}

function toSummary(goal: any, balance: number, role: 'OWNER' | 'MEMBER', members: { name: string; userId: string }[]) {
    const target = goal.target_amount != null ? Number(goal.target_amount) : null;
    return {
        id: goal.id,
        kind: goal.kind as SavingsKind,
        name: goal.name,
        targetAmount: target,
        imageUrl: goal.image_url,
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
    if (goalIds.length === 0) return new Map<string, { name: string; userId: string }[]>();
    const { data } = await supabase
        .from('savings_group_members')
        .select('goal_id, user_id, display_name, role, joined_at')
        .in('goal_id', goalIds)
        .order('joined_at', { ascending: true });
    const map = new Map<string, { name: string; userId: string }[]>();
    for (const m of data ?? []) {
        const list = map.get(m.goal_id) ?? [];
        list.push({ name: m.display_name || 'Member', userId: m.user_id });
        map.set(m.goal_id, list);
    }
    return map;
}

export const savingsService = {
    async create(params: { orgId: string; userId: string; kind: string; name: string; targetAmount?: unknown; imageUrl?: unknown }) {
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
            })
            .select('*')
            .single();
        if (goalErr || !goal) throw new Error(`Could not save: ${goalErr?.message}`);

        let members: { name: string; userId: string }[] = [];
        if (kind === 'GROUP') {
            const owner = await displayName(params.userId);
            await supabase.from('savings_group_members').insert({
                goal_id: goal.id, user_id: params.userId, organization_id: params.orgId, display_name: owner, role: 'OWNER',
            });
            members = [{ name: owner, userId: params.userId }];
        }
        return toSummary(goal, 0, 'OWNER', members);
    },

    /** Everything the caller can see: their own org's savings plus groups they've joined. */
    async list(orgId: string, userId: string) {
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

        let contributions: { name: string; amount: number; status: string; date: string; method: string }[] = [];
        if (goal.kind === 'GROUP') {
            const { data } = await supabase
                .from('savings_contributions').select('display_name, amount, status, created_at, method')
                .eq('goal_id', goal.id).neq('status', 'FAILED').order('created_at', { ascending: false }).limit(50);
            contributions = (data ?? []).map(c => ({ name: c.display_name || 'Member', amount: Number(c.amount), status: c.status, date: c.created_at, method: c.method }));
        }

        return { ...toSummary(goal, balance, role, members), activity, contributions };
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
        if (!goal || goal.kind !== 'GROUP') throw new SavingsError('NOT_FOUND', 'Group not found', 404);
        if (!(await access(goal, params.orgId, params.userId))) throw new SavingsError('NOT_FOUND', 'Group not found', 404);
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

    /** Marks a mobile-money contribution confirmed once its deposit is in the group wallet's ledger. */
    async confirmContribution(goalId: string, reference: string, userId: string) {
        const { data: c } = await supabase.from('savings_contributions').select('*').eq('goal_id', goalId).eq('reference', reference).eq('user_id', userId).maybeSingle();
        if (!c) throw new SavingsError('NOT_FOUND', 'Contribution not found', 404);
        if (c.status !== 'PENDING') return { status: c.status };
        const goal = await loadGoal(goalId);
        if (!goal) throw new SavingsError('NOT_FOUND', 'Group not found', 404);

        const { data: deposit } = await supabase
            .from('cashbook_entries').select('id')
            .eq('organization_id', goal.organization_id).eq('external_reference', reference).gt('debit', 0)
            .limit(1).maybeSingle();
        if (!deposit) return { status: 'PENDING' };
        await supabase.from('savings_contributions').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'PENDING');
        return { status: 'CONFIRMED' };
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
