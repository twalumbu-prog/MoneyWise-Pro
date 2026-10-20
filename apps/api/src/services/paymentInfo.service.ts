/**
 * paymentInfo.service.ts — the bank and mobile-money accounts a person keeps on their profile.
 *
 * A person can hold several of each (`bank_accounts`, `mobile_money_accounts`), one marked primary. The original flat
 * fields (bank_name, bank_account_number, … mobile_money_*) are kept in step with the PRIMARY account of each kind, so
 * everything written before multiple accounts existed — the web app, requisitions paid "to my account", payroll — keeps
 * working untouched.
 */
import crypto from 'crypto';

export interface BankAccount { id: string; label?: string; bank_name: string; account_number: string; account_name: string; is_default: boolean }
export interface MobileMoneyAccount { id: string; label?: string; provider: string; number: string; name: string; is_default: boolean }
export interface PaymentInfoShape {
    bank_name?: string; bank_account_number?: string; bank_account_name?: string;
    mobile_money_provider?: string; mobile_money_number?: string; mobile_money_name?: string;
    bank_accounts?: BankAccount[]; mobile_money_accounts?: MobileMoneyAccount[];
}

const MAX_ACCOUNTS = 10;
const t = (v: any, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const newId = () => crypto.randomUUID();

function cleanBanks(list: any): BankAccount[] {
    if (!Array.isArray(list)) return [];
    const out: BankAccount[] = [];
    for (const a of list.slice(0, MAX_ACCOUNTS)) {
        const number = t(a?.account_number, 40);
        if (!number) continue;
        out.push({ id: t(a?.id, 64) || newId(), label: t(a?.label, 60) || undefined, bank_name: t(a?.bank_name), account_number: number, account_name: t(a?.account_name), is_default: !!a?.is_default });
    }
    return out;
}

function cleanMomos(list: any): MobileMoneyAccount[] {
    if (!Array.isArray(list)) return [];
    const out: MobileMoneyAccount[] = [];
    for (const a of list.slice(0, MAX_ACCOUNTS)) {
        const number = t(a?.number, 20);
        if (!number) continue;
        out.push({ id: t(a?.id, 64) || newId(), label: t(a?.label, 60) || undefined, provider: t(a?.provider), number, name: t(a?.name), is_default: !!a?.is_default });
    }
    return out;
}

/** Exactly one primary per kind: the first one flagged, else the first in the list. */
function ensureOnePrimary<T extends { is_default: boolean }>(list: T[]): T[] {
    if (list.length === 0) return list;
    const idx = Math.max(0, list.findIndex((a) => a.is_default));
    return list.map((a, i) => ({ ...a, is_default: i === idx }));
}

/** The arrays for a stored payment_info, derived from the flat fields when the person predates multiple accounts. */
export function accountsOf(stored: any): { banks: BankAccount[]; momos: MobileMoneyAccount[] } {
    const s = stored && typeof stored === 'object' ? stored : {};
    let banks = cleanBanks(s.bank_accounts);
    let momos = cleanMomos(s.mobile_money_accounts);
    if (!Array.isArray(s.bank_accounts) && t(s.bank_account_number)) {
        banks = [{ id: 'primary-bank', bank_name: t(s.bank_name), account_number: t(s.bank_account_number, 40), account_name: t(s.bank_account_name), is_default: true }];
    }
    if (!Array.isArray(s.mobile_money_accounts) && t(s.mobile_money_number)) {
        momos = [{ id: 'primary-momo', provider: t(s.mobile_money_provider), number: t(s.mobile_money_number, 20), name: t(s.mobile_money_name), is_default: true }];
    }
    return { banks: ensureOnePrimary(banks), momos: ensureOnePrimary(momos) };
}

function compose(banks: BankAccount[], momos: MobileMoneyAccount[], extra: any): PaymentInfoShape {
    const b = ensureOnePrimary(banks), m = ensureOnePrimary(momos);
    const pb = b.find((a) => a.is_default), pm = m.find((a) => a.is_default);
    return {
        ...(extra && typeof extra === 'object' ? extra : {}),
        bank_accounts: b,
        mobile_money_accounts: m,
        bank_name: pb?.bank_name ?? '', bank_account_number: pb?.account_number ?? '', bank_account_name: pb?.account_name ?? '',
        mobile_money_provider: pm?.provider ?? '', mobile_money_number: pm?.number ?? '', mobile_money_name: pm?.name ?? '',
    };
}

/** What to return to a client: arrays always present (derived for older records). */
export function presentPaymentInfo(stored: any): PaymentInfoShape | null {
    if (!stored || typeof stored !== 'object') return null;
    const { banks, momos } = accountsOf(stored);
    return compose(banks, momos, {});
}

/**
 * What to store when a client saves. A client that sends the arrays (the mobile app) is authoritative. A client that
 * sends only the flat fields (the web app) edits the PRIMARY account of each kind and leaves the others alone.
 */
export function mergePaymentInfo(existing: any, incoming: any): PaymentInfoShape {
    const inc = incoming && typeof incoming === 'object' ? incoming : {};
    if (Array.isArray(inc.bank_accounts) || Array.isArray(inc.mobile_money_accounts)) {
        const cur = accountsOf(existing);
        return compose(
            Array.isArray(inc.bank_accounts) ? cleanBanks(inc.bank_accounts) : cur.banks,
            Array.isArray(inc.mobile_money_accounts) ? cleanMomos(inc.mobile_money_accounts) : cur.momos,
            {},
        );
    }

    const cur = accountsOf(existing);
    let banks = [...cur.banks], momos = [...cur.momos];

    const touchesBank = ['bank_name', 'bank_account_number', 'bank_account_name'].some((k) => k in inc);
    if (touchesBank) {
        const number = t(inc.bank_account_number, 40);
        const i = banks.findIndex((a) => a.is_default);
        if (!number) { if (i >= 0) banks.splice(i, 1); }
        else {
            const next: BankAccount = { id: i >= 0 ? banks[i].id : newId(), label: i >= 0 ? banks[i].label : undefined, bank_name: t(inc.bank_name), account_number: number, account_name: t(inc.bank_account_name), is_default: true };
            if (i >= 0) banks[i] = next; else banks = [next, ...banks.map((a) => ({ ...a, is_default: false }))];
        }
    }
    const touchesMomo = ['mobile_money_provider', 'mobile_money_number', 'mobile_money_name'].some((k) => k in inc);
    if (touchesMomo) {
        const number = t(inc.mobile_money_number, 20);
        const i = momos.findIndex((a) => a.is_default);
        if (!number) { if (i >= 0) momos.splice(i, 1); }
        else {
            const next: MobileMoneyAccount = { id: i >= 0 ? momos[i].id : newId(), label: i >= 0 ? momos[i].label : undefined, provider: t(inc.mobile_money_provider), number, name: t(inc.mobile_money_name), is_default: true };
            if (i >= 0) momos[i] = next; else momos = [next, ...momos.map((a) => ({ ...a, is_default: false }))];
        }
    }
    return compose(banks, momos, {});
}
