import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated, PanResponder, LayoutChangeEvent, ActivityIndicator, Easing } from 'react-native';
import { ChevronsRight } from 'lucide-react-native';
import { hapticTick, hapticImpact } from '../../lib/haptics';
import { colors, fonts } from '../../theme/tokens';

const THUMB = 56;
const PAD = 4;
/** How far along (0–1) the thumb must be let go to count as "paid". */
const COMPLETE_AT = 0.9;
/** A light tick each time the thumb passes one of these notches. */
const NOTCHES = [0.2, 0.4, 0.6, 0.8];

/**
 * "Slide to pay". Drag the thumb all the way along the track and let go: a light tick at each notch on the way, a firm tap when it
 * locks in, and `onComplete` fires. Letting go early springs it back. Bump `resetKey` to bring the thumb back (e.g. after the
 * person cancels the PIN check or the payment fails).
 */
export const SlideToPay: React.FC<{
    label: string;
    onComplete: () => void;
    disabled?: boolean;
    busy?: boolean;
    resetKey?: number;
}> = ({ label, onComplete, disabled, busy, resetKey = 0 }) => {
    const [width, setWidth] = useState(0);
    const max = Math.max(0, width - THUMB - PAD * 2);
    const x = useRef(new Animated.Value(0)).current;
    const maxRef = useRef(0); maxRef.current = max;
    const lastNotch = useRef(-1);
    const done = useRef(false);
    const live = useRef({ disabled: !!disabled, busy: !!busy, onComplete }); live.current = { disabled: !!disabled, busy: !!busy, onComplete };

    const springBack = () => {
        done.current = false; lastNotch.current = -1;
        Animated.spring(x, { toValue: 0, stiffness: 300, damping: 30, mass: 1, useNativeDriver: false }).start();
    };
    useEffect(() => { springBack(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetKey]);

    const pan = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.disabled && !live.current.busy && !done.current,
        onMoveShouldSetPanResponder: () => !live.current.disabled && !live.current.busy && !done.current,
        onPanResponderGrant: () => { hapticImpact('Light'); },
        onPanResponderMove: (_e, g) => {
            const m = maxRef.current; if (m <= 0) return;
            const v = Math.min(m, Math.max(0, g.dx));
            x.setValue(v);
            const n = NOTCHES.filter((t) => v / m >= t).length - 1;
            if (n !== lastNotch.current) { if (n > lastNotch.current) hapticTick(); lastNotch.current = n; }
        },
        onPanResponderRelease: (_e, g) => {
            const m = maxRef.current;
            if (m > 0 && Math.min(m, Math.max(0, g.dx)) / m >= COMPLETE_AT) {
                done.current = true;
                hapticImpact('Heavy');
                Animated.timing(x, { toValue: m, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => live.current.onComplete());
            } else {
                hapticImpact('Light');
                springBack();
            }
        },
        onPanResponderTerminate: () => springBack(),
    }), [x]);

    // The label fades out as the thumb covers it; the fill follows the thumb.
    const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });
    // Nothing at rest; from the first nudge it covers the thumb and then keeps extending with it all the way along.
    const span = Math.max(8, max);
    const fillWidth = x.interpolate({ inputRange: [0, 1, span], outputRange: [0, THUMB + PAD + 1, span + THUMB + PAD], extrapolate: 'clamp' });

    return (
        <View style={[styles.track, disabled && { opacity: 0.45 }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label}>
            <Animated.View style={[styles.fill, { width: fillWidth }]} />
            <Animated.Text style={[styles.label, { opacity: labelOpacity }]} numberOfLines={1}>{label}</Animated.Text>
            <Animated.View style={[styles.thumb, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
                {busy ? <ActivityIndicator color={colors.blue} /> : <ChevronsRight size={24} color={colors.blue} strokeWidth={2.5} />}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    // The track is the same grey (fill and stroke) as the "From" wallet row above it; the blue fill grows behind the thumb as it slides.
    track: { height: THUMB + PAD * 2, borderRadius: (THUMB + PAD * 2) / 2, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', overflow: 'hidden' },
    fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.blue, borderRadius: (THUMB + PAD * 2) / 2 },
    label: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textMuted, paddingLeft: THUMB / 2 },
    thumb: { position: 'absolute', left: PAD, top: PAD, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
