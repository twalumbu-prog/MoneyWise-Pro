/**
 * Zambian mobile-money phone helpers. Mirrors the operator prefixes used by
 * LencoService.resolveMobileOperator (Airtel 097/077, MTN 096/076, Zamtel 095/075).
 */

/** Normalise to local 10-digit form (0971234567). Accepts +260…, 260…, 0…, or bare 9 digits. */
export const normalizeZambiaPhone = (raw: string | null | undefined): string => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.startsWith('260') && digits.length === 12) return '0' + digits.slice(3);
    if (digits.length === 9 && !digits.startsWith('0')) return '0' + digits;
    return digits;
};

export const isValidZambiaMobile = (raw: string | null | undefined): boolean =>
    /^0(97|77|96|76|95|75)\d{7}$/.test(normalizeZambiaPhone(raw));

export const INVALID_PHONE_MESSAGE =
    "Enter the customer's full 10-digit mobile money number (Airtel 097/077, MTN 096/076 or Zamtel 095/075), e.g. 0971234567.";
