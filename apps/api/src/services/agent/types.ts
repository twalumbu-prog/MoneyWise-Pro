/**
 * types.ts — Shared contracts for the MoneyWise agent.
 *
 * Everything the agent can do is a `ToolDefinition`. The loop never talks to
 * Supabase directly and the model never sees an organization id: `AgentContext`
 * carries tenancy and the registry injects it into every handler. That's the
 * single choke point that keeps one org's data out of another org's answers.
 */

export type ToolEffect = 'read' | 'write';

/** The roles that actually exist: users.role CHECK constraint in schema.sql. */
export type AppRole = 'ADMIN' | 'AUTHORISER' | 'ACCOUNTANT' | 'REQUESTOR' | 'CASHIER';

/** Per-request tenancy + identity. Built from the verified JWT, never from the model. */
export interface AgentContext {
    organizationId: string;
    userId: string;
    role: AppRole | string;
    /** Server clock, so every tool and the prompt agree on "today". */
    today: string;
}

/**
 * A write tool returns one of these instead of performing the write. The loop
 * turns it into an `approval_request` event and stops. Nothing touches the
 * database until a human posts back an approval carrying the same call id.
 */
export interface ToolProposal {
    __proposal: true;
    /** One-line human summary rendered as the card headline. */
    summary: string;
    /** Field-by-field preview the user actually reads before approving. */
    preview: Array<{ label: string; value: string }>;
    /** Extra caution note shown in amber on the card. */
    warning?: string;
}

export function isProposal(v: unknown): v is ToolProposal {
    return !!v && typeof v === 'object' && (v as any).__proposal === true;
}

/**
 * Widgets are structured render instructions, not model-authored markup. The
 * client maps `type` to a vetted React component; anything unrecognised is
 * dropped rather than rendered.
 */
export type Widget =
    | { type: 'chart'; spec: ChartSpec }
    | { type: 'table'; spec: TableSpec }
    | { type: 'kpi'; spec: KpiSpec }
    | { type: 'file'; spec: FileSpec };

export interface ChartSpec {
    kind: 'bar' | 'line' | 'area' | 'pie' | 'donut';
    title: string;
    subtitle?: string;
    /** Key in each data row used for the category axis / slice label. */
    xKey: string;
    /** One entry per plotted measure. */
    series: Array<{ key: string; label: string }>;
    data: Array<Record<string, string | number>>;
    /** Formats value axis + tooltips. Defaults to currency (ZMW). */
    valueFormat?: 'currency' | 'number' | 'percent';
    stacked?: boolean;
}

export interface TableSpec {
    title: string;
    columns: Array<{ key: string; label: string; align?: 'left' | 'right'; format?: 'currency' | 'number' | 'date' | 'text' }>;
    rows: Array<Record<string, string | number | null>>;
    /** Optional footer row, e.g. totals. */
    total?: Record<string, string | number>;
}

/**
 * A generated download — a PDF report or Excel export the model produced.
 * Rides through the exact same Widget/WidgetResult pipeline as charts and
 * tables (see tools/viz.tools.ts's WidgetResult) rather than a parallel
 * mechanism, so the loop, persistence and SSE framing all needed zero
 * changes. `url` is a signed Supabase Storage URL, time-limited — see
 * SIGNED_URL_TTL_SECONDS in tools/export.tools.ts.
 */
export interface FileSpec {
    name: string;
    url: string;
    kind: 'pdf' | 'xlsx';
    /** Human-readable size, e.g. "184 KB". */
    sizeLabel?: string;
}

export interface KpiSpec {
    title?: string;
    items: Array<{
        label: string;
        value: string;
        /** Percentage change vs the comparison period, if the tool computed one. */
        delta?: number;
        hint?: string;
    }>;
}

export interface ToolDefinition {
    name: string;
    description: string;
    /** JSON Schema for arguments. Must NOT declare organizationId — the server injects it. */
    parameters: Record<string, any>;
    effect: ToolEffect;
    /** Roles allowed to invoke this tool. Enforced server-side, before the handler runs. */
    allowedRoles?: AppRole[];
    /**
     * Read tools return data. Write tools return a ToolProposal on the first
     * pass; `execute` is what actually commits once a human approves.
     */
    handler: (ctx: AgentContext, args: any) => Promise<any>;
    /** Required for `effect: 'write'`. Runs only after explicit approval. */
    execute?: (ctx: AgentContext, args: any) => Promise<any>;
}

// ─── Stream events (server → client) ─────────────────────────────────────────

export type AgentEvent =
    /** Thread id, echoed on the first event so the client can persist it. */
    | { type: 'thread'; threadId: string }
    /** A tool is about to run. Rendered as a step in the activity timeline. */
    | { type: 'tool_call'; id: string; name: string; args: Record<string, any>; effect: ToolEffect }
    /** Tool finished. `summary` is a short human line; full data stays server-side. */
    | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string }
    /**
     * The model is working but has produced nothing yet. Emitted before every
     * model call so the UI never sits on dead air — the gap before the first
     * token is the longest silence in a turn.
     */
    | { type: 'status'; phase: 'thinking' | 'working' }
    /** Reasoning tokens, streamed. Shown as a collapsible thinking trace. */
    | { type: 'thinking'; delta: string }
    /** Assistant prose, streamed token by token. */
    | { type: 'text'; delta: string }
    /** A vetted visualization to render inline. */
    | { type: 'widget'; widget: Widget }
    /** Loop halted pending a human decision on a write. */
    | { type: 'approval_request'; callId: string; toolName: string; proposal: Omit<ToolProposal, '__proposal'>; args: Record<string, any> }
    /** Terminal. `reason` explains why the loop ended. */
    | { type: 'done'; reason: 'complete' | 'awaiting_approval' | 'step_limit' | 'time_limit'; messageId?: string }
    | { type: 'error'; message: string };
