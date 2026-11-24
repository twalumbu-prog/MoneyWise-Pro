import React, { useState, useEffect, useContext } from 'react';
import { SlideContext } from './slide';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, HelpCircle, X, AlertCircle } from 'lucide-react-native';
import { PERSONAL_CHAPTERS, type PersonalStepDef } from 'core';
import { colors, fonts, radius } from '../../../theme/tokens';
import { SheetModal } from '../../SheetModal';

/** Where the bar stood on the previous step, so the next step's bar springs on from there instead of starting over. */
let lastProgress: number | null = null;

function ProgressFill({ progress }: { progress: number }) {
    const reduced = useReducedMotion();
    const target = Math.max(0.04, progress);
    const w = useSharedValue(lastProgress ?? target);
    useEffect(() => {
        // Animate UI's progress spring: stiffness 300, damping 35, no overshoot
        w.value = reduced ? target : withSpring(target, { stiffness: 300, damping: 35, mass: 1, overshootClamping: true });
        lastProgress = target;
    }, [target, reduced, w]);
    const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
    return <Animated.View style={[styles.fill, style]} />;
}

/**
 * The frame every Personal onboarding step uses (docs/personal-onboarding-plan.md §4): back top-left, help top-right,
 * chapter + progress bar, large title, one-line subtitle, the step's content, and a bottom bar with Skip (optional
 * steps only) and Continue. The bottom bar rides above the keyboard.
 */
export function PersonalStepShell({
    def, progress, onBack, onSkip, onContinue, continueDisabled, saving, error, continueLabel = 'Continue', stickyAbove, children,
}: {
    def: PersonalStepDef;
    /** 0–1 through the whole flow. */
    progress: number;
    onBack?: () => void;
    /** Omitted for required steps. */
    onSkip?: () => void;
    onContinue: () => void;
    continueDisabled?: boolean;
    saving?: 'continue' | 'skip' | null;
    error?: string | null;
    continueLabel?: string;
    /** Pinned right above the Skip/Continue bar, outside the scroll area (a running total, say). */
    stickyAbove?: React.ReactNode;
    children: React.ReactNode;
}) {
    const insets = useSafeAreaInsets();
    const [helpOpen, setHelpOpen] = useState(false);
    const busy = !!saving;
    const slideX = useContext(SlideContext);
    const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slideX ? slideX.value : 0 }] }));

    return (
        <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top + 8 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
                {onBack ? (
                    <Pressable onPress={onBack} disabled={busy} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.circleBtn}>
                        <ChevronLeft size={24} color={colors.text} />
                    </Pressable>
                ) : <View style={styles.circleSpacer} />}
                <View style={{ flex: 1 }}>
                    <Text style={styles.chapter}>{PERSONAL_CHAPTERS[def.chapter]}</Text>
                </View>
                <Pressable onPress={() => setHelpOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Help with this step" style={styles.circleBtn}>
                    <HelpCircle size={22} color={colors.text} />
                </Pressable>
            </View>

            {/* Edge to edge, directly above the step's title. */}
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
                <ProgressFill progress={progress} />
            </View>

            {/* Only this middle part slides between steps. */}
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <Animated.View style={[{ flex: 1 }, slideStyle]}>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                        <Text style={styles.title} accessibilityRole="header">{def.title}</Text>
                        <Text style={styles.subtitle}>{def.subtitle}</Text>
                        <View style={{ marginTop: 28 }}>{children}</View>
                    </ScrollView>
                </Animated.View>
            </View>

            {/* Outside the scroll area so a failed save is always visible, however long the screen is. */}
            {!!error && (
                <View style={[styles.errorBox, { marginHorizontal: 20, marginTop: 8 }]} accessibilityLiveRegion="polite">
                    <AlertCircle size={18} color="#B91C1C" />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {stickyAbove}

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {onSkip && (
                    <Pressable onPress={onSkip} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.btn, styles.skip, { opacity: pressed ? 0.8 : 1 }]}>
                        {saving === 'skip' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.skipText}>Skip</Text>}
                    </Pressable>
                )}
                <Pressable
                    onPress={onContinue}
                    disabled={busy || continueDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || !!continueDisabled }}
                    style={({ pressed }) => [styles.btn, styles.primary, (busy || continueDisabled) && styles.primaryDisabled, { opacity: (busy || continueDisabled) ? 0.3 : pressed ? 0.85 : 1 }]}
                >
                    {saving === 'continue' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{continueLabel}</Text>}
                </Pressable>
            </View>

            <SheetModal visible={helpOpen} onRequestClose={() => setHelpOpen(false)}>
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle}>{def.title}</Text>
                        <Pressable onPress={() => setHelpOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                            <X size={22} color={colors.text} />
                        </Pressable>
                    </View>
                    <Text style={styles.sheetBody}>{def.help}</Text>
                </View>
            </SheetModal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
    circleBtn: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    circleSpacer: { width: 44, height: 44 },
    chapter: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, letterSpacing: 0.3, textAlign: 'center' },
    track: { alignSelf: 'stretch', height: 4, marginTop: 16, backgroundColor: colors.borderStrong, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: '#000000' },
    body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
    title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
    subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 6 },
    errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: radius.sm, padding: 12, marginTop: 20 },
    errorText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: '#B91C1C' },
    footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface },
    // The same pair as the Personal / Pro screen: black Continue, soft grey Skip, 46 high, 14 pt.
    btn: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    skip: { backgroundColor: colors.chipActiveBg },
    skipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    primary: { backgroundColor: '#000000' },
    primaryDisabled: { opacity: 0.3 },
    primaryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 24 },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, flex: 1, paddingRight: 12 },
    sheetBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
});
