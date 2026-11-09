/**
 * Financial statements read straight from the double-entry general ledger (journal_entries / journal_lines).
 *
 *   • Trial balance               — closing debit/credit per account + the period's activity
 *   • Statement of cash flows     — INDIRECT method, derived from the GL (see below)
 *   • Statement of changes in equity
 *   • General ledger (account transactions) with running balance
 *
 * Why indirect: the GL records every movement of every account, so the indirect cash flow is exact by construction —
 * every posting balances, hence  Δcash = −Σ Δ(every other account)  =  net profit + Σ (−Δ debit-balance of non-cash BS accounts).
 * A direct statement would need each cash posting tagged with its counter-party class, and the ledger does not guarantee that
 * (uncategorised money sits in Suspense), so the indirect method is the one that always ties to the balance sheet.
 *
 * All three statements use ONE data load (`loadGl`) — the same `report_account_balances` roll-up the Net Worth / P&L screens read —
 * so they cannot disagree with the balance sheet. Accounts that were deactivated but still carry postings are added back
 * (the RPC only returns active accounts) so the totals always balance.
 */
import { supabase } from '../lib/supabase';
import { isOrgFullyPosted } from '../controllers/report.controller';

const r2 = (n: number) => Math.round(n * 100) / 100;
const TOL = 0.005;

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface GlAccount {
    id: string; code: string | null; name: string; type: AccountType; subtype: string | null; active: boolean;
    openingDebit: number; openingCredit: number;   // everything BEFORE the period start
    periodDebit: number; periodCredit: number;     // within [start, end]
    closingDebit: number; closingCredit: number;   // everything ≤ end
}

const CODE_SUSPENSE = 'QB-SUSPENSE';
const CODE_OPENING_EQUITY = 'QB-76';
const CODE_RETAINED = 'QB-73';
const PROTECTED = (code?: string | null) => !!code && (code === 'QB-1150040000' || code === 'CASH-ON-HAND' || code === 'QB-1' || code.startsWith('WAL-') || code.startsWith('QB-MF-'));

export function isCashAccount(a: Pick<GlAccount, 'type' | 'code' | 'name' | 'subtype'>): boolean {
    if (a.type !== 'ASSET') return false;
    if (PROTECTED(a.code)) return true;
    const st = (a.subtype || '').toLowerCase();
    if (['bank', 'cash', 'wallet', 'savings', 'cash and cash equivalents'].includes(st)) return true;
    if (!st && /wallet|cash on hand|petty cash|\bbank\b|mobile money|airtel money|mtn money/i.test(a.name || '')) return true;
    return false;
}

export async function loadGl(orgId: string, start: string, end: string): Promise<{ accounts: GlAccount[]; fullyPosted: boolean }> {
    const [{ data: rows, error }, { data: allAccts, error: aErr }] = await Promise.all([
        supabase.rpc('report_account_balances', { p_org: orgId, p_start: start, p_end: end }),
        supabase.from('accounts').select('id, code, name, type, subtype, is_active').eq('organization_id', orgId),
    ]);
    if (error) throw new Error(`report_account_balances: ${error.message}`);
    if (aErr) throw new Error(`accounts: ${aErr.message}`);

    const meta = new Map<string, any>((allAccts || []).map((a: any) => [a.id, a]));
    const out = new Map<string, GlAccount>();
    for (const r of rows || []) {
        const m = meta.get(r.account_id);
        const cd = Number(r.cumulative_debit || 0), cc = Number(r.cumulative_credit || 0);
        const pd = Number(r.period_debit || 0), pc = Number(r.period_credit || 0);
        out.set(r.account_id, { id: r.account_id, code: r.code ?? null, name: r.account_name, type: r.type, subtype: m?.subtype ?? null, active: true,
            openingDebit: cd - pd, openingCredit: cc - pc, periodDebit: pd, periodCredit: pc, closingDebit: cd, closingCredit: cc });
    }

    // Deactivated accounts that still carry postings (the RPC skips them) — add them so debits still equal credits.
    const inactive = (allAccts || []).filter((a: any) => a.is_active === false && !out.has(a.id));
    if (inactive.length) {
        const ids = inactive.map((a: any) => a.id);
        const acc = new Map<string, GlAccount>(inactive.map((a: any) => [a.id, { id: a.id, code: a.code ?? null, name: `${a.name} (inactive)`, type: a.type, subtype: a.subtype ?? null, active: false,
            openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 }]));
        for (let from = 0; ; from += 1000) {
            const { data, error: lErr } = await supabase.from('journal_lines')
                .select('account_id, debit, credit, journal_entries!inner(organization_id, entry_date)')
                .in('account_id', ids).eq('journal_entries.organization_id', orgId).lte('journal_entries.entry_date', end).range(from, from + 999);
            if (lErr) throw new Error(`inactive accounts: ${lErr.message}`);
            for (const l of data || []) {
                const g = acc.get((l as any).account_id)!;
                const d = Number((l as any).debit || 0), c = Number((l as any).credit || 0);
                const date = String((l as any).journal_entries.entry_date);
                g.closingDebit += d; g.closingCredit += c;
                if (date >= start) { g.periodDebit += d; g.periodCredit += c; } else { g.openingDebit += d; g.openingCredit += c; }
            }
            if (!data || data.length < 1000) break;
        }
        for (const g of acc.values()) if (Math.abs(g.closingDebit) + Math.abs(g.closingCredit) > 0) out.set(g.id, g);
    }

    const fullyPosted = await isOrgFullyPosted(orgId);
    return { accounts: [...out.values()], fullyPosted };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const net = (a: GlAccount, at: 'opening' | 'period' | 'closing') =>
    at === 'opening' ? a.openingDebit - a.openingCredit : at === 'period' ? a.periodDebit - a.periodCredit : a.closingDebit - a.closingCredit; // debit − credit

// ── Trial balance ────────────────────────────────────────────────────────────

export async function trialBalance(orgId: string, start: string, end: string) {
    const { accounts, fullyPosted } = await loadGl(orgId, start, end);
    const order: Record<string, number> = { ASSET: 1, LIABILITY: 2, EQUITY: 3, INCOME: 4, EXPENSE: 5 };
    const rows = accounts
        .map(a => {
            const n = net(a, 'closing');
            return { account_id: a.id, code: a.code, name: a.name, type: a.type, period_debit: r2(a.periodDebit), period_credit: r2(a.periodCredit), debit: n > 0 ? r2(n) : 0, credit: n < 0 ? r2(-n) : 0 };
        })
        .filter(r => r.debit || r.credit || r.period_debit || r.period_credit)
        .sort((a, b) => order[a.type] - order[b.type] || String(a.code || '').localeCompare(String(b.code || '')) || a.name.localeCompare(b.name));
    const totals = { debit: r2(sum(rows.map(r => r.debit))), credit: r2(sum(rows.map(r => r.credit))), period_debit: r2(sum(rows.map(r => r.period_debit))), period_credit: r2(sum(rows.map(r => r.period_credit))) };
    return { start, end, basis: 'GL', ledgerComplete: fullyPosted, rows, totals, balanced: Math.abs(totals.debit - totals.credit) < TOL };
}

// ── Statement of cash flows (indirect) ───────────────────────────────────────

type Section = 'OPERATING' | 'INVESTING' | 'FINANCING';
interface CfLine { account_id?: string; label: string; amount: number }

function classify(a: GlAccount): { section: Section; label: string } {
    const st = (a.subtype || '').toLowerCase(); const nm = a.name || '';
    if (a.type === 'ASSET') {
        if (/accumulated (depreciation|amortisation|amortization)|provision for depreciation/i.test(nm)) return { section: 'OPERATING', label: `Depreciation & amortisation — ${nm}` };
        if (/fixed|property|equipment|intangible|investment|long.?term/.test(st) || st === 'other asset' || /investment|equipment|vehicle|\bland\b|building|furniture|machinery|software|shares|stocks?|treasury|unit trust/i.test(nm))
            return { section: 'INVESTING', label: `${nm}` };
        return { section: 'OPERATING', label: `${nm}` };
    }
    if (a.type === 'LIABILITY') {
        if (/long.?term|loan|borrow|mortgage|debenture/.test(st) || /\bloan|borrowing|mortgage|debenture|overdraft/i.test(nm)) return { section: 'FINANCING', label: `${nm}` };
        return { section: 'OPERATING', label: `${nm}` };
    }
    // EQUITY
    if (a.code === CODE_SUSPENSE) return { section: 'OPERATING', label: 'Uncategorised money movements (Suspense)' };
    if (/savings transfers/i.test(nm)) return { section: 'OPERATING', label: 'Transfers into / out of savings pots' };
    return { section: 'FINANCING', label: `${nm}` };
}

/** Human wording for a cash-flow line: says which way the cash moved (effect > 0 = cash provided). */
function describe(a: GlAccount, c: { section: Section; label: string }, effect: number): string {
    if (/^Depreciation/.test(c.label) || a.code === CODE_SUSPENSE || /savings pots/.test(c.label)) return c.label;
    if (c.section === 'OPERATING') return `${a.type === 'ASSET' ? (effect < 0 ? 'Increase' : 'Decrease') : (effect >= 0 ? 'Increase' : 'Decrease')} in ${c.label}`;
    if (c.section === 'INVESTING') return `${effect < 0 ? 'Purchase of / increase in' : 'Sale of / decrease in'} ${c.label}`;
    if (a.type === 'LIABILITY') return `${effect >= 0 ? 'Proceeds from' : 'Repayment of'} ${c.label}`;
    return `${effect >= 0 ? 'Contributions to' : 'Withdrawals from'} ${c.label}`;
}

export async function cashFlowStatement(orgId: string, start: string, end: string) {
    const { accounts, fullyPosted } = await loadGl(orgId, start, end);
    const cash = accounts.filter(isCashAccount);
    const cashIds = new Set(cash.map(a => a.id));

    const income = sum(accounts.filter(a => a.type === 'INCOME').map(a => a.periodCredit - a.periodDebit));
    const expense = sum(accounts.filter(a => a.type === 'EXPENSE').map(a => a.periodDebit - a.periodCredit));
    const netProfit = r2(income - expense);

    const sections: Record<Section, CfLine[]> = { OPERATING: [], INVESTING: [], FINANCING: [] };
    for (const a of accounts) {
        if (a.type === 'INCOME' || a.type === 'EXPENSE' || cashIds.has(a.id)) continue;
        const effect = r2(a.periodCredit - a.periodDebit); // a debit-balance increase uses cash; a credit-balance increase provides it
        if (Math.abs(effect) < TOL) continue;
        const c = classify(a);
        sections[c.section].push({ account_id: a.id, label: describe(a, c, effect), amount: effect });
    }
    for (const s of Object.values(sections)) s.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const operatingAdjustments = r2(sum(sections.OPERATING.map(l => l.amount)));
    const operating = r2(netProfit + operatingAdjustments);
    const investing = r2(sum(sections.INVESTING.map(l => l.amount)));
    const financing = r2(sum(sections.FINANCING.map(l => l.amount)));
    const netChange = r2(operating + investing + financing);

    const openingCash = r2(sum(cash.map(a => net(a, 'opening'))));
    const closingCash = r2(sum(cash.map(a => net(a, 'closing'))));
    const accountingChange = r2(closingCash - openingCash);

    // Balance-sheet cross-checks (same GL): cash on the BS = closing cash; A − L = equity + cumulative profit.
    const bs = (t: AccountType) => sum(accounts.filter(a => a.type === t).map(a => net(a, 'closing')));
    const equationGap = r2(bs('ASSET') + bs('LIABILITY') + bs('EQUITY') + bs('INCOME') + bs('EXPENSE')); // Σ(debit − credit) of everything = 0

    return {
        start, end, method: 'INDIRECT', basis: 'GL', ledgerComplete: fullyPosted,
        netProfit, operating: { adjustments: sections.OPERATING, adjustmentsTotal: operatingAdjustments, total: operating },
        investing: { lines: sections.INVESTING, total: investing }, financing: { lines: sections.FINANCING, total: financing },
        netChange, openingCash, closingCash,
        cashAccounts: cash.filter(a => Math.abs(net(a, 'opening')) > TOL || Math.abs(net(a, 'closing')) > TOL)
            .map(a => ({ account_id: a.id, code: a.code, name: a.name, opening: r2(net(a, 'opening')), closing: r2(net(a, 'closing')) })),
        checks: { cashChangeTiesToBalanceSheet: Math.abs(netChange - accountingChange) < TOL, difference: r2(netChange - accountingChange), ledgerBalanced: Math.abs(equationGap) < TOL, ledgerGap: equationGap },
    };
}

// ── Statement of changes in equity ───────────────────────────────────────────

export async function changesInEquity(orgId: string, start: string, end: string) {
    const { accounts, fullyPosted } = await loadGl(orgId, start, end);
    const eq = accounts.filter(a => a.type === 'EQUITY');
    const profit = (at: 'opening' | 'period' | 'closing') =>
        -sum(accounts.filter(a => a.type === 'INCOME' || a.type === 'EXPENSE').map(a => net(a, at))); // credit − debit of all P&L accounts

    // Equity accounts hold credit balances. "Retained earnings" in this system is accumulated income − expense rolled up (it is a
    // calculated row on the balance sheet), plus whatever was posted directly to a Retained Earnings account.
    const rows = eq.map(a => {
        const opening = -net(a, 'opening'), movement = -net(a, 'period'), closing = -net(a, 'closing');
        const retained = a.code === CODE_RETAINED || /retained earnings/i.test(a.name);
        return { account_id: a.id, code: a.code, name: a.name, kind: a.code === CODE_SUSPENSE ? 'SUSPENSE' : retained ? 'RETAINED' : a.code === CODE_OPENING_EQUITY ? 'OPENING' : 'CAPITAL',
            opening: r2(opening), profit: 0, other_movements: r2(movement), closing: r2(closing) };
    }).filter(r => Math.abs(r.opening) > TOL || Math.abs(r.closing) > TOL || Math.abs(r.other_movements) > TOL);

    const openingProfit = r2(profit('opening')), periodProfit = r2(profit('period'));
    const accumulated = { account_id: null as string | null, code: null as string | null, name: 'Accumulated profit (retained earnings)', kind: 'ACCUMULATED',
        opening: openingProfit, profit: periodProfit, other_movements: 0, closing: r2(openingProfit + periodProfit) };
    const all = [...rows.sort((a, b) => a.name.localeCompare(b.name)), accumulated];

    const totals = {
        opening: r2(sum(all.map(r => r.opening))), profit: r2(sum(all.map(r => r.profit))),
        other_movements: r2(sum(all.map(r => r.other_movements))), closing: r2(sum(all.map(r => r.closing))),
    };
    // Balance-sheet equity = assets − liabilities, from the same GL.
    const assets = sum(accounts.filter(a => a.type === 'ASSET').map(a => net(a, 'closing')));
    const liabilities = -sum(accounts.filter(a => a.type === 'LIABILITY').map(a => net(a, 'closing')));
    const balanceSheetEquity = r2(assets - liabilities);
    return {
        start, end, basis: 'GL', ledgerComplete: fullyPosted, rows: all, totals, balanceSheetEquity,
        checks: { closingTiesToBalanceSheet: Math.abs(totals.closing - balanceSheetEquity) < TOL, difference: r2(totals.closing - balanceSheetEquity),
            rollForwardOk: Math.abs(totals.opening + totals.profit + totals.other_movements - totals.closing) < TOL },
    };
}

// ── General ledger (account transactions) ────────────────────────────────────

export async function generalLedger(orgId: string, accountId: string, start: string, end: string, limit = 5000) {
    const { data: acct } = await supabase.from('accounts').select('id, code, name, type, subtype, organization_id').eq('id', accountId).maybeSingle();
    if (!acct || (acct as any).organization_id !== orgId) throw Object.assign(new Error('Account not found.'), { status: 404 });
    const a: any = acct;
    const debitNormal = a.type === 'ASSET' || a.type === 'EXPENSE';
    const sign = (d: number, c: number) => (debitNormal ? d - c : c - d);

    // Opening = everything dated before `start`, from the same SQL roll-up the other statements use (inactive accounts: sum the lines).
    let opening = 0;
    const { data: bal, error: balErr } = await supabase.rpc('report_account_balances', { p_org: orgId, p_start: start, p_end: end });
    if (balErr) throw new Error(balErr.message);
    const row = (bal || []).find((r: any) => r.account_id === accountId);
    if (row) {
        opening = sign(Number(row.cumulative_debit || 0) - Number(row.period_debit || 0), Number(row.cumulative_credit || 0) - Number(row.period_credit || 0));
    } else {
        for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('journal_lines').select('debit, credit, journal_entries!inner(organization_id, entry_date)')
                .eq('account_id', accountId).eq('journal_entries.organization_id', orgId).lt('journal_entries.entry_date', start).range(from, from + 999);
            if (error) throw new Error(error.message);
            for (const l of data || []) opening += sign(Number((l as any).debit || 0), Number((l as any).credit || 0));
            if (!data || data.length < 1000) break;
        }
    }

    const lines: any[] = [];
    let truncated = false;
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('journal_lines')
            .select('id, debit, credit, description, journal_entries!inner(id, organization_id, entry_date, description, reference_number, source_type, created_at)')
            .eq('account_id', accountId).eq('journal_entries.organization_id', orgId)
            .gte('journal_entries.entry_date', start).lte('journal_entries.entry_date', end).range(from, from + 999);
        if (error) throw new Error(error.message);
        lines.push(...(data || []));
        if (!data || data.length < 1000) break;
        if (lines.length >= limit) { truncated = true; break; }
    }
    lines.sort((x, y) => String(x.journal_entries.entry_date).localeCompare(String(y.journal_entries.entry_date)) || String(x.journal_entries.created_at).localeCompare(String(y.journal_entries.created_at)));

    let running = opening, totalDebit = 0, totalCredit = 0;
    const rows = lines.map(l => {
        const d = Number(l.debit || 0), c = Number(l.credit || 0);
        running += sign(d, c); totalDebit += d; totalCredit += c;
        const je = l.journal_entries;
        return { id: l.id, journal_id: je.id, date: je.entry_date, reference: je.reference_number, source_type: je.source_type, description: l.description || je.description || '', debit: d, credit: c, balance: r2(running) };
    });
    return {
        account: { id: a.id, code: a.code, name: a.name, type: a.type }, start, end, normalBalance: debitNormal ? 'DEBIT' : 'CREDIT',
        opening: r2(opening), totalDebit: r2(totalDebit), totalCredit: r2(totalCredit), closing: r2(running), rows, truncated,
    };
}
