/**
 * Zambian mobile-money network detection by phone prefix.
 *
 * Ported from apps/web/src/components/payroll/AddStaffWizard.tsx. Small, but
 * shared for the same reason as the provider lists in P2: which network a
 * number resolves to determines which Lenco verification call fires, and a
 * client-specific guess here would just be wrong sometimes.
 */
export function detectMobileNetwork(phone: string): '' | 'AIRTEL' | 'MTN' | 'ZAMTEL' {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('097') || digits.startsWith('077')) return 'AIRTEL';
    if (digits.startsWith('096') || digits.startsWith('076')) return 'MTN';
    if (digits.startsWith('095') || digits.startsWith('075')) return 'ZAMTEL';
    return '';
}
