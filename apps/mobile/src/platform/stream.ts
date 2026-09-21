import { fetch as expoFetch } from 'expo/fetch';
import type { StreamAdapter } from 'core';

/**
 * SSE transport for the streaming assistant — the one native unknown the plan
 * called out (PLAN.md §4).
 *
 * The web app reads `response.body.getReader()`. React Native's stock `fetch`
 * has no `ReadableStream` at all: `response.body` is null, and the whole
 * response only resolves once the stream closes — which for a long agent turn
 * means the UI shows nothing for many seconds and then everything at once.
 *
 * `expo/fetch` is a WinterCG-compliant fetch built on the native networking
 * stack, and it does expose a streaming body. It also takes headers and a POST
 * body, which `EventSource` cannot — and the assistant needs a bearer token and
 * a JSON payload, which is exactly why the web client dropped EventSource too.
 *
 * Yields decoded text as it arrives. Frame parsing stays in core so both
 * clients agree on the wire format.
 */
export const streamAdapter: StreamAdapter = async function* (url, init) {
    const response = await expoFetch(url, init as any);

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const err: any = new Error(body?.error ?? `Stream failed: ${response.status} ${response.statusText}`);
        err.status = response.status;
        err.body = body;
        throw err;
    }
    if (!response.body) {
        // Guards against a future SDK regression rather than a condition we
        // expect: a silent non-streaming fallback would look like a hang.
        throw new Error('expo/fetch returned no readable body — streaming unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
        // Flush any character split across the final chunk boundary.
        const tail = decoder.decode();
        if (tail) yield tail;
    } finally {
        // Cancels the underlying request when the consumer stops early — the
        // user navigating away mid-answer must not leave the socket open.
        await reader.cancel().catch(() => {});
    }
};
