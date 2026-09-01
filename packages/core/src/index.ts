/**
 * `core` — everything the web app and the native app agree on.
 *
 * Nothing in here may touch the DOM, Vite's import.meta, or a native module.
 * Host-specific behaviour arrives through `configureCore` (see platform.ts).
 *
 * Migration is incremental by design: each module moves here and the old
 * apps/web file becomes a one-line re-export, so the web build stays green at
 * every commit and there is never a window where main is broken. See
 * docs/mobile-app/PLAN.md §3.
 */

export {
    configureCore,
    getCore,
    requireCapability,
} from './platform';

export type {
    CoreConfig,
    CoreEnv,
    KeyValueStore,
    Telemetry,
    TrackProps,
    EventStatus,
    FileAdapter,
    FilePickOptions,
    PickedFile,
    StreamAdapter,
} from './platform';

export { apiFetch, apiJson } from './api/apiFetch';

export { userService } from './services/user.service';
export type {
    UserProfile,
    UserRole,
    UserStatus,
    CreateUserInput,
    CreateUserResult,
    MutationAck,
} from './services/user.service';
