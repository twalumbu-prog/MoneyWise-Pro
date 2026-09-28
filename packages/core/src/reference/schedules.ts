/**
 * Category and cadence labels for scheduled items -- pulled out of
 * apps/web/src/pages/Schedules.tsx so a category picker on the phone can't
 * show wording, order or a set of options different from web's.
 */
import type { ScheduleCategory, ScheduleCadence } from '../services/schedule.service';

export const SCHEDULE_CATEGORIES: { value: ScheduleCategory; label: string }[] = [
    { value: 'BILLS',            label: 'Bills' },
    { value: 'SUBSCRIPTIONS',    label: 'Subscriptions' },
    { value: 'INVESTMENTS',      label: 'Investments' },
    { value: 'LOAN_REPAYMENTS',  label: 'Loan Repayments' },
    { value: 'GENERAL_EXPENSES', label: 'General Expenses' },
];

export const SCHEDULE_CADENCES: { value: ScheduleCadence; label: string }[] = [
    { value: 'DAILY',     label: 'Daily' },
    { value: 'WEEKLY',    label: 'Weekly' },
    { value: 'BIWEEKLY',  label: 'Bi-weekly' },
    { value: 'MONTHLY',   label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
];

export function scheduleCategoryLabel(value: string): string {
    return SCHEDULE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function scheduleCadenceLabel(value: string): string {
    return SCHEDULE_CADENCES.find((c) => c.value === value)?.label ?? value;
}
