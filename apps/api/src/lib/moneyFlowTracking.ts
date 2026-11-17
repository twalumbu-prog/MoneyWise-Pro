/**
 * Money-flow telemetry: how long deposits, collections and payouts take, how often they happen, and how often they fail.
 *
 * Three events, one shape, for every Lenco money movement:
 *
 *   money_flow_started    an attempt began (customer/user submitted it)
 *   money_flow_completed  it finished successfully            → `duration_seconds` = attempt start → confirmed
 *   money_flow_failed     it did not finish                   → `failure_type` says why
 *
 * Properties: flow, direction ('in' | 'out'), account_type ('business' | 'personal'), organization_id, method,
 * reference, provider ('lenco'), and on completion/failure `duration_seconds`.
 *
 *   flow:          deposit | pos_sale | store_link | quick_pay | payment_link | payout
 *   failure_type:  declined (provider/customer's wallet said no) | system_error (our side or Lenco errored) |
 *                  customer_cancelled | expired (prompt timed out / abandoned and cleaned up) | not_found_on_provider
 *
 * Dropped attempts are the `started` events with no `completed`: either a `failed` event (declined/cancelled/expired,
 * emitted by the janitor for abandoned intents) or, for anyone who simply closed the page, a PostHog funnel
 * started → completed. Failure rate = failed ÷ started, per flow, per account type.
 *
 * Never throws and never blocks the caller; with POSTHOG_KEY unset every call is a no-op. Events carry a
 * deterministic uuid so a webhook retry or a poller re-run cannot double-count.
 */
import crypto from 'crypto';
import { posthogClient } from './posthog';
import { supabase } from './supabase';
import { loadOrg } from './usageTracking';

export type FlowType = 'deposit' | 'pos_sale' | 'store_link' | 'quick_pay' | 'payment_link' | 'payout';
export type FlowStage = 'started' | 'completed' | 'failed';
export type FailureType = 'declined' | 'system_error' | 'customer_cancelled' | 'expired' | 'not_found_on_provider';

export interface FlowInput {
    reference: string;
    /** Known flow; when omitted it is worked out from the reference (collections only). */
    flow?: FlowType;
    organizationId?: string | null;
    /** The signed-in person behind it, if any. Public customers have none. */
    userId?: string | null;
    method?: string;
    /** Seconds from attempt start. For collections it is derived from the pending intent when not supplied. */
    durationSeconds?: number;
    failureType?: FailureType;
    errorCode?: string;
    /** How long the Lenco API call itself took (payout initiation), in ms. */
    providerMs?: number;
    /** Do not collapse repeats of the same stage for this reference (a payout retried after a failure). */
    allowRepeat?: boolean;
}

const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const seen = new Map<string, number>();
const SEEN_TTL_MS = 60 * 60 * 1000;

function deterministicUuid(key: string): string {
    const h = crypto.createHash('sha1').update(key).digest('hex');
    const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/** Reference conventions: `…-PL` payment link, `…-PUB` public checkout (store or quick pay), anything else is signed-in. */
async function classifyCollection(reference: string, hint?: FlowType): Promise<FlowType> {
    if (hint) return hint;
    if (reference.endsWith('-PL')) return 'payment_link';
    if (reference.endsWith('-PUB')) {
        const { data } = await supabase.from('quick_link_payments').select('reference').eq('reference', reference).maybeSingle();
        return data ? 'quick_pay' : 'store_link';
    }
    const { data } = await supabase.from('product_sales').select('id').eq('reference', reference).limit(1);
    return data && data.length > 0 ? 'pos_sale' : 'deposit';
}

export function trackFlow(stage: FlowStage, input: FlowInput): void {
    if (!posthogClient || !input.reference) return;
    void (async () => {
        try {
            const event = `money_flow_${stage}`;
            const dedupeKey = `${event}:${input.reference}`;
            if (!input.allowRepeat) {
                const now = Date.now();
                if ((seen.get(dedupeKey) ?? 0) > now - SEEN_TTL_MS) return;
                seen.set(dedupeKey, now);
                if (seen.size > 5000) seen.clear();
            }

            const isPayout = input.flow === 'payout';
            let organizationId = input.organizationId ?? null;
            let durationSeconds = input.durationSeconds;

            // Collections: the pending intent knows the organisation and when the attempt began.
            if (!isPayout && (!organizationId || (durationSeconds == null && stage !== 'started'))) {
                const { data: intent } = await supabase
                    .from('cashbook_entries')
                    .select('organization_id, created_at')
                    .eq('external_reference', input.reference)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (intent) {
                    organizationId = organizationId || intent.organization_id;
                    if (durationSeconds == null && stage !== 'started' && intent.created_at) {
                        durationSeconds = Math.max(0, Math.round((Date.now() - new Date(intent.created_at).getTime()) / 100) / 10);
                    }
                }
            }
            if (!organizationId) return; // can't attribute it to anyone: not useful, and never worth a guess

            const flow = isPayout ? 'payout' : await classifyCollection(input.reference, input.flow);
            const org = await loadOrg(organizationId);
            const anonymous = !input.userId;

            posthogClient!.capture({
                // Public customers are not users: attribute to the organisation and skip creating a person profile.
                distinctId: input.userId ? String(input.userId) : `customer:${input.reference}`,
                event,
                uuid: input.allowRepeat ? undefined : deterministicUuid(dedupeKey),
                properties: {
                    flow,
                    direction: isPayout ? 'out' : 'in',
                    provider: 'lenco',
                    account_type: org?.accountType ?? 'unknown',
                    organization_id: organizationId,
                    method: input.method,
                    reference: input.reference,
                    duration_seconds: durationSeconds,
                    failure_type: input.failureType,
                    error_code: input.errorCode,
                    provider_ms: input.providerMs,
                    environment: ENVIRONMENT,
                    $groups: { organization: organizationId },
                    ...(anonymous ? { $process_person_profile: false } : {}),
                },
            });
        } catch { /* analytics must never affect money movement */ }
    })();
}

/** Map Lenco's classified collection failure code (see classifyLencoFailureReason) to a flow failure type. */
export function failureTypeFromCode(code?: string | null): FailureType {
    return code === 'prompt_expired' ? 'expired' : 'declined';
}

/** How a payout recipient is reached, from the bank code the payout screen sends. */
export function payoutMethod(recipientBankCode?: string | null, paymentMethod?: string | null): string {
    if (paymentMethod === 'MONEYWISE_PAY') return 'moneywise_pay';
    return ['mtn', 'airtel', 'zamtel'].includes(String(recipientBankCode || '').toLowerCase()) ? 'mobile_money' : 'bank';
}

/**
 * A Lenco payout that settled as failed or vanished (webhook, poller, verify). Looks the disbursement up for its
 * start time, organisation and sender, so call it BEFORE the row is deleted. Never throws.
 */
export async function trackPayoutFailure(
    requisitionId: string,
    failureType: FailureType,
    errorCode: string,
): Promise<void> {
    if (!posthogClient) return;
    try {
        const { data: d } = await supabase
            .from('disbursements')
            .select('external_reference, organization_id, cashier_id, payment_method, recipient_bank_code, created_at')
            .eq('requisition_id', requisitionId)
            .maybeSingle();
        if (!d?.external_reference || String(d.external_reference).startsWith('LPLPAY-')) return; // card payouts are Lipila's
        trackFlow('failed', {
            flow: 'payout', reference: d.external_reference, organizationId: d.organization_id, userId: d.cashier_id,
            method: payoutMethod(d.recipient_bank_code, d.payment_method), failureType, errorCode,
            durationSeconds: d.created_at ? Math.round((Date.now() - new Date(d.created_at).getTime()) / 100) / 10 : undefined,
            allowRepeat: false,
        });
    } catch { /* analytics must never affect money movement */ }
}

/** A Lenco payout confirmed by whichever path got there first (webhook, verify, poller, immediate). */
export function trackPayoutCompleted(d: any): void {
    if (!d?.external_reference || String(d.external_reference).startsWith('LPLPAY-')) return; // card payouts are Lipila's
    trackFlow('completed', {
        flow: 'payout', reference: d.external_reference, organizationId: d.organization_id, userId: d.cashier_id,
        method: payoutMethod(d.recipient_bank_code, d.payment_method),
        durationSeconds: d.created_at ? Math.round((Date.now() - new Date(d.created_at).getTime()) / 100) / 10 : undefined,
    });
}
