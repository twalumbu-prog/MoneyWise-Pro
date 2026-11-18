import { apiJson } from 'core';

/**
 * "Quick connect" = the Composio route (the alternative to each integration's direct connection). The browser goes to
 * Composio's hosted sign-in, comes back to /settings?tab=integrations&composio=<toolkit>, and the card then calls
 * completeQuickConnect() so the API registers what Composio now holds for this organisation.
 */
export type QuickToolkit = 'gmail' | 'facebook' | 'instagram';

export type QuickConnectResult =
    | { ok: true; labels: string[]; remaining?: { id: string; name: string }[]; composioAccountId?: string }
    | { ok: false; message: string; choices?: { id: string; name: string }[]; composioAccountId?: string };

export async function startQuickConnect(toolkit: QuickToolkit): Promise<void> {
    const r = await apiJson<{ redirectUrl: string }>(`/integrations/composio/${toolkit}/connect`, { method: 'POST' });
    window.location.href = r.redirectUrl;
}

export const completeQuickConnect = (toolkit: QuickToolkit, body: { externalId?: string; composioAccountId?: string } = {}) =>
    apiJson<QuickConnectResult>(`/integrations/composio/${toolkit}/complete`, { method: 'POST', body: JSON.stringify(body) });

/** The toolkit named in ?composio=… when the browser has just come back from Composio, and removes it from the URL. */
export function takeQuickConnectReturn(): QuickToolkit | null {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('composio');
    if (!t) return null;
    params.delete('composio');
    // Composio may append its own result params to the callback URL.
    ['status', 'connected_account_id', 'connectedAccountId', 'error'].forEach(k => params.delete(k));
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    return t === 'gmail' || t === 'facebook' || t === 'instagram' ? t : null;
}
