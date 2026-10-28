/**
 * Haptic feedback that never gets in the way: if the device (or this build) has no haptics module, every call is a no-op.
 */
let H: any = null;
try { H = require('expo-haptics'); } catch { /* not in this build */ }

const run = (fn: () => Promise<unknown> | undefined) => { try { void fn()?.catch?.(() => undefined); } catch { /* ignore */ } };

/** A light tick, e.g. as a slider passes a notch. */
export const hapticTick = () => run(() => H?.selectionAsync());
/** A firmer tap, e.g. the slider letting go or locking in. */
export const hapticImpact = (style: 'Light' | 'Medium' | 'Heavy' = 'Medium') => run(() => H?.impactAsync(H.ImpactFeedbackStyle[style]));
export const hapticSuccess = () => run(() => H?.notificationAsync(H.NotificationFeedbackType.Success));
export const hapticError = () => run(() => H?.notificationAsync(H.NotificationFeedbackType.Error));
