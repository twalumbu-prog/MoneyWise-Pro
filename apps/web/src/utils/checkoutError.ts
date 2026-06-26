// Shared, payer-facing diagnosis for the public checkout pages (PublicPay and
// PublicPaymentLink). Turns whatever failed while loading the checkout into a
// plain-language, actionable message so a payer is never stuck on a vague error.
//
// The key split is "couldn't reach the server" (a network / browser / device
// issue on the payer's side — the link itself is fine) versus a real server
// response (link not found, server error, etc.), each with concrete next steps.

export interface CheckoutErrorInfo {
    title: string;
    message: string;
    tips?: string[];
    /** Whether a "Try Again" action could plausibly help. */
    retry: boolean;
}

export const diagnoseCheckoutError = (err: any): CheckoutErrorInfo => {
    // No response object → the request never completed: offline, blocked by an
    // ad-blocker/VPN/in-app browser, DNS/firewall, an SSL/clock problem, or a timeout.
    if (!err?.response) {
        const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
        return {
            title: timedOut ? 'Connection timed out' : "Can't reach the checkout",
            message: timedOut
                ? 'The page took too long to load. This usually means a slow or unstable connection.'
                : "We couldn't connect to the payment server. The link itself is fine — this is almost always a network or browser issue on this device.",
            tips: [
                'Check that you are connected to the internet.',
                'If you opened this from WhatsApp, Instagram or Facebook, tap the menu and choose "Open in browser" (Chrome or Safari), then try again.',
                'Turn off any VPN, ad-blocker or data-saver, then reload.',
                'Or try a different network — switch between Wi-Fi and mobile data.',
            ],
            retry: true,
        };
    }

    const status = err.response.status;
    if (status === 404) {
        return {
            title: 'Link not found',
            message: 'This payment link is invalid or no longer exists. It may have been mistyped or only partly copied.',
            tips: [
                'Make sure the whole link was copied — links often get cut off when shared.',
                'Ask the business to send you a fresh payment link.',
            ],
            retry: false,
        };
    }
    if (status >= 500) {
        return {
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
        title: 'Checkout unavailable',
        message: err.response?.data?.error || "We couldn't load this checkout right now. Please try again in a moment.",
        retry: true,
    };
};
