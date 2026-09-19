/**
 * Zambian statutory payroll calculations -- NAPSA, NHIMA, PAYE -- and the
 * per-configured-type gross/net composition used by the payroll run wizard.
 *
 * Ported from apps/web/src/pages/RunPayrollPage.tsx, the route-mounted
 * implementation at /apps/payroll/run. A near-identical but SIMPLER copy also
 * lives in components/payroll/RunPayrollWizard.tsx -- that component is dead
 * code (nothing imports it) and must not be used as the reference: it lacks
 * per-configured-type statutory exemption, so an allowance an org has marked
 * "not subject to statutory" would be taxed anyway under that version.
 *
 * This is the one place in the whole port where a divergence between clients
 * is not a UI defect but a wrong salary: if the phone computes a different net
 * pay than the web app for the same inputs, someone gets paid the wrong
 * amount. Both clients must call this, never their own copy.
 */

import type { AllowanceConfig } from '../services/payroll.service';

export const NAPSA_RATE = 0.05;
export const NAPSA_CEILING = 1073.15;
export const NHIMA_RATE = 0.01;

/**
 * PAYE bands (2026, Zambia). Bracket boundaries and rates are exact matches
 * to the web implementation -- do not "simplify" this into a loop over a
 * bracket table without re-verifying every boundary against the source.
 */
export function calcPAYE(gross: number): number {
    if (gross <= 4800) return 0;
    if (gross <= 9600) return (gross - 4800) * 0.20;
    if (gross <= 16000) return (9600 - 4800) * 0.20 + (gross - 9600) * 0.30;
    return (9600 - 4800) * 0.20 + (16000 - 9600) * 0.30 + (gross - 16000) * 0.375;
}

/** NAPSA (5%, capped at the ceiling) + NHIMA (1%, uncapped) + PAYE, on a given statutory base. */
export function calcStatutory(statutoryGross: number): number {
    return Math.min(statutoryGross, NAPSA_CEILING) * NAPSA_RATE + statutoryGross * NHIMA_RATE + calcPAYE(statutoryGross);
}

export function sumValues(rec?: Record<string, number>): number {
    return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

/**
 * One line of a payroll run. `custom_allowances` / `custom_deductions` are the
 * per-configured-type breakdown (keyed by the configured type's name, e.g.
 * "Transport", "Housing"); `taxable_allowances` / `non_taxable_allowances` /
 * `other_deductions` are the generic pools used only when the org has no
 * configured types of that kind (or for amounts on a staff record that don't
 * match a configured type -- see `foldOrphanAllowances` below).
 */
export interface PayrollRunLineInput {
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    other_deductions: number;
    custom_allowances?: Record<string, number>;
    custom_deductions?: Record<string, number>;
}

/** Gross pay before any deduction: basic + overtime + every allowance bucket. */
export function calcGross(item: PayrollRunLineInput): number {
    return item.basic_pay + item.overtime + item.taxable_allowances + item.non_taxable_allowances
        + sumValues(item.custom_allowances);
}

/**
 * The portion of gross that NAPSA / NHIMA / PAYE are actually assessed on.
 * Basic pay, overtime and the generic taxable pool always count; a
 * configured allowance counts unless the org has explicitly marked it
 * `subject_to_statutory: false` (the non-taxable generic pool never counts).
 */
export function calcStatutoryGross(item: PayrollRunLineInput, allowanceTypes: AllowanceConfig[]): number {
    return item.basic_pay + item.overtime + item.taxable_allowances +
        Object.entries(item.custom_allowances ?? {}).reduce((sum, [name, val]) => {
            const isTaxable = allowanceTypes.find((a) => a.name === name)?.subject_to_statutory !== false;
            return isTaxable ? sum + val : sum;
        }, 0);
}

/** Take-home pay: gross minus statutory (on the statutory base) minus loans minus every deduction bucket. */
export function calcNet(item: PayrollRunLineInput, allowanceTypes: AllowanceConfig[]): number {
    return calcGross(item)
        - calcStatutory(calcStatutoryGross(item, allowanceTypes))
        - item.loans
        - item.other_deductions
        - sumValues(item.custom_deductions);
}
