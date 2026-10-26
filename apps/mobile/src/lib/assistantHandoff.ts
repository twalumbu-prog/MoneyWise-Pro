/**
 * Hands a question typed on Home to the Assistant: Home stores it, switches to the Intelligence tab, and the Assistant sends it
 * the moment it comes into view (consumed once, so coming back to the tab later doesn't resend it).
 */
let pending: string | null = null;

export const queueAssistantPrompt = (text: string) => { pending = text.trim() || null; };

export const takeAssistantPrompt = (): string | null => {
    const p = pending;
    pending = null;
    return p;
};
