/**
 * The error every core service throws on a non-2xx response.
 *
 * Extends Error, so the ~40 call sites reading `err.message` are unaffected.
 * It also exposes `status` and `data`, and mirrors them onto a `response`
 * property shaped like an AxiosError — four services (department, organization,
 * payroll, product) used axios, and their callers read
 * `err.response?.data?.error` to surface the backend's own wording. Preserving
 * that shape lets those services move to apiFetch without touching any UI, and
 * without silently downgrading real error messages to generic fallbacks.
 *
 * New code should read `.status` / `.data`; `.response` exists for the legacy
 * call sites and can be dropped once they are migrated.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly data: any;
    readonly endpoint: string;

    constructor(message: string, status: number, data: any, endpoint: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
        this.endpoint = endpoint;
        // Restores the prototype chain when compiled down to ES5 targets, so
        // `err instanceof ApiError` keeps working in the native bundle.
        Object.setPrototypeOf(this, ApiError.prototype);
    }

    /** AxiosError-compatible view. See the note above. */
    get response(): { status: number; data: any } {
        return { status: this.status, data: this.data };
    }
}

export function isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
}
