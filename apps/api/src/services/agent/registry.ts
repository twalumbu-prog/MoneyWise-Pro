/**
 * registry.ts — The single door every tool call goes through.
 *
 * Centralising dispatch is what makes the safety properties hold: tenancy is
 * injected rather than accepted, role checks run before any handler, unknown
 * tool names produce a corrective error instead of `undefined`, and writes
 * cannot reach `execute()` without an approval having been recorded.
 */

import { AgentContext, AppRole, ToolDefinition } from './types';
import { readTools } from './tools/read.tools';
import { writeTools } from './tools/write.tools';
import { vizTools } from './tools/viz.tools';
import { guideTools } from './tools/guide.tools';
import { reconcileTools } from './tools/reconcile.tools';
import { exportTools } from './tools/export.tools';

const ALL_TOOLS: ToolDefinition[] = [...readTools, ...vizTools, ...guideTools, ...reconcileTools, ...exportTools, ...writeTools];

const BY_NAME = new Map(ALL_TOOLS.map(t => [t.name, t]));

if (BY_NAME.size !== ALL_TOOLS.length) {
    throw new Error('[Agent] Duplicate tool name in registry');
}

for (const t of ALL_TOOLS) {
    if (t.effect === 'write' && !t.execute) {
        throw new Error(`[Agent] Write tool "${t.name}" has no execute() — it could never be committed`);
    }
    if (t.parameters?.properties?.organizationId) {
        throw new Error(`[Agent] Tool "${t.name}" exposes organizationId to the model; the server injects it`);
    }
}

export function getTool(name: string): ToolDefinition | undefined {
    return BY_NAME.get(name);
}

function canUse(tool: ToolDefinition, role: string): boolean {
    if (!tool.allowedRoles) return true;
    return tool.allowedRoles.includes(role as AppRole);
}

/**
 * Tool list for this caller, in OpenAI function-calling format. Tools the
 * caller's role can't use are withheld entirely rather than offered and
 * refused — the model shouldn't propose what it can't deliver.
 */
export function toolsForRole(role: string) {
    return ALL_TOOLS.filter(t => canUse(t, role)).map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        },
    }));
}

export interface DispatchResult {
    ok: boolean;
    /** Value handed back to the model as the tool result. */
    result: any;
}

/**
 * Run a tool's read path (`handler`). For write tools this yields a proposal,
 * never a mutation.
 */
export async function dispatch(ctx: AgentContext, name: string, args: any): Promise<DispatchResult> {
    const tool = BY_NAME.get(name);
    if (!tool) {
        return {
            ok: false,
            result: { error: `Unknown tool "${name}". Available: ${[...BY_NAME.keys()].join(', ')}.` },
        };
    }
    if (!canUse(tool, ctx.role)) {
        return {
            ok: false,
            result: { error: `The signed-in user's role (${ctx.role}) is not permitted to use ${name}. Tell the user they need a different role.` },
        };
    }

    try {
        return { ok: true, result: await tool.handler(ctx, args ?? {}) };
    } catch (err: any) {
        // Handler errors are fed back verbatim: INVALID_ARGUMENTS messages are
        // written for the model to read and retry against.
        return { ok: false, result: { error: err?.message || 'Tool failed' } };
    }
}

/** Commit an approved write. Re-checks the role — approval is not authorisation. */
export async function commit(ctx: AgentContext, name: string, args: any): Promise<DispatchResult> {
    const tool = BY_NAME.get(name);
    if (!tool) return { ok: false, result: { error: `Unknown tool "${name}".` } };
    if (tool.effect !== 'write' || !tool.execute) {
        return { ok: false, result: { error: `Tool "${name}" is not a write tool.` } };
    }
    if (!canUse(tool, ctx.role)) {
        return { ok: false, result: { error: `Role ${ctx.role} may not perform ${name}.` } };
    }

    try {
        return { ok: true, result: await tool.execute(ctx, args ?? {}) };
    } catch (err: any) {
        return { ok: false, result: { error: err?.message || 'Write failed' } };
    }
}

export { ALL_TOOLS };
