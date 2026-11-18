import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { encrypt, decrypt } from '../utils/security.utils';

/**
 * Sage Accounting — Africa region ("Sage Business Cloud Accounting", formerly
 * Pastel My Business Online / Sage One SA), API v2.0.0.
 *
 * This is the cloud Sage product sold in Zambia (and SA, Botswana, Kenya, …).
 * Desktop Pastel Partner / Xpress and Sage 200 Evolution have no cloud API —
 * they need an on-premise Windows connector and are not covered here.
 *
 * Auth (per Sage's developer programme):
 *   - `apikey` query param on every call — ONE key issued by Sage to MoneyWise
 *     as the integrator (env SAGE_API_KEY).
 *   - HTTP Basic auth with the customer's Sage login (username:password).
 *   - `companyid` query param for company-scoped calls.
 *
 * Unlike QuickBooks we don't post requisitions/deposits separately: MoneyWise
 * already keeps a balanced double-entry GL (journal_entries / journal_lines,
 * including MASTERFEES journals), so the integration pushes those journals to
 * Sage via each MoneyWise account's `sage_account_id` mapping.
 */

export const SAGE_PROVIDER = 'SAGE_ACCOUNTING';

/** Sage JournalEntry.Effect: the AccountId side. The ContraAccountId takes the opposite side. */
const EFFECT_DEBIT = 1;

const SYNC_TIME_BUDGET_MS = 25_000;

interface SageCreds { username: string; password: string; companyId: string }

export interface SageLine { sageAccountId: string; debit: number; credit: number; description?: string | null }

export interface SagePair { debitAccountId: string; creditAccountId: string; amount: number; description?: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sage's Africa journal entry is two-sided (Account vs ContraAccount), so a
 * balanced N-line journal is split into debit↔credit pairs. Lines on the same
 * Sage account are netted first (several MoneyWise accounts can map to one
 * Sage account). Pure — exported for tests.
 */
export function toSagePairs(lines: SageLine[]): SagePair[] {
    const net = new Map<string, { amount: number; description?: string | null }>();
    for (const l of lines) {
        const cur = net.get(l.sageAccountId) || { amount: 0, description: l.description };
        cur.amount += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        net.set(l.sageAccountId, cur);
    }
    const debits = [...net].filter(([, v]) => round2(v.amount) > 0).map(([id, v]) => ({ id, left: round2(v.amount), description: v.description }));
    const credits = [...net].filter(([, v]) => round2(v.amount) < 0).map(([id, v]) => ({ id, left: round2(-v.amount), description: v.description }));

    const totalDr = round2(debits.reduce((s, d) => s + d.left, 0));
    const totalCr = round2(credits.reduce((s, c) => s + c.left, 0));
    if (Math.abs(totalDr - totalCr) > 0.01) throw new Error(`Journal is unbalanced (Dr ${totalDr} ≠ Cr ${totalCr})`);

    const pairs: SagePair[] = [];
    let i = 0, j = 0;
    while (i < debits.length && j < credits.length) {
        const amount = round2(Math.min(debits[i].left, credits[j].left));
        if (amount > 0) {
            pairs.push({
                debitAccountId: debits[i].id,
                creditAccountId: credits[j].id,
                amount,
                // With one side a single line (the common case) the many side's text is the useful one.
                description: debits.length >= credits.length ? debits[i].description : credits[j].description,
            });
        }
        debits[i].left = round2(debits[i].left - amount);
        credits[j].left = round2(credits[j].left - amount);
        if (debits[i].left <= 0.001) i++;
        if (credits[j].left <= 0.001) j++;
    }
    return pairs;
}

export class SageService {
    private static getEnv() {
        return {
            apiKey: process.env.SAGE_API_KEY,
            apiBase: (process.env.SAGE_API_BASE || 'https://accounting.sageone.co.za/api/2.0.0').replace(/\/$/, ''),
        };
    }

    static isConfigured(): boolean {
        return !!this.getEnv().apiKey;
    }

    private static async call(
        auth: { username: string; password: string },
        path: string,
        opts: { method?: string; body?: any; companyId?: string; query?: Record<string, string | number> } = {},
    ): Promise<any> {
        const { apiKey, apiBase } = this.getEnv();
        if (!apiKey) throw new Error('Sage integration is not configured (SAGE_API_KEY missing)');

        const params = new URLSearchParams({ apikey: apiKey });
        if (opts.companyId) params.set('companyid', opts.companyId);
        for (const [k, v] of Object.entries(opts.query || {})) params.set(k, String(v));

        const response = await fetch(`${apiBase}/${path}?${params}`, {
            method: opts.method || 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
                'Accept': 'application/json',
                ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        const text = await response.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }

        if (!response.ok) {
            // Never echo the URL — it carries the platform API key.
            const detail = typeof data === 'string' ? data : (data?.Message || data?.message || JSON.stringify(data));
            if (response.status === 401) throw new Error('Sage rejected the login — check the username and password');
            throw new Error(`Sage API ${response.status} on ${path}: ${String(detail).slice(0, 300)}`);
        }
        return data;
    }

    private static async getCreds(organizationId: string): Promise<SageCreds> {
        const { data } = await supabase
            .from('integrations')
            .select('access_token, realm_id, config')
            .eq('provider', SAGE_PROVIDER)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (!data?.access_token || !data.realm_id) throw new Error('Sage is not connected for this organization');
        const plain = decrypt(data.access_token);
        const sep = plain.indexOf(':');
        return { username: plain.slice(0, sep), password: plain.slice(sep + 1), companyId: String(data.realm_id) };
    }

    /** Companies the Sage login can access. Used to verify credentials before saving them. */
    static async listCompanies(username: string, password: string): Promise<Array<{ id: string; name: string }>> {
        const data = await this.call({ username, password }, 'Company/Get');
        const rows: any[] = data?.Results || (Array.isArray(data) ? data : []);
        return rows.map(c => ({ id: String(c.ID), name: c.Name }));
    }

    /**
     * Verify the login and store the connection. When the login has several
     * companies and none was chosen, nothing is saved and the list is returned
     * so the UI can ask which one.
     */
    static async connect(organizationId: string, username: string, password: string, companyId?: string) {
        const companies = await this.listCompanies(username, password);
        if (!companies.length) throw new Error('This Sage login has no companies');

        let company = companyId ? companies.find(c => c.id === String(companyId)) : undefined;
        if (companyId && !company) throw new Error('That company is not available to this Sage login');
        if (!company) {
            if (companies.length > 1) return { connected: false, needsCompany: true, companies };
            company = companies[0];
        }

        const row = {
            provider: SAGE_PROVIDER,
            organization_id: organizationId,
            access_token: encrypt(`${username}:${password}`),
            refresh_token: null,
            token_expires_at: null,
            realm_id: company.id,
            config: { username, companyName: company.name },
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('integrations').upsert(row, { onConflict: 'organization_id,provider' });
        if (error) throw error;
        return { connected: true, companyId: company.id, companyName: company.name };
    }

    static async disconnect(organizationId: string) {
        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('provider', SAGE_PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
    }

    static async getStatus(organizationId: string) {
        const { data } = await supabase
            .from('integrations')
            .select('realm_id, config, updated_at')
            .eq('provider', SAGE_PROVIDER)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (!data) return { configured: this.isConfigured(), connected: false };

        const [{ count: mapped }, { data: syncRows }] = await Promise.all([
            supabase.from('accounts').select('id', { count: 'exact', head: true })
                .eq('organization_id', organizationId).not('sage_account_id', 'is', null),
            supabase.from('sage_journal_sync').select('status, synced_at')
                .eq('organization_id', organizationId).order('synced_at', { ascending: false, nullsFirst: false }).limit(1000),
        ]);
        const counts: Record<string, number> = {};
        for (const r of syncRows || []) counts[r.status] = (counts[r.status] || 0) + 1;

        return {
            configured: this.isConfigured(),
            connected: true,
            companyId: data.realm_id,
            companyName: data.config?.companyName,
            username: data.config?.username,
            connectedAt: data.updated_at,
            mappedAccounts: mapped || 0,
            lastSyncedAt: syncRows?.[0]?.synced_at || null,
            syncCounts: counts,
        };
    }

    /** The Sage chart of accounts (active and inactive), paged through OData $top/$skip. */
    static async fetchAccounts(organizationId: string) {
        const creds = await this.getCreds(organizationId);
        const out: Array<{ id: string; name: string; category: string | null; active: boolean; balance: number }> = [];
        const pageSize = 100;
        for (let skip = 0; skip < 5000; skip += pageSize) {
            const data = await this.call(creds, 'Account/Get', { companyId: creds.companyId, query: { $top: pageSize, $skip: skip } });
            const rows: any[] = data?.Results || [];
            for (const a of rows) {
                out.push({ id: String(a.ID), name: a.Name, category: a.Category?.Description ?? null, active: a.Active !== false, balance: Number(a.Balance) || 0 });
            }
            if (rows.length < pageSize || out.length >= (data?.TotalResults ?? Infinity)) break;
        }
        return out;
    }

    /** MoneyWise GL accounts with their current Sage mapping. */
    static async getMappings(organizationId: string) {
        const { data, error } = await supabase
            .from('accounts')
            .select('id, code, name, type, is_active, sage_account_id, sage_account_name')
            .eq('organization_id', organizationId)
            .order('code', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    static async setMapping(organizationId: string, accountId: string, sageAccountId: string | null, sageAccountName?: string | null) {
        const { error } = await supabase
            .from('accounts')
            .update({ sage_account_id: sageAccountId || null, sage_account_name: sageAccountId ? (sageAccountName || null) : null })
            .eq('id', accountId)
            .eq('organization_id', organizationId);
        if (error) throw error;
    }

    /**
     * Push MoneyWise GL journals in [fromDate, toDate] to Sage. Idempotent:
     * unchanged journals are skipped; a re-posted journal whose lines changed
     * has its old Sage entries deleted and the new ones saved.
     */
    static async syncJournals(organizationId: string, opts: { fromDate: string; toDate: string; limit?: number }) {
        const started = Date.now();
        const creds = await this.getCreds(organizationId);
        const limit = Math.min(Math.max(opts.limit || 200, 1), 1000);

        const { data: journals, error } = await supabase
            .from('journal_entries')
            .select('id, entry_date, description, reference_number, source_type, source_id, journal_lines(account_id, debit, credit, description)')
            .eq('organization_id', organizationId)
            .gte('entry_date', opts.fromDate)
            .lte('entry_date', opts.toDate)
            .order('entry_date', { ascending: true })
            .limit(limit);
        if (error) throw error;

        const { data: accounts } = await supabase
            .from('accounts')
            .select('id, name, sage_account_id')
            .eq('organization_id', organizationId);
        const acctById = new Map((accounts || []).map(a => [a.id, a]));

        const keyOf = (je: any) => (je.source_id ? `${je.source_type}:${je.source_id}` : `JE:${je.id}`);
        const keys = (journals || []).map(keyOf);
        const { data: existingRows } = keys.length
            ? await supabase.from('sage_journal_sync').select('source_key, lines_hash, sage_entry_ids, status')
                .eq('organization_id', organizationId).in('source_key', keys)
            : { data: [] as any[] };
        const existing = new Map((existingRows || []).map(r => [r.source_key, r]));

        const result = { scanned: journals?.length || 0, posted: 0, unchanged: 0, skipped: 0, failed: 0, truncated: false, errors: [] as Array<{ reference: string | null; error: string }> };

        for (const je of journals || []) {
            if (Date.now() - started > SYNC_TIME_BUDGET_MS) { result.truncated = true; break; }
            const sourceKey = keyOf(je);
            const prev = existing.get(sourceKey);
            const lines: any[] = (je as any).journal_lines || [];

            const record = async (patch: Record<string, any>) => {
                await supabase.from('sage_journal_sync').upsert({
                    organization_id: organizationId,
                    source_key: sourceKey,
                    journal_entry_id: je.id,
                    updated_at: new Date().toISOString(),
                    ...patch,
                }, { onConflict: 'organization_id,source_key' });
            };

            const unmapped = [...new Set(lines.filter(l => !acctById.get(l.account_id)?.sage_account_id).map(l => acctById.get(l.account_id)?.name || l.account_id))];
            if (unmapped.length) {
                result.skipped++;
                await record({ status: 'SKIPPED', error: `Map these accounts to Sage first: ${unmapped.join(', ')}` });
                continue;
            }

            const sageLines: SageLine[] = lines.map(l => ({
                sageAccountId: acctById.get(l.account_id)!.sage_account_id!,
                debit: Number(l.debit) || 0,
                credit: Number(l.credit) || 0,
                description: l.description,
            }));
            const linesHash = crypto.createHash('sha1')
                .update(JSON.stringify([je.entry_date, [...sageLines].sort((a, b) => a.sageAccountId.localeCompare(b.sageAccountId) || a.debit - b.debit || a.credit - b.credit).map(l => [l.sageAccountId, l.debit, l.credit])]))
                .digest('hex');

            if (prev?.status === 'SUCCESS' && prev.lines_hash === linesHash) { result.unchanged++; continue; }

            try {
                const pairs = toSagePairs(sageLines);
                if (!pairs.length) { result.skipped++; await record({ status: 'SKIPPED', error: 'Journal nets to zero', lines_hash: linesHash }); continue; }

                // Re-post with different lines: remove what we pushed last time first.
                const oldIds: any[] = (prev?.sage_entry_ids as any[]) || [];
                for (const oldId of oldIds) {
                    await this.call(creds, `JournalEntry/Delete/${oldId}`, { method: 'DELETE', companyId: creds.companyId });
                }
                // Forget them now, so a failed save below doesn't retry deleting entries that are gone.
                if (oldIds.length) await record({ status: 'PENDING', sage_entry_ids: [] });

                const reference = (je.reference_number || `MW-${je.id.slice(0, 8)}`).slice(0, 100);
                const body = pairs.map(p => ({
                    Date: je.entry_date,
                    Effect: EFFECT_DEBIT,
                    AccountId: Number(p.debitAccountId),
                    ContraAccountId: Number(p.creditAccountId),
                    Reference: reference,
                    Description: (p.description || je.description || 'MoneyWise journal').slice(0, 100),
                    Memo: `MoneyWise ${sourceKey}`,
                    TaxTypeId: null,
                    Exclusive: p.amount,
                    Tax: 0,
                    Total: p.amount,
                }));
                const saved = await this.call(creds, 'JournalEntry/SaveBatch', { method: 'POST', companyId: creds.companyId, body });
                const sageIds = (Array.isArray(saved) ? saved : []).map((s: any) => s?.ID).filter(Boolean);

                result.posted++;
                await record({ status: 'SUCCESS', error: null, lines_hash: linesHash, sage_entry_ids: sageIds, synced_at: new Date().toISOString() });
            } catch (err: any) {
                result.failed++;
                result.errors.push({ reference: je.reference_number, error: err.message });
                await record({ status: 'FAILED', error: err.message, lines_hash: null });
            }
        }

        return result;
    }
}
