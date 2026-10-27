/**
 * groupSavings.tools.ts — group savings from chat: share the invite, add people, join with a code, leave.
 *
 * Creating a group is create_savings_pot (kind GROUP) and paying in is add_to_savings; these cover the rest of what the Savings
 * screens do. Adding someone picks them from a list (find_people_for_group → a `choices` widget), never from a guessed name.
 */
import { AgentContext, ToolDefinition, ToolProposal, ChoiceOption } from '../types';
import { savingsService } from '../../savings.service';
import { findPot, savingsInviteLink } from './personal.tools';

const kwacha = (n: number) => `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invalid = (m: string): never => { throw new Error(`INVALID_ARGUMENTS: ${m}`); };
const ALL_ROLES: any[] = ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'AUTHORISER', 'REQUESTOR'];
const proposal = (summary: string, preview: { label: string; value: string }[], warning?: string): ToolProposal =>
    ({ __proposal: true, summary, preview, ...(warning ? { warning } : {}) });

async function ownGroup(ctx: AgentContext, said: string) {
    const pot = await findPot(ctx, said);
    if (pot.kind !== 'GROUP') invalid(`${pot.name} isn't a group savings.`);
    if (pot.role !== 'OWNER') invalid(`Only the organiser of ${pot.name} can do that.`);
    return pot;
}

const getGroupInvite: ToolDefinition = {
    name: 'get_group_invite',
    description: 'The invite link and QR code for a group savings the person organises, to share so others can join.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { group: { type: 'string' } }, required: ['group'] },
    handler: async (ctx, args) => {
        const pot = await ownGroup(ctx, args.group);
        if (!pot.inviteCode) invalid(`${pot.name} has no invite code.`);
        const url = savingsInviteLink(pot.inviteCode!);
        return {
            __widget: true,
            widget: { type: 'qr', spec: { value: url, title: `Join ${pot.name}`, caption: `Invite code ${pot.inviteCode}. Anyone with a MoneyWise account can join and pay in.` } },
            ack: `Showed the invite QR for ${pot.name} (${url}, code ${pot.inviteCode}). Mention they can share the link; don't repeat the card.`,
        };
    },
};

const findPeopleForGroup: ToolDefinition = {
    name: 'find_people_for_group',
    description: 'Search MoneyWise users by name, username or email to add to a group savings the person organises. Shows the matches as a list to tap.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { group: { type: 'string' }, query: { type: 'string', description: 'At least 3 characters.' } }, required: ['group', 'query'] },
    handler: async (ctx, args) => {
        const pot = await ownGroup(ctx, args.group);
        const people = (await savingsService.searchPeople(pot.id, ctx.organizationId, ctx.userId, args.query)).filter((p) => !p.isMember);
        if (people.length === 0) return { matches: [], note: `Nobody new on MoneyWise matches "${args.query}". Offer the invite link instead (get_group_invite).` };
        const options: ChoiceOption[] = people.map((p) => ({
            label: p.name, sublabel: [p.username ? `@${p.username}` : null, p.email].filter(Boolean).join(' · ') || undefined,
            logoUrl: p.avatarUrl, reply: `Add ${p.name}${p.username ? ` (@${p.username})` : ''} to ${pot.name}`,
        }));
        return {
            __widget: true,
            widget: { type: 'choices', spec: { title: `Who should join ${pot.name}?`, options } },
            ack: `Showed ${people.length} match(es) to tap. When they choose, call add_group_member with that person's userId: ` +
                people.map((p) => `${p.name}${p.username ? ` @${p.username}` : ''} → ${p.userId}`).join('; ') + '. Ask which one in one line.',
        };
    },
};

const addGroupMember: ToolDefinition = {
    name: 'add_group_member',
    description: 'Add a MoneyWise user to a group savings the person organises. userId comes from find_people_for_group. They are told with a notification.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { group: { type: 'string' }, userId: { type: 'string' }, name: { type: 'string', description: 'Their name, as shown in the list.' } }, required: ['group', 'userId'] },
    handler: async (ctx, args) => {
        const pot = await ownGroup(ctx, args.group);
        if (!/^[0-9a-f-]{36}$/i.test(String(args.userId ?? ''))) invalid('Pick the person with find_people_for_group first.');
        if (pot.members.some((m: any) => m.userId === args.userId)) invalid(`They're already in ${pot.name}.`);
        return proposal(`Add ${args.name ?? 'this person'} to ${pot.name}`, [
            { label: 'Group', value: pot.name }, { label: 'Person', value: String(args.name ?? 'Selected MoneyWise user') },
            { label: 'Members now', value: String(pot.members.length) },
        ]);
    },
    execute: async (ctx, args) => {
        const pot = await ownGroup(ctx, args.group);
        const r = await savingsService.addMember(pot.id, ctx.organizationId, ctx.userId, args.userId);
        return { added: r.added, group: pot.name, note: r.added ? 'They were sent a notification.' : 'They were already a member.' };
    },
};

const joinGroupSavings: ToolDefinition = {
    name: 'join_group_savings',
    description: 'Join someone else\'s group savings with the invite code (6+ letters) or the invite link they shared.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'The code, or the whole link.' } }, required: ['code'] },
    handler: async (ctx, args) => {
        const code = codeOf(args.code);
        const g = await savingsService.preview(code).catch(() => invalid(`"${args.code}" isn't a valid invite. Check the code with whoever shared it.`));
        return proposal(`Join ${g.name}`, [
            { label: 'Group', value: g.name }, { label: 'Organiser', value: g.organiser }, { label: 'Members', value: String(g.memberCount) },
            ...(g.targetAmount ? [{ label: 'Target', value: kwacha(g.targetAmount) }] : []),
            ...(g.progress != null ? [{ label: 'Saved so far', value: `${Math.round(g.progress * 100)}%` }] : []),
        ]);
    },
    execute: async (ctx, args) => {
        const r = await savingsService.join(codeOf(args.code), ctx.organizationId, ctx.userId);
        return { joined: true, group: r.name, already_member: r.alreadyMember, next: 'They can now pay in with add_to_savings.' };
    },
};

const codeOf = (v: string) => String(v ?? '').trim().split('/').filter(Boolean).pop()!.toUpperCase();

const leaveGroupSavings: ToolDefinition = {
    name: 'leave_group_savings',
    description: 'Leave a group savings the person joined (not one they organise). What they already paid in stays in the group.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { group: { type: 'string' } }, required: ['group'] },
    handler: async (ctx, args) => {
        const pot = await findPot(ctx, args.group);
        if (pot.kind !== 'GROUP') invalid(`${pot.name} isn't a group savings.`);
        if (pot.role === 'OWNER') invalid(`They organise ${pot.name}, so they can't leave it — it can be closed in Savings once it's empty.`);
        return proposal(`Leave ${pot.name}`, [{ label: 'Group', value: pot.name }], 'Money you already contributed stays in the group.');
    },
    execute: async (ctx, args) => {
        const pot = await findPot(ctx, args.group);
        await savingsService.leave(pot.id, ctx.organizationId, ctx.userId);
        return { left: true, group: pot.name };
    },
};

export const groupSavingsTools: ToolDefinition[] = [getGroupInvite, findPeopleForGroup, addGroupMember, joinGroupSavings, leaveGroupSavings];
