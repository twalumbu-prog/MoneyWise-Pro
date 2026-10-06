/**
 * Zambian mobile-money number inputs that sit next to a fixed "+260" prefix. The user types only
 * the 9-digit national part (97 123 4567); anything pasted with a leading 0 or 260 is trimmed.
 * State keeps the local "0XXXXXXXXX" form that operator detection and the Lenco calls expect.
 */
export function phoneFromPrefixedInput(text: string): string {
    let digits = text.replace(/[^0-9]/g, '');
    if (digits.startsWith('260')) digits = digits.slice(3);
    digits = digits.replace(/^0+/, '').slice(0, 9);
    return digits ? `0${digits}` : '';
}

/** What to show in the input after "+260": the local number without its leading 0. */
export function prefixedInputValue(phone: string): string {
    return phone.replace(/^0/, '');
}
