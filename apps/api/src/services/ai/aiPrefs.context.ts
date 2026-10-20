/**
 * Lets one person's AI model choice (Settings → Preferences) reach the shared provider layer without threading a
 * parameter through every classifier: the caller wraps its work in runWithCategorizationModel and
 * callAllCategorizationProviders reads the override from the async context.
 */
import { AsyncLocalStorage } from 'async_hooks';

const store = new AsyncLocalStorage<{ categorizationModel: string | null }>();

export function runWithCategorizationModel<T>(model: string | null | undefined, fn: () => Promise<T>): Promise<T> {
    return model ? store.run({ categorizationModel: model }, fn) : fn();
}

export function getCategorizationModelOverride(): string | null {
    return store.getStore()?.categorizationModel ?? null;
}
