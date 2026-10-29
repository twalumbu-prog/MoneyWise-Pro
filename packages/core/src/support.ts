/**
 * MoneyWise support contact and the guidance shown when a payout is rejected by the
 * mobile-money network rather than by anything the user did.
 *
 * Lenco reports operator-side rejections as the bare "Transfer Not Successful" (e.g. the
 * 29 Oct 2026 Airtel outage). Nothing leaves the wallet and the requisition is reset to
 * AUTHORISED, so the user only needs to know their money is safe and when to retry.
 */

export const SUPPORT_PHONE = '+260772530093';
export const SUPPORT_PHONE_DISPLAY = '+260 77 253 0093';
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}`;
export const SUPPORT_TEL_URL = `tel:${SUPPORT_PHONE}`;

/** How long to tell users to wait before retrying a network-rejected transfer. */
export const NETWORK_RETRY_MINUTES = 15;

/** True when Lenco's failure means the operator/bank declined it, not a problem with the user's details or funds. */
export const isNetworkTransferFailure = (raw: string | null | undefined): boolean =>
    /transfer not successful/i.test(raw || '');

/** Clock time (e.g. "10:12") at which a retry is suggested, counted from when the failure happened. */
export const retryAfterLabel = (failedAt: number, minutes = NETWORK_RETRY_MINUTES): string =>
    new Date(failedAt + minutes * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
