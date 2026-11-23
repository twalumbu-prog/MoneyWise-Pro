import { Dimensions } from 'react-native';
import { withTiming, Easing } from 'react-native-reanimated';

/**
 * Animate UI's "push" page transition for Reanimated layout animations: the new page pushes the old one out, both
 * travelling the full width in the direction of travel (dir 1 = forward: new in from the right, old out to the left).
 * `dir` is a shared value so the page that is leaving sees the direction of the navigation that removes it.
 */
// Eases in and out (slow start, smooth middle, soft landing) rather than a hard ease-out snap.
export const PUSH_EASE = Easing.bezier(0.65, 0, 0.35, 1);
export const PUSH_MS = 520;
export const SCREEN_W = Dimensions.get('window').width; // read here: Dimensions can't be called inside a worklet

export const pushIn = (dir: { value: number }) => () => {
    'worklet';
    return {
        initialValues: { transform: [{ translateX: SCREEN_W * dir.value }] },
        animations: { transform: [{ translateX: withTiming(0, { duration: PUSH_MS, easing: PUSH_EASE }) }] },
    };
};

export const pushOut = (dir: { value: number }) => () => {
    'worklet';
    return {
        initialValues: { transform: [{ translateX: 0 }] },
        animations: { transform: [{ translateX: withTiming(-SCREEN_W * dir.value, { duration: PUSH_MS, easing: PUSH_EASE }) }] },
    };
};
