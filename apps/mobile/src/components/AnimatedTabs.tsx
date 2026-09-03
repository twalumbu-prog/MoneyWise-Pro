import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

/**
 * Mobile counterpart to apps/web/src/components/AnimatedTabs.tsx.
 *
 *  - AnimatedSegmented  – TabPillGroup/SegmentedControl equivalent: a
 *    spring-animated sliding indicator (framer-motion's `layoutId` has no RN
 *    equivalent, so this measures each item's full rect via onLayout and
 *    springs the indicator's translateX/translateY/width/height to match it
 *    exactly — matching x/y, not just x/width, matters because the track's
 *    own padding must NOT inflate the indicator past the button's own box).
 *  - AnimatedTabContent – AnimatedTabContent equivalent: directional
 *    slide+fade for the content panel below the tabs, driven by the same
 *    spring, whenever the active tab's index changes.
 */
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 } as const;

export interface SegmentedItem {
    value: string;
    content: React.ReactNode;
}

interface AnimatedSegmentedProps {
    value: string;
    onChange: (value: string) => void;
    items: SegmentedItem[];
    /** Outer row: flexDirection('row' assumed), padding, background, borderRadius, gap. */
    trackStyle?: StyleProp<ViewStyle>;
    /** The sliding "active" pill — background, shadow, borderRadius. Absolutely positioned; sized/moved to match the active item's own box. */
    indicatorStyle?: StyleProp<ViewStyle>;
    /** Applied to every Pressable item (padding, flex, alignItems — NOT background/shadow, which now lives on the indicator). */
    itemStyle?: StyleProp<ViewStyle>;
}

export function AnimatedSegmented({ value, onChange, items, trackStyle, indicatorStyle, itemStyle }: AnimatedSegmentedProps) {
    const layouts = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
    const measuredCount = useRef(0);
    const [ready, setReady] = useState(false);

    const indicatorX = useSharedValue(0);
    const indicatorY = useSharedValue(0);
    const indicatorWidth = useSharedValue(0);
    const indicatorHeight = useSharedValue(0);

    const applyRect = useCallback(
        (rect: { x: number; y: number; width: number; height: number }, animate: boolean) => {
            indicatorX.value = animate ? withSpring(rect.x, SPRING) : rect.x;
            indicatorY.value = animate ? withSpring(rect.y, SPRING) : rect.y;
            indicatorWidth.value = animate ? withSpring(rect.width, SPRING) : rect.width;
            indicatorHeight.value = animate ? withSpring(rect.height, SPRING) : rect.height;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const handleLayout = useCallback(
        (itemValue: string, e: LayoutChangeEvent) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            const wasMeasured = !!layouts.current[itemValue];
            layouts.current[itemValue] = { x, y, width, height };
            if (!wasMeasured) measuredCount.current += 1;

            // First measurement of the active item: snap into place with no
            // animation so the pill doesn't fly in from (0,0) on mount.
            if (itemValue === value) applyRect({ x, y, width, height }, ready);
            if (!ready && measuredCount.current === items.length) setReady(true);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [value, ready, items.length, applyRect],
    );

    // Subsequent tab switches: layouts are already known, so just spring the
    // indicator to the newly active item's cached rect.
    useEffect(() => {
        const rect = layouts.current[value];
        if (rect && ready) applyRect(rect, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, ready]);

    const indicatorAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }, { translateY: indicatorY.value }],
        width: indicatorWidth.value,
        height: indicatorHeight.value,
    }));

    return (
        <View style={[{ flexDirection: 'row', position: 'relative' }, trackStyle]}>
            <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', top: 0, left: 0 }, indicatorStyle, indicatorAnimStyle]}
            />
            {items.map((item) => (
                <Pressable
                    key={item.value}
                    onLayout={(e) => handleLayout(item.value, e)}
                    onPress={() => onChange(item.value)}
                    style={itemStyle}
                >
                    {item.content}
                </Pressable>
            ))}
        </View>
    );
}

// ---------------------------------------------------------------------------
// AnimatedTabContent
// ---------------------------------------------------------------------------

interface AnimatedTabContentProps {
    /** Changing this triggers a directional slide+fade of the content. */
    tabKey: string;
    /** Index of the active tab — higher = slide in from the right. */
    index: number;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * Directional slide-in for a tab's content panel — the RN equivalent of the
 * web AnimatedTabContent (framer-motion AnimatePresence). RN has no built-in
 * cross-fade-on-unmount primitive that works well here, so instead of
 * remounting, this keeps one persistent Animated.View and re-triggers the
 * spring imperatively whenever `tabKey` changes.
 */
export function AnimatedTabContent({ tabKey, index, children, style }: AnimatedTabContentProps) {
    const prevIndexRef = useRef(index);
    const isFirstRef = useRef(true);
    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        if (isFirstRef.current) {
            isFirstRef.current = false;
            prevIndexRef.current = index;
            return; // no animation on first mount
        }
        if (prevIndexRef.current === index) return;
        const dir = index > prevIndexRef.current ? 1 : -1;
        prevIndexRef.current = index;

        translateX.value = dir * 32;
        opacity.value = 0;
        translateX.value = withSpring(0, SPRING);
        opacity.value = withSpring(1, SPRING);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabKey]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: opacity.value,
    }));

    return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}
