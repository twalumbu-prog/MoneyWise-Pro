/**
 * internalCall.ts — lets an Assistant tool run one of the app's own HTTP handlers in-process, as the signed-in person.
 *
 * Sending money, investing and the like already have carefully built handlers (balance checks, Lenco, idempotency, the ledger,
 * notifications). Re-implementing any of that for the Assistant would mean two code paths that drift apart; calling the same
 * handler means the Assistant can only ever do exactly what the app does, the same way.
 *
 * Tenancy comes from the AgentContext (the verified JWT), never from the model. Route-level role checks are re-stated on each
 * tool's `allowedRoles` and enforced by the registry before anything runs.
 */
import { AgentContext } from './types';

export interface CallResult { status: number; body: any }

export async function callHandler(
    handler: (req: any, res: any) => any,
    ctx: AgentContext,
    opts: { body?: any; params?: Record<string, string>; query?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<CallResult> {
    let status = 200;
    let body: any = undefined;
    let settled!: (r: CallResult) => void;
    const done = new Promise<CallResult>((r) => { settled = r; });

    const res: any = {
        statusCode: 200,
        headersSent: false,
        status(code: number) { status = code; this.statusCode = code; return this; },
        json(payload: any) { body = payload; this.headersSent = true; settled({ status, body }); return this; },
        send(payload: any) { body = payload; this.headersSent = true; settled({ status, body }); return this; },
        setHeader() { return this; },
        set() { return this; },
        end() { this.headersSent = true; settled({ status, body }); return this; },
    };
    const req: any = {
        user: { id: ctx.userId, organization_id: ctx.organizationId, role: ctx.role },
        body: opts.body ?? {},
        params: opts.params ?? {},
        query: opts.query ?? {},
        headers: opts.headers ?? {},
        get: (h: string) => (opts.headers ?? {})[h.toLowerCase()],
    };

    // A handler answers with res.json() and may keep working afterwards (notifications); we only wait for the answer.
    const run = Promise.resolve(handler(req, res)).then(() => {
        if (!res.headersSent) settled({ status, body });
    }).catch((e: any) => settled({ status: 500, body: { error: e?.message || 'Unexpected error' } }));
    void run;
    return done;
}

/** The error text a handler returned, for the model (and person) to read. */
export const errorOf = (r: CallResult, fallback: string) =>
    (r.body && (r.body.error || r.body.message || r.body.details)) || fallback;
