import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, ChevronRight, X } from 'lucide-react-native';
import { usePersonalOnboarding } from '../../../hooks/usePersonalOnboarding';
import { useAuth } from '../../../context/AuthContext';
import { cacheStoreSync } from '../../../platform/storage';
import { colors, fonts, radius } from '../../../theme/tokens';

const dismissKey = (orgId: string) => `personal-onboarding-checklist-dismissed:${orgId}`;

/**
 * Home "Finish setting up" (docs/personal-onboarding-plan.md, G4): the optional onboarding steps that were skipped,
 * each opening that one step on its own. Hidden when everything is done, when dismissed (per workspace, on this
 * device), and for accounts not on the PERSONAL_V2 flow.
 */
export function FinishSetupCard() {
    const router = useRouter();
    const { organizationId } = useAuth();
    const { state, checklist } = usePersonalOnboarding();
    const [dismissed, setDismissed] = useState(() => {
        try { return !!organizationId && cacheStoreSync.getItem(dismissKey(organizationId)) === '1'; } catch { return false; }
    });

    if (!state || state.status !== 'COMPLETED' || dismissed || !organizationId) return null;
    const open = checklist.filter((i) => !i.done);
    if (open.length === 0) return null;
    const doneCount = checklist.length - open.length;

    const dismiss = () => {
        try { cacheStoreSync.setItem(dismissKey(organizationId), '1'); } catch { /* still hide for this session */ }
        setDismissed(true);
    };

    return (
        <View style={styles.card}>
            <View style={styles.head}>
                <Text style={styles.title} accessibilityRole="header">Finish setting up</Text>
                <Text style={styles.count}>{doneCount} of {checklist.length} done</Text>
                <Pressable onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss finish setting up">
                    <X size={16} color={colors.textMuted} />
                </Pressable>
            </View>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round((doneCount / checklist.length) * 100)}%` }]} />
            </View>
            {checklist.map(({ def, done }) => (
                <Pressable
                    key={def.key}
                    disabled={done}
                    onPress={() => router.push({ pathname: '/personal-onboarding', params: { step: def.key, single: '1' } } as any)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: done }}
                    accessibilityLabel={done ? `${def.checklistLabel}, done` : def.checklistLabel}
                >
                    {done ? <CheckCircle2 size={20} color={colors.positive} /> : <Circle size={20} color={colors.textFaint} />}
                    <Text style={[styles.rowText, done && styles.rowDone]}>{def.checklistLabel}</Text>
                    {!done && <ChevronRight size={18} color={colors.textFaint} />}
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    count: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    track: { height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 10, marginBottom: 6, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: colors.blue },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    rowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    rowDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
