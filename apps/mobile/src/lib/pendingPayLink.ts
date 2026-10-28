/** A pay link opened while signed out: remembered until sign-in finishes, then opened (see the tabs layout). */
let pending: string | null = null;
export const setPendingPayLink = (path: string) => { pending = path; };
export const takePendingPayLink = (): string | null => { const p = pending; pending = null; return p; };
