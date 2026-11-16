/**
 * Payroll statutory calculations (NAPSA, NHIMA, PAYE) — pure functions, no I/O.
 *
 * Why this exists: the payroll controller used a single "statutory gross" for all three deductions and old PAYE bands.
 * Twalumbu's actual payroll sheets (Jan–Oct 2026) apply a different base to each:
 *   • NAPSA  = 5% of basic + the allowances flagged for NAPSA (welfare)             — professional/responsibility/overtime/bonus excluded
 *   • NHIMA  = 1% of basic + the allowances flagged for NHIMA (welfare, professional, responsibility) — overtime/bonus excluded
 *   • PAYE   = bands on the FULL gross (every allowance, overtime and bonus)
 * so each allowance type now carries its own napsa / nhima / paye flag, and every figure can still be overridden per
 * employee (a few staff have a manually fixed NHIMA, or are exempt from NAPSA/NHIMA).
 *
 * PAYE bands (monthly): 0% to K5,100; 20% to K7,100; 30% to K9,200; 37% above (the bands the payroll sheets use and the
 * majority of published 2026 guides confirm — verify against the ZRA schedule when it changes; they are a rule, not a constant).
 */

export interface PayeBand { upTo: number | null; rate: number }

export interface StatutoryRules {
    napsa_rate: number;            // employee share; the employer pays the same
    nhima_rate: number;            // employee share; the employer pays the same
    napsa_monthly_cap: number | null; // ceiling on the EMPLOYEE contribution (not on the earnings base); null = no cap
    paye_bands: PayeBand[];
    overtime_in: { napsa: boolean; nhima: boolean; paye: boolean };
}

export const DEFAULT_RULES: StatutoryRules = {
    napsa_rate: 0.05,
    nhima_rate: 0.01,
    napsa_monthly_cap: null,
    paye_bands: [{ upTo: 5100, rate: 0 }, { upTo: 7100, rate: 0.20 }, { upTo: 9200, rate: 0.30 }, { upTo: null, rate: 0.37 }],
    overtime_in: { napsa: false, nhima: false, paye: true },
};

export interface AllowanceType {
    id?: string;
    name: string;
    separate_step?: boolean;
    subject_to_statutory?: boolean; // legacy single flag — used as the default for all three when the new flags are absent
    napsa?: boolean;
    nhima?: boolean;
    paye?: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function mergeRules(stored?: Partial<StatutoryRules> | null): StatutoryRules {
    const s = stored || {};
    return {
        napsa_rate: Number.isFinite(Number(s.napsa_rate)) && s.napsa_rate != null ? Number(s.napsa_rate) : DEFAULT_RULES.napsa_rate,
        nhima_rate: Number.isFinite(Number(s.nhima_rate)) && s.nhima_rate != null ? Number(s.nhima_rate) : DEFAULT_RULES.nhima_rate,
        napsa_monthly_cap: s.napsa_monthly_cap == null ? null : Number(s.napsa_monthly_cap),
        paye_bands: Array.isArray(s.paye_bands) && s.paye_bands.length ? s.paye_bands : DEFAULT_RULES.paye_bands,
        overtime_in: { ...DEFAULT_RULES.overtime_in, ...(s.overtime_in || {}) },
    };
}

/** Monthly PAYE on a taxable amount using progressive bands. */
export function calcPAYE(taxable: number, bands: PayeBand[] = DEFAULT_RULES.paye_bands): number {
    if (!(taxable > 0)) return 0;
    let tax = 0, lower = 0;
    for (const b of bands) {
        const upper = b.upTo == null ? Infinity : b.upTo;
        if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * b.rate;
        if (taxable <= upper) break;
        lower = upper;
    }
    return r2(tax);
}

/** Which statutory bases an allowance belongs to. New per-statutory flags win; otherwise the legacy flag applies to all three. */
export function flagsFor(type: AllowanceType | undefined): { napsa: boolean; nhima: boolean; paye: boolean } {
    if (!type) return { napsa: true, nhima: true, paye: true };           // an unknown/ad-hoc allowance is treated as fully statutory (prudent)
    const legacy = type.subject_to_statutory !== false;
    return { napsa: type.napsa ?? legacy, nhima: type.nhima ?? legacy, paye: type.paye ?? legacy };
}

/** Splits an allowance breakdown ({name: amount}) into the amount that is subject to each statutory deduction. */
export function allowanceBases(breakdown: Record<string, number> | null | undefined, types: AllowanceType[]): { napsa: number; nhima: number; paye: number; total: number } {
    let napsa = 0, nhima = 0, paye = 0, total = 0;
    for (const [name, raw] of Object.entries(breakdown || {})) {
        const amt = Number(raw) || 0; if (!amt) continue;
        const f = flagsFor(types.find(t => t.name === name || t.id === name));
        total += amt; if (f.napsa) napsa += amt; if (f.nhima) nhima += amt; if (f.paye) paye += amt;
    }
    return { napsa: r2(napsa), nhima: r2(nhima), paye: r2(paye), total: r2(total) };
}

export interface StatutoryInput {
    basic: number;
    overtime?: number;
    allowanceBases: { napsa: number; nhima: number; paye: number; total: number };
    napsaExempt?: boolean;
    nhimaExempt?: boolean;
    /** Explicit figures (from the signed-off payroll sheet): any field present replaces the computed value. */
    override?: Partial<{ napsa_employee: number; napsa_employer: number; nhima_employee: number; nhima_employer: number; paye: number }>;
}

export interface StatutoryResult {
    gross: number; napsa_base: number; nhima_base: number; paye_base: number;
    napsa_employee: number; napsa_employer: number; nhima_employee: number; nhima_employer: number; paye: number; statutory_total: number; overridden: boolean;
}

export function computeStatutory(input: StatutoryInput, rules: StatutoryRules = DEFAULT_RULES): StatutoryResult {
    const basic = Number(input.basic) || 0, ot = Number(input.overtime) || 0, a = input.allowanceBases;
    const gross = r2(basic + ot + a.total);
    const napsaBase = basic + a.napsa + (rules.overtime_in.napsa ? ot : 0);
    const nhimaBase = basic + a.nhima + (rules.overtime_in.nhima ? ot : 0);
    const payeBase = basic + a.paye + (rules.overtime_in.paye ? ot : 0);

    let napsaEe = input.napsaExempt ? 0 : r2(napsaBase * rules.napsa_rate);
    if (!input.napsaExempt && rules.napsa_monthly_cap != null) napsaEe = Math.min(napsaEe, rules.napsa_monthly_cap);
    const nhimaEe = input.nhimaExempt ? 0 : r2(nhimaBase * rules.nhima_rate);
    const paye = calcPAYE(payeBase, rules.paye_bands);

    const o = input.override || {};
    const pick = (v: number | undefined, d: number) => (v == null || !Number.isFinite(Number(v)) ? d : r2(Number(v)));
    const res = {
        napsa_employee: pick(o.napsa_employee, napsaEe),
        napsa_employer: pick(o.napsa_employer, o.napsa_employee != null ? pick(o.napsa_employee, napsaEe) : napsaEe),
        nhima_employee: pick(o.nhima_employee, nhimaEe),
        nhima_employer: pick(o.nhima_employer, o.nhima_employee != null ? pick(o.nhima_employee, nhimaEe) : nhimaEe),
        paye: pick(o.paye, paye),
    };
    return {
        gross, napsa_base: r2(napsaBase), nhima_base: r2(nhimaBase), paye_base: r2(payeBase), ...res,
        statutory_total: r2(res.napsa_employee + res.nhima_employee + res.paye),
        overridden: Object.values(o).some(v => v != null),
    };
}
