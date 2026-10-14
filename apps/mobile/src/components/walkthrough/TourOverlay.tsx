import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hand, X } from 'lucide-react-native';
import { measureTarget, tour, useTour, type Rect } from '../../lib/tour';
import { TASK_TITLES } from '../../lib/walkthrough';
import { colors, fonts, radius } from '../../theme/tokens';

const PAD = 6;
const DIM = 'rgba(8, 12, 24, 0.66)';
const sameRect = (a: Rect | null, b: Rect | null) => (!a && !b) || (!!a && !!b && Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5);

/**
 * The spotlight: dims the whole screen except a hole around the current step's element, with a pulsing ring and a
 * tooltip. Touches inside the hole reach the real element (so "tap it" really taps it); everything else is blocked
 * so the person stays on the path. If the step's screen isn't open it offers "Take me there".
 */
export const TourOverlay: React.FC = () => {
    const { step, index, total, taskId } = useTour();
    const pathname = usePathname();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: W, height: H } = useWindowDimensions();
    const [rect, setRect] = useState<Rect | null>(null);
    const pulse = useRef(new Animated.Value(0)).current;

    const onScreen = !!step && step.onScreen(pathname);

    // Follow the target: it can move (scrolling, keyboard, animation), so re-measure while the step is active.
    useEffect(() => {
        if (!step || !onScreen) { setRect(null); return; }
        let alive = true;
        const tick = async () => { const r = await measureTarget(step.target); if (alive) setRect((prev) => (sameRect(prev, r) ? prev : r)); };
        void tick();
        const id = setInterval(tick, 280);
        return () => { alive = false; clearInterval(id); };
    }, [step, onScreen]);

    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    if (!step) return null;
    const isLast = index + 1 >= total;
    const taskTitle = (taskId && TASK_TITLES[taskId]) || 'Walkthrough';

    const card = (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <Text style={styles.kicker} numberOfLines={1}>{taskTitle.toUpperCase()} · STEP {index + 1} OF {total}</Text>
                <Pressable onPress={tour.stop} hitSlop={10} accessibilityLabel="End the walkthrough"><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.actions}>
                <Pressable onPress={tour.stop} hitSlop={8}><Text style={styles.skip}>End tour</Text></Pressable>
                {!onScreen ? (
                    <Pressable style={styles.primary} onPress={() => router.navigate(step.route as any)}>
                        <Text style={styles.primaryText}>Take me there</Text>
                    </Pressable>
                ) : step.advance === 'next' ? (
                    <Pressable style={styles.primary} onPress={tour.next}>
                        <Text style={styles.primaryText}>{isLast ? 'Got it' : 'Next'}</Text>
                    </Pressable>
                ) : rect ? (
                    <View style={styles.hint}><Hand size={14} color={colors.blue} /><Text style={styles.hintText}>Tap the highlighted button</Text></View>
                ) : null}
            </View>
        </View>
    );

    // No hole to cut (wrong screen, or the element isn't there yet): a plain guide bar, nothing dimmed.
    if (!onScreen || !rect) {
        return (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.root]}>
                <View style={[styles.barWrap, { bottom: insets.bottom + 88 }]} pointerEvents="box-none">{card}</View>
            </View>
        );
    }

    const hole = { x: Math.max(0, rect.x - PAD), y: Math.max(0, rect.y - PAD), w: rect.width + PAD * 2, h: rect.height + PAD * 2 };
    const below = hole.y + hole.h / 2 < H * 0.52;
    const cardStyle = below
        ? { top: Math.min(hole.y + hole.h + 14, H - 250 - insets.bottom) }
        : { bottom: Math.max(H - hole.y + 14, insets.bottom + 12) };

    return (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.root]}>
            {/* four panels around the hole: they dim and block touches; the hole itself stays touchable */}
            <View style={[styles.panel, { top: 0, left: 0, right: 0, height: hole.y }]} />
            <View style={[styles.panel, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.panel, { top: hole.y, left: 0, width: hole.x, height: hole.h }]} />
            <View style={[styles.panel, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]} />

            <View pointerEvents="none" style={[styles.ring, { top: hole.y, left: hole.x, width: hole.w, height: hole.h }]} />
            <Animated.View
                pointerEvents="none"
                style={[styles.ring, styles.pulse, {
                    top: hole.y, left: hole.x, width: hole.w, height: hole.h,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
                }]}
            />
            <View style={[styles.cardWrap, cardStyle, { width: W }]} pointerEvents="box-none">{card}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { zIndex: 9000, elevation: 9000 },
    panel: { position: 'absolute', backgroundColor: DIM },
    ring: { position: 'absolute', borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF' },
    pulse: { borderColor: '#93C5FD', borderWidth: 3 },
    cardWrap: { position: 'absolute', left: 0, paddingHorizontal: 16 },
    barWrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 6,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    kicker: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 0.7, color: colors.blue },
    title: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    body: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19.5, color: '#374151' },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    skip: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    primary: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: '#FFFFFF' },
    hint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
    hintText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
});
