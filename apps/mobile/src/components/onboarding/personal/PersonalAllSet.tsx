import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react-native';
import { personalChecklist, type PersonalStepsMap, type PersonalStepKey } from 'core';
import { ConfettiOverlay } from '../ConfettiOverlay';
import { colors, fonts, radius } from '../../../theme/tokens';

/** Last screen of Personal onboarding: confetti, what's still open, and the way into the app. */
export function PersonalAllSet({ firstName, steps, finishing, error, onFinish, onOpenStep }: {
    firstName: string;
    steps: PersonalStepsMap;
    finishing: boolean;
    error: string | null;
    onFinish: () => void;
    onOpenStep: (key: PersonalStepKey) => void;
}) {
    const insets = useSafeAreaInsets();
    const open = personalChecklist(steps).filter((i) => !i.done);
    return (
        <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <ConfettiOverlay />
            <View style={{ flex: 1, paddingHorizontal: 24 }}>
                <CheckCircle2 size={56} color={colors.positive} />
                <Text style={styles.title} accessibilityRole="header">{firstName ? `You’re all set, ${firstName}` : 'You’re all set'}</Text>
                <Text style={styles.subtitle}>Your MoneyWise Personal account is ready.</Text>
                {open.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Finish later from Home</Text>
                        {open.map(({ def }) => (
                            <Pressable key={def.key} onPress={() => onOpenStep(def.key)} style={styles.row} accessibilityRole="button">
                                <Circle size={18} color={colors.textFaint} />
                                <Text style={styles.rowText}>{def.checklistLabel}</Text>
                                <Text style={styles.rowLink}>Do it now</Text>
                            </Pressable>
                        ))}
                    </View>
                )}
                {!!error && (
                    <View style={styles.errorBox}>
                        <AlertCircle size={18} color="#B91C1C" />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}
            </View>
            <View style={{ paddingHorizontal: 20 }}>
                <Pressable onPress={onFinish} disabled={finishing} accessibilityRole="button" style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.9 : 1 }]}>
                    {finishing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{error ? 'Try again' : 'Go to my dashboard'}</Text>}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text, marginTop: 20 },
    subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, marginTop: 8 },
    card: { marginTop: 32, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 16, gap: 4 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    rowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    rowLink: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.blue },
    errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: radius.sm, padding: 12, marginTop: 20 },
    errorText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: '#B91C1C' },
    primary: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
