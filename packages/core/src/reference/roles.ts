/**
 * Role predicates, mirroring what apps/api actually enforces.
 *
 * These exist because the UI gate and the server gate drifting apart fails in
 * both directions and both are bad: a button shown to someone who will get a
 * 403, or an action hidden from someone entitled to take it. Every predicate
 * here names the controller it mirrors so the pair can be checked.
 */

export type UserRole =
    | 'REQUESTOR'
    | 'AUTHORISER'
    | 'ACCOUNTANT'
    | 'CASHIER'
    | 'MANAGER'
    | 'ADMIN';

/**
 * Approve or reject a requisition.
 *
 * Mirrors updateRequisitionStatus in requisition.controller.ts, which allows
 * ACCOUNTANT, ADMIN and MANAGER only. Note that AUTHORISER — despite the name —
 * is NOT accepted by that endpoint.
 */
export function canAuthoriseRequisition(role: string | null | undefined): boolean {
    return role === 'ACCOUNTANT' || role === 'ADMIN' || role === 'MANAGER';
}

/**
 * Pay out an authorised requisition.
 * Mirrors the disburse handlers, which require ACCOUNTANT, CASHIER or ADMIN.
 */
export function canDisburse(role: string | null | undefined): boolean {
    return role === 'ACCOUNTANT' || role === 'CASHIER' || role === 'ADMIN';
}

/** Post and review journal vouchers. */
export function canManageVouchers(role: string | null | undefined): boolean {
    return role === 'ACCOUNTANT' || role === 'ADMIN';
}

/**
 * Sees the whole organisation's requisitions rather than only their own.
 * Mirrors the `isPrivileged` check in requisition.controller.ts.
 */
export function isPrivilegedRole(role: string | null | undefined): boolean {
    return role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'MANAGER' || role === 'CASHIER';
}

/** Requestors get a reduced app: no wallet, no BI. Mirrors the web bottom nav. */
export function isRequestorRole(role: string | null | undefined): boolean {
    return role === 'REQUESTOR';
}
