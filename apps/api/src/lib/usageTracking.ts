/**
 * Daily feature-usage tracking.
 *
 * Every authenticated client (web, iOS, Android) calls this same API, so recording usage here covers all three
 * with one implementation and cannot be forgotten on a new screen. After a successful authenticated request that
 * matches a known feature, one `feature_used` event is sent to PostHog:
 *
 *   distinct id  = the user's id (same id the web/mobile SDKs identify with, so sessions and usage join up)
 *   group        = organization (so PostHog can answer "how many days did THIS business use sales features?")
 *   properties   = feature, feature_group, account_type ('business' | 'personal'), organization_id, platform, role
 *
 * Counting events by `feature` per day, broken down by `account_type`, gives usage frequency; counting distinct
 * `organization_id` per day gives daily-active organisations.
 *
 * Never throws and never delays the response: it runs on the `finish` event and is fire-and-forget.
 */
import { posthogClient } from './posthog';
import { supabase } from './supabase';

export type FeatureGroup =
    | 'money_in'
    | 'money_out'
    | 'sales'
    | 'invoicing'
    | 'expenses'
    | 'reporting'
    | 'payroll'
    | 'savings'
    | 'investing'
    | 'external_tracking'
    | 'customers'
    | 'products';

interface FeatureRule {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    /** Matched against the request path with the query string removed. */
    path: RegExp;
    feature: string;
    group: FeatureGroup;
    /** Extra condition on the request (e.g. only an approval, not every status change). */
    when?: (req: any) => boolean;
    /** Extra properties worth keeping on the event. Keep these small and non-sensitive (no amounts, names or phone numbers). */
    props?: (req: any) => Record<string, unknown>;
}

const ID = '[^/]+';

/**
 * Add a line here to track a new feature. Order only matters for overlapping patterns (first match wins).
 * Both account types share most money features; `account_type` on the event separates them.
 */
const RULES: FeatureRule[] = [
    // ── Money in ──────────────────────────────────────────────────────────────────────────
    { method: 'POST', path: /^\/cashbook\/wallet-deposit-intent$/, feature: 'deposit_started', group: 'money_in' },
    { method: 'POST', path: /^\/lenco\/wallet-deposit-intent$/, feature: 'deposit_started', group: 'money_in' },
    { method: 'POST', path: /^\/cashbook\/inflow$/, feature: 'cash_inflow_logged', group: 'money_in' },
    { method: 'POST', path: /^\/tap\/requests$/, feature: 'payment_requested', group: 'money_in' },
    { method: 'POST', path: /^\/pay-links\/store-link$/, feature: 'payment_link_created', group: 'money_in' },
    { method: 'POST', path: /^\/organizations\/payment-links$/, feature: 'payment_link_created', group: 'money_in' },

    // ── Money out ─────────────────────────────────────────────────────────────────────────
    { method: 'POST', path: new RegExp(`^/requisitions/${ID}/(disburse|auto-disburse|disburse-excess)$`), feature: 'money_sent', group: 'money_out' },
    { method: 'POST', path: new RegExp(`^/requisitions/${ID}/disburse-payroll$`), feature: 'payroll_paid', group: 'payroll' },
    { method: 'POST', path: /^\/pay-links\/pay$/, feature: 'money_sent', group: 'money_out', props: () => ({ channel: 'wallet_to_wallet' }) },
    { method: 'POST', path: /^\/cashbook\/(wallets\/transfer|transfer-to-wallet)$/, feature: 'wallet_transfer', group: 'money_out' },

    // ── Expenses ──────────────────────────────────────────────────────────────────────────
    {
        method: 'POST', path: /^\/requisitions$/, feature: 'expense_requested', group: 'expenses',
        props: (req) => ({ requisition_type: typeof req.body?.type === 'string' ? req.body.type : undefined }),
    },
    {
        method: 'PATCH', path: new RegExp(`^/requisitions/${ID}/status$`), feature: 'expense_approved', group: 'expenses',
        when: (req) => req.body?.status === 'AUTHORISED',
    },
    { method: 'POST', path: /^\/cashbook\/manual-entry$/, feature: 'manual_entry_logged', group: 'expenses', props: (req) => ({ direction: typeof req.body?.direction === 'string' ? req.body.direction : undefined }) },
    { method: 'POST', path: new RegExp(`^/requisitions/${ID}/scan-receipts$`), feature: 'receipt_scanned', group: 'expenses' },
    { method: 'POST', path: /^\/requisitions\/scan-invoice$/, feature: 'receipt_scanned', group: 'expenses' },

    // ── Sales & invoicing ─────────────────────────────────────────────────────────────────
    { method: 'POST', path: /^\/cashbook\/manual-sale$/, feature: 'sale_recorded', group: 'sales', props: () => ({ channel: 'manual' }) },
    { method: 'POST', path: /^\/invoices$/, feature: 'invoice_created', group: 'invoicing' },
    { method: 'POST', path: new RegExp(`^/invoices/${ID}/send$`), feature: 'invoice_sent', group: 'invoicing' },
    { method: 'POST', path: new RegExp(`^/invoices/${ID}/pay-link$`), feature: 'invoice_pay_link_created', group: 'invoicing' },
    { method: 'POST', path: /^\/invoices\/allocate$/, feature: 'invoice_payment_recorded', group: 'invoicing' },
    { method: 'POST', path: /^\/organizations\/products$/, feature: 'product_created', group: 'products' },
    { method: 'POST', path: /^\/crm\/customers$/, feature: 'customer_added', group: 'customers' },
    { method: 'POST', path: /^\/crm\/campaigns\/send$/, feature: 'campaign_sent', group: 'customers' },

    // ── Payroll ───────────────────────────────────────────────────────────────────────────
    { method: 'POST', path: /^\/payroll\/runs(\/import)?$/, feature: 'payroll_run_created', group: 'payroll' },
    { method: 'POST', path: new RegExp(`^/payroll/runs/${ID}/approve$`), feature: 'payroll_run_approved', group: 'payroll' },

    // ── Financial information (the books) ─────────────────────────────────────────────────
    { method: 'POST', path: /^\/journal-entries$/, feature: 'journal_entry_posted', group: 'reporting' },
    { method: 'POST', path: /^\/accounts$/, feature: 'account_created', group: 'reporting' },
    { method: 'POST', path: /^\/budgets$/, feature: 'budget_set', group: 'reporting' },
    {
        method: 'GET', path: /^\/reports\/([a-z-]+)$/, feature: 'report_viewed', group: 'reporting',
        props: (req) => ({ report: String(req.path || '').split('/')[2] }),
    },

    // ── Savings & investing (mostly personal) ─────────────────────────────────────────────
    { method: 'POST', path: /^\/savings$/, feature: 'savings_goal_created', group: 'savings' },
    { method: 'POST', path: new RegExp(`^/savings/${ID}/(deposit|member-deposit)$`), feature: 'savings_deposit', group: 'savings' },
    { method: 'POST', path: new RegExp(`^/savings/${ID}/contributions$`), feature: 'savings_deposit', group: 'savings', props: () => ({ channel: 'group_contribution' }) },
    { method: 'POST', path: new RegExp(`^/savings/${ID}/withdraw$`), feature: 'savings_withdrawal', group: 'savings' },
    { method: 'POST', path: /^\/investments\/(intents|wallet-transfer)$/, feature: 'investment_made', group: 'investing' },
    { method: 'POST', path: /^\/investments\/accounts\/(connect|apply|apply-with-kyc)$/, feature: 'investor_account_linked', group: 'investing' },

    // ── External transactions (money that moved outside MoneyWise) ────────────────────────
    { method: 'POST', path: /^\/momo-capture\/paste$/, feature: 'external_transaction_captured', group: 'external_tracking' },
    { method: 'POST', path: new RegExp(`^/momo-capture/${ID}/post$`), feature: 'external_transaction_posted', group: 'external_tracking' },
    { method: 'POST', path: new RegExp(`^/cashbook/external-wallets/${ID}/import-statement$`), feature: 'external_statement_imported', group: 'external_tracking' },
];

// ── Account type lookup (cached; an organisation's type almost never changes) ──────────────
export type OrgInfo = { accountType: 'business' | 'personal'; name: string | null };
const ORG_TTL_MS = 10 * 60 * 1000;
const orgCache = new Map<string, { at: number; info: OrgInfo }>();
const orgInflight = new Map<string, Promise<OrgInfo | null>>();

export async function loadOrg(organizationId: string): Promise<OrgInfo | null> {
    const hit = orgCache.get(organizationId);
    if (hit && Date.now() - hit.at < ORG_TTL_MS) return hit.info;
    const running = orgInflight.get(organizationId);
    if (running) return running;

    const p = (async () => {
        const { data, error } = await supabase
            .from('organizations')
            .select('name, is_personal')
            .eq('id', organizationId)
            .maybeSingle();
        if (error || !data) return null;
        const info: OrgInfo = { accountType: data.is_personal ? 'personal' : 'business', name: data.name ?? null };
        orgCache.set(organizationId, { at: Date.now(), info });
        if (orgCache.size > 2000) orgCache.clear();
        // Describe the organisation once per cache window so PostHog's group profile carries its type.
        try {
            posthogClient?.groupIdentify({
                groupType: 'organization',
                groupKey: organizationId,
                properties: { name: info.name, account_type: info.accountType },
            });
        } catch { /* analytics must never affect the request */ }
        return info;
    })().finally(() => { orgInflight.delete(organizationId); });
    orgInflight.set(organizationId, p);
    return p;
}

const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

/** Which client made the request. The mobile app and web both send their own User-Agent; fall back to the optional header. */
function platformOf(req: any): 'ios' | 'android' | 'web' | 'api' {
    const declared = String(req.headers['x-client-platform'] || '').toLowerCase();
    if (declared === 'ios' || declared === 'android' || declared === 'web') return declared;
    const ua = String(req.headers['user-agent'] || '');
    if (/okhttp|android/i.test(ua) && !/Mozilla/i.test(ua)) return 'android';
    if (/CFNetwork|Darwin/i.test(ua) && !/Mozilla/i.test(ua)) return 'ios';
    if (/Mozilla/i.test(ua)) return 'web';
    return 'api';
}

/** Express middleware. Mount once, near `broadcastAfterWrite`. */
export function trackFeatureUsage(req: any, res: any, next: any): void {
    if (posthogClient && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'GET')) {
        res.on('finish', () => {
            try {
                if (res.statusCode >= 400) return;
                const user = req.user;
                if (!user?.id || !user.organization_id) return;

                const path = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
                const rule = RULES.find((r) => r.method === req.method && r.path.test(path) && (!r.when || r.when(req)));
                if (!rule) return;

                const extra = rule.props ? rule.props({ ...req, path }) : {};
                void loadOrg(user.organization_id)
                    .then((org) => {
                        posthogClient!.capture({
                            distinctId: String(user.id),
                            event: 'feature_used',
                            properties: {
                                feature: rule.feature,
                                feature_group: rule.group,
                                account_type: org?.accountType ?? 'unknown',
                                organization_id: user.organization_id,
                                role: user.role,
                                platform: platformOf(req),
                                environment: ENVIRONMENT,
                                $groups: { organization: user.organization_id },
                                ...extra,
                            },
                        });
                    })
                    .catch(() => { /* never surface analytics errors */ });
            } catch { /* never surface analytics errors */ }
        });
    }
    next();
}
