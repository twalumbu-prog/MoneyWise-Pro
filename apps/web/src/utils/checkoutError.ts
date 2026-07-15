// Shared, payer-facing diagnosis for the public checkout pages (PublicPay and
// PublicPaymentLink). Turns whatever failed while loading the checkout into a
// plain-language, actionable message so a payer is never stuck on a vague error.
//
// The key split is "couldn't reach the server" (a network / browser / device
// issue on the payer's side — the link itself is fine) versus a real server
// response (link not found, server error, etc.), each with concrete next steps.
//
// Each outcome also gets a stable `code` (e.g. "PL-BACKGROUNDED-CAT"), rendered
// small on the error screen. A generic "Connection timed out" page collapses many
// distinct root causes (offline, in-app browser, backgrounded tab, genuine slow
// network) into one indistinguishable message — a payer reporting "it says
// connection timed out" tells us nothing we can act on. The code turns their
// screenshot into an exact class, and doubles as the join key against the
// server-side Vercel log drain: if the code says the request never left the
// device (offline/webview/backgrounded) there will be no matching server log for
// that timestamp, which itself confirms the diagnosis instead of requiring
// after-the-fact log spelunking.

export type CheckoutEntryPoint = 'catalog' | 'payment_link';

export interface CheckoutErrorContext {
    entryPoint: CheckoutEntryPoint;
    /** Did document.visibilityState go 'hidden' at any point while this request was in flight? */
    wasBackgrounded: boolean;
    /** navigator.onLine at the moment the error was caught. */
    isOnline: boolean;
    /** navigator.connection snapshot, if the browser exposes it. */
    connection?: { effectiveType?: string; downlink?: number; rtt?: number } | null;
    /** Raw navigator.userAgent, used to detect in-app browsers (WhatsApp/Instagram/Facebook). */
    userAgent: string;
}

export interface CheckoutErrorInfo {
    /** Stable per-class identifier, suffixed by entry point, e.g. "PL-TIMEOUT-CAT". Shown on-screen and logged. */
    code: string;
    title: string;
    message: string;
    tips?: string[];
    /** Whether a "Try Again" action could plausibly help. */
    retry: boolean;
}

const ENTRY_SUFFIX: Record<CheckoutEntryPoint, string> = {
    catalog: 'CAT',
    payment_link: 'OTL',
};

// WhatsApp's own in-app browser rarely tags its UA distinctly, but Facebook,
// Messenger and Instagram's in-app webviews reliably do — these are the
// highest-volume source of "share a link, it fails to load" reports.
const isInAppBrowser = (ua: string) => /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\//i.test(ua);

export const diagnoseCheckoutError = (err: any, ctx: CheckoutErrorContext): CheckoutErrorInfo => {
    const suffix = ENTRY_SUFFIX[ctx.entryPoint];

    // No response object → the request never completed: offline, backgrounded,
    // an in-app browser, DNS/firewall, an SSL/clock problem, or a genuine timeout.
    if (!err?.response) {
        if (ctx.wasBackgrounded) {
            return {
                code: `PL-BACKGROUNDED-${suffix}`,
                title: 'Interrupted while loading',
                message: 'The page stopped loading while it was in the background — this happens if the screen locked or you switched apps mid-load.',
                tips: [
                    'Keep this tab open and in view until the checkout loads.',
                    'Tap Try Again to reload.',
                ],
                retry: true,
            };
        }

        if (!ctx.isOnline) {
            return {
                code: `PL-OFFLINE-${suffix}`,
                title: 'You appear to be offline',
                message: 'Your device reports no internet connection right now.',
                tips: [
                    'Check your Wi-Fi or mobile data is on.',
                    'Once you have a connection, tap Try Again.',
                ],
                retry: true,
            };
        }

        if (isInAppBrowser(ctx.userAgent)) {
            return {
                code: `PL-WEBVIEW-${suffix}`,
                title: "Can't load inside this app",
                message: 'This link was opened inside an app browser (Facebook, Messenger or Instagram), which sometimes blocks payment pages.',
                tips: [
                    'Tap the menu (••• or ⋮) and choose "Open in browser" (Chrome or Safari).',
                    'Then try the link again from there.',
                ],
                retry: true,
            };
        }

        const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
        if (timedOut) {
            return {
                code: `PL-TIMEOUT-${suffix}`,
                title: 'Connection timed out',
                message: 'The page took too long to load. This usually means a slow or unstable connection.',
                tips: [
                    'Try a different network — switch between Wi-Fi and mobile data.',
                    'Turn off any VPN or data-saver, then reload.',
                    'Tap Try Again.',
                ],
                retry: true,
            };
        }

        return {
            code: `PL-NETWORK-${suffix}`,
            title: "Can't reach the checkout",
            message: "We couldn't connect to the payment server. The link itself is fine — this is almost always a network or browser issue on this device.",
            tips: [
                'Check that you are connected to the internet.',
                'Turn off any VPN, ad-blocker or data-saver, then reload.',
                'Or try a different network — switch between Wi-Fi and mobile data.',
            ],
            retry: true,
        };
    }

    const status = err.response.status;
    if (status === 404) {
        return {
            code: `PL-404-${suffix}`,
            title: 'Link not found',
            message: 'This payment link is invalid or no longer exists. It may have been mistyped or only partly copied.',
            tips: [
                'Make sure the whole link was copied — links often get cut off when shared.',
                'Ask the business to send you a fresh payment link.',
            ],
            retry: false,
        };
    }
    if (status === 503) {
        return {
            code: `PL-503-${suffix}`,
            title: 'Payment service is busy',
            message: 'We couldn’t reach the payment service just now — it’s under heavy load. Your link is fine.',
            tips: [
                'Wait a few seconds, then tap Try Again.',
                'It usually works on the second try.',
            ],
            retry: true,
        };
    }
    if (status >= 500) {
        return {
            code: `PL-500-${suffix}`,
            title: 'The payment server had a hiccup',
            message: 'Something went wrong on our side. This is usually temporary.',
            tips: [
                'Wait a moment, then tap Try Again.',
                'If it keeps happening, let the business know.',
            ],
            retry: true,
        };
    }
    return {
        code: `PL-UNKNOWN-${suffix}`,
        title: 'Checkout unavailable',
        message: err.response?.data?.error || "We couldn't load this checkout right now. Please try again in a moment.",
        retry: true,
    };
};
