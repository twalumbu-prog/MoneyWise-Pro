/**
 * The adapter boundary between `core` and whatever is hosting it.
 *
 * `core` holds every piece of logic the web app and the native app agree on:
 * services, the API client, session handling, query keys, formatters. None of
 * that may reach for `window`, `localStorage`, `import.meta.env`, or streaming
 * `fetch` — those exist on exactly one of the two platforms. Everything
 * environment-specific arrives through this object instead, injected once at
 * each app's entry point via `configureCore`.
 *
 * The ban is enforced by `.eslintrc.json` (no-restricted-globals), not by tsc:
 * the DOM lib has to stay on for `fetch`/`Response`, which React Native also
 * provides, and that unavoidably types `window` alongside them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from 'shared';

/** Async on purpose: web's localStorage is sync, expo-secure-store is not. */
export interface KeyValueStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}

export interface CoreEnv {
    apiUrl: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    /** Git sha or build id. Used as the persisted-cache buster and in telemetry. */
    appVersion: string;
    isProduction: boolean;
}

export type EventStatus = 'started' | 'succeeded' | 'failed';

export interface TrackProps {
    workflow_id: string;
    organization_id?: string;
    user_id?: string;
    [key: string]: unknown;
}

export interface Telemetry {
    /** Fires a `<feature>_<action>_<status>` event. Must never throw. */
    track(feature: string, action: string, status: EventStatus, props: TrackProps): void;
}

/** A file chosen by the user, normalised across DOM File and expo-image-picker assets. */
export interface PickedFile {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
    /** Present on web, where the DOM File is passed straight to FormData. */
    blob?: Blob;
}

export interface FilePickOptions {
    kind: 'image' | 'document' | 'any';
    multiple?: boolean;
    /** Mime types or extensions; advisory on native. */
    accept?: string[];
}

export interface FileAdapter {
    pick(options: FilePickOptions): Promise<PickedFile[]>;
    /** Downscale/recompress before upload. Receipts and logos go through here. */
    compressImage(file: PickedFile, maxBytes: number): Promise<PickedFile>;
}

/**
 * Server-sent-event transport for the streaming assistant.
 *
 * Web reads `response.body.getReader()`. React Native's stock `fetch` has no
 * `ReadableStream` at all, so native supplies `expo/fetch` instead. Yields
 * raw SSE frame text; parsing stays in core.
 */
export type StreamAdapter = (url: string, init: RequestInit) => AsyncIterable<string>;

export interface CoreConfig {
    /**
     * Supplied by the host rather than constructed here, deliberately: the web
     * app already has a live client holding real user sessions, and rebuilding
     * it under them risks signing everyone out. Native passes its own, built on
     * expo-secure-store with `detectSessionInUrl: false`.
     */
    supabase: SupabaseClient<Database>;
    env: CoreEnv;
    /** Bulk cache. Web: localStorage. Native: react-native-mmkv. */
    storage: KeyValueStore;
    /** Credentials only. Web: localStorage. Native: expo-secure-store. */
    secureStorage: KeyValueStore;
    telemetry: Telemetry;
    randomUUID(): string;
    /** Monotonic milliseconds, for durations. Web: performance.now(). */
    now(): number;

    // ── Filled in as later phases move their services over (see PLAN.md §5) ──
    files?: FileAdapter;
    stream?: StreamAdapter;
    openExternal?(url: string): Promise<void>;
}

let config: CoreConfig | null = null;

/** Call once, before any core module is used. */
export function configureCore(next: CoreConfig): void {
    config = next;
}

export function getCore(): CoreConfig {
    if (!config) {
        throw new Error(
            'core is not configured. Call configureCore(...) at your app entry point ' +
            'before importing anything that uses it.'
        );
    }
    return config;
}

/**
 * Narrowing accessor for the optional capabilities, so a service that needs one
 * fails with the phase it belongs to rather than a bare `undefined is not a function`.
 */
export function requireCapability<K extends 'files' | 'stream' | 'openExternal'>(
    key: K
): NonNullable<CoreConfig[K]> {
    const value = getCore()[key];
    if (!value) {
        throw new Error(`core: the host has not supplied the "${key}" adapter.`);
    }
    return value as NonNullable<CoreConfig[K]>;
}
