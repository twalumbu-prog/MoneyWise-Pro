import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    Easing, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Plus, PenLine, CalendarPlus, ArrowLeftRight, Link2, ChevronRight } from 'lucide-react-native';
import { colors, fonts } from '../../theme/tokens';

const ACTIONS = [
    { key: 'entry', label: 'Add a transaction', hint: 'Log money you received or spent', Icon: PenLine, go: '/manual-entry' },
    { key: 'bill', label: 'Add a bill', hint: 'Something you pay on a regular date', Icon: CalendarPlus, go: '/schedules?new=1' },
    { key: 'send', label: 'Send money', hint: 'Pay someone from your account', Icon: ArrowLeftRight, go: '/requisition/new' },
    { key: 'link', label: 'Create a pay link', hint: 'Let anyone pay you with mobile money', Icon: Link2, go: '/wallet/pay-link' },
] as const;

const FAB = 56;
const RIGHT = 20;
const GAP = 34;            // room between the button and the bubble for the thought-bubble dots
const ROW = 66;
const HEAD = 20;
const CARD_H = HEAD + ACTIONS.length * ROW + 14;

/**
 * The Home page's + button and the menu that grows out of it.
 *
 * Opening: the + turns into a × (spring, with a little overshoot) and squashes slightly; two small dots pop out of it, one after the
 * other, like a thought bubble; then the bubble itself swells out of the button, from a 56pt circle to the full card, wobbling as it
 * settles, and its four rows rise in one by one. The button stays visible the whole time.
 * Closing: the rows drop away, the bubble is drawn back down into the button (accelerating, like a window into the Dock), the dots
 * pop, and the × turns back into a +.
 */
export const QuickAddMenu: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; bottom: number }> = ({ open, onOpenChange, bottom }) => {
    const reduced = useReducedMotion();
    const W = Dimensions.get('window').width;
    const CARD_W = Math.min(W - RIGHT * 2, 340);
    const [showing, setShowing] = useState(open);
    const p = useSharedValue(0);       // the bubble: 0 = a circle inside the button, 1 = the open card
    const dots = useSharedValue(0);    // the two thought-bubble dots
    const press = useSharedValue(0);   // button squash while a finger is on it

    useEffect(() => {
        if (open) {
            setShowing(true);
            if (reduced) { p.value = withTiming(1, { duration: 160 }); dots.value = 0; return; }
            dots.value = withSpring(1, { damping: 9, stiffness: 220 });
            p.value = withSpring(1, { damping: 11, stiffness: 120, mass: 0.9 });   // a little overshoot: the bubble wobbles as it settles
        } else if (showing) {
            dots.value = withTiming(0, { duration: 160 });
            p.value = withTiming(0, { duration: reduced ? 140 : 380, easing: reduced ? Easing.linear : Easing.bezier(0.6, 0.04, 0.9, 0.35) }, (done) => {
                if (done) runOnJS(setShowing)(false);
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, reduced]);

    const scrim = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 1], [0, 0.38], 'clamp') }));

    // The bubble grows from the button's own rectangle upward and leftward, keeping its bottom-right corner near the button.
    const card = useAnimatedStyle(() => ({
        opacity: interpolate(p.value, [0, 0.04], [0, 1], 'clamp'),
        width: interpolate(p.value, [0, 1], [FAB, CARD_W]),
        height: interpolate(p.value, [0, 1], [FAB, CARD_H]),
        bottom: interpolate(p.value, [0, 1], [bottom, bottom + FAB + GAP]),
        borderRadius: interpolate(p.value, [0, 0.6, 1], [FAB / 2, 34, 26]),
    }));
    const row = (i: number) => useAnimatedStyle(() => {
        const a = 0.42 + i * 0.09;
        return {
            opacity: interpolate(p.value, [a, a + 0.28], [0, 1], 'clamp'),
            transform: [{ translateY: interpolate(p.value, [a, a + 0.28], [16, 0], 'clamp') }, { scale: interpolate(p.value, [a, a + 0.28], [0.96, 1], 'clamp') }],
        };
    });
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const rowStyles = [r0, r1, r2, r3];

    // Thought-bubble dots: a small one near the button, a bigger one nearer the bubble.
    const dotA = useAnimatedStyle(() => ({ opacity: interpolate(dots.value, [0, 0.2], [0, 1], 'clamp'), transform: [{ scale: dots.value }] }));
    const dotB = useAnimatedStyle(() => ({ opacity: interpolate(dots.value, [0.25, 0.5], [0, 1], 'clamp'), transform: [{ scale: interpolate(dots.value, [0.25, 1], [0, 1], 'clamp') }] }));

    const fab = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(p.value, [0, 1], [colors.blue, colors.navy]),
        transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.9]) * interpolate(p.value, [0, 0.25, 1], [1, 0.9, 1]) }],
    }));
    const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(p.value, [0, 1], [0, 135])}deg` }] }));

    const toggle = () => onOpenChange(!open);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {showing && (
                <>
                    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]} pointerEvents="none" />
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} accessibilityLabel="Close menu" />

                    <Animated.View pointerEvents="none" style={[styles.dot, { width: 9, height: 9, borderRadius: 5, right: RIGHT + FAB / 2 - 4, bottom: bottom + FAB + 5 }, dotA]} />
                    <Animated.View pointerEvents="none" style={[styles.dot, { width: 15, height: 15, borderRadius: 8, right: RIGHT + FAB / 2 + 3, bottom: bottom + FAB + 14 }, dotB]} />

                    <Animated.View style={[styles.card, { right: RIGHT }, card]}>
                        <View style={{ width: CARD_W, paddingTop: HEAD / 2 }}>
                            {ACTIONS.map(({ key, label, hint, Icon, go }, i) => (
                                <Animated.View key={key} style={rowStyles[i]}>
                                    <Pressable
                                        onPress={() => { onOpenChange(false); router.push(go as any); }}
                                        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.canvasAlt }]}
                                        accessibilityRole="button"
                                        accessibilityLabel={label}
                                    >
                                        <View style={styles.iconWrap}><Icon size={20} color={colors.blue} /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>{label}</Text>
                                            <Text style={styles.hint}>{hint}</Text>
                                        </View>
                                        <ChevronRight size={18} color={colors.textFaint} />
                                    </Pressable>
                                </Animated.View>
                            ))}
                        </View>
                    </Animated.View>
                </>
            )}

            <Animated.View style={[styles.fab, { right: RIGHT, bottom }, fab]}>
                <Pressable
                    style={styles.fabHit}
                    onPress={toggle}
                    onPressIn={() => { press.value = withTiming(1, { duration: 90 }); }}
                    onPressOut={() => { press.value = withSequence(withTiming(0, { duration: 120 }), withTiming(0, { duration: 0 })); }}
                    accessibilityRole="button"
                    accessibilityLabel={open ? 'Close menu' : 'Add'}
                >
                    <Animated.View style={plus}><Plus size={26} color="#FFFFFF" /></Animated.View>
                </Pressable>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    scrim: { backgroundColor: '#000' },
    card: {
        position: 'absolute', backgroundColor: colors.surface, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
    },
    dot: { position: 'absolute', backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: ROW, paddingHorizontal: 18 },
    iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    fab: {
        position: 'absolute', width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.blue, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 12,
    },
    fabHit: { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center' },
});
