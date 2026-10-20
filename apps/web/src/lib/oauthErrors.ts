export interface FlowError {
    code: string;
    message: string;
}

/**
 * apiFetch THROWS on any non-OK response (an ApiError carrying the JSON body in `.data`), so the OAuth
 * consent screen has to read the reason from the error, not from a Response. Only a request that never got
 * an answer is a genuine network failure.
 */
export const toFlowError = (err: any): FlowError => {
    const data = err?.data;
    if (data && typeof data === 'object' && (data.error_description || data.error)) {
        return { code: String(data.error ?? 'error'), message: String(data.error_description ?? data.error) };
    }
    if (typeof err?.status === 'number') {
        return { code: 'error', message: err.message || `The request failed (${err.status}).` };
    }
    if (err?.message === 'Unauthorized') {
        return { code: 'unauthorized', message: 'Your MoneyWise session expired. Please sign in again and retry.' };
    }
    return { code: 'network', message: 'Could not reach MoneyWise. Check your connection and try again.' };
};
