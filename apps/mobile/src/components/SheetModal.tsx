import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';

/**
 * The app's bottom-sheet pop-up. Same idea as every polished iOS app: the dark backdrop covers the whole screen and
 * simply FADES in, while the sheet slides up on its own (and back down on close). React Native's built-in
 * animationType="slide" slides the whole modal — backdrop included — which looks like a dark panel rising, so this
 * wrapper turns that off and animates the two layers separately, with Animate UI's spring (stiffness 300, damping 35,
 * no overshoot) for the slide.
 *
 * Drop-in for `<Modal transparent animationType="slide">`: put ONLY the sheet inside (no backdrop view — it is drawn
 * here, and tapping it calls onRequestClose). Children are anchored to the bottom. While closing, the last content is
 * kept, so a sheet that empties itself on dismiss doesn't go blank mid-slide.
 */
const SCREEN_H = Dimensions.get('window').height;

export function SheetModal({
    visible, onRequestClose, children, scrimOpacity = 0.42, dismissOnScrim = true, statusBarTranslucent = true,
}: {
    visible: boolean;
    onRequestClose?: () => void;
    children: React.ReactNode;
    /** 0–1 darkness of the backdrop at rest. */
    scrimOpacity?: number;
    dismissOnScrim?: boolean;
    statusBarTranslucent?: boolean;
}) {
    const reduced = useReducedMotion();
    const [mounted, setMounted] = useState(visible);
    const p = useSharedValue(0); // 0 hidden → 1 shown
    const last = useRef(children);
    if (visible) last.current = children;

    const hide = () => setMounted(false);
    useEffect(() => {
        if (visible) {
            setMounted(true);
            p.value = reduced
                ? withTiming(1, { duration: 160 })
                : withSpring(1, { stiffness: 300, damping: 35, mass: 1, overshootClamping: true });
        } else if (mounted) {
            p.value = withTiming(0, { duration: reduced ? 140 : 240, easing: Easing.bezier(0.4, 0, 0.6, 1) }, (done) => {
                if (done) runOnJS(hide)();
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, reduced]);

    const scrim = useAnimatedStyle(() => ({ opacity: Math.min(p.value, 1) * scrimOpacity }));
    const slide = useAnimatedStyle(() => ({
        opacity: reduced ? p.value : 1,
        transform: [{ translateY: reduced ? 0 : (1 - p.value) * SCREEN_H }],
    }));

    return (
        <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent={statusBarTranslucent}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]} pointerEvents="none" />
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={dismissOnScrim ? onRequestClose : undefined}
                accessibilityLabel="Close"
                accessibilityRole="button"
            />
            <Animated.View style={[StyleSheet.absoluteFill, styles.layer, slide]} pointerEvents="box-none">
                <View style={styles.anchor} pointerEvents="box-none">{last.current}</View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { backgroundColor: '#000' },
    layer: { justifyContent: 'flex-end' },
    anchor: { flex: 1, justifyContent: 'flex-end' },
});
