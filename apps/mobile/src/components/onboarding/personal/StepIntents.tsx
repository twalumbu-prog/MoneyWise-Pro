import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AnimatedCheck } from '../../auth/AnimatedCheck';
import { hapticTick } from '../../../lib/haptics';
import { PERSONAL_INTENTS } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/** Step "intents": one tap, any number of choices, none required. */
export function StepIntents({ ctx }: { ctx: StepContext }) {
    const picked = ctx.drafts.intents;
    const toggle = (k: string) => { hapticTick(); ctx.setDraft('intents', picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]); };
    const save = () => void ctx.run('continue', () => ctx.service.saveStep('intents', 'done', { intents: picked }));
    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip} onContinue={save} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Save' : 'Continue'}>
            <View style={styles.wrap}>
                {PERSONAL_INTENTS.map(({ key, label }) => {
                    const on = picked.includes(key);
                    return (
                        <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, on && styles.cardOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                            <Text style={styles.cardText}>{label}</Text>
                            <AnimatedCheck checked={on} />
                        </Pressable>
                    );
                })}
            </View>
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10 },
    // Same cards as the Personal / Pro choice: thin light stroke; selected is white with a grey stroke and a soft shadow.
    card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: '#ECEDF1', backgroundColor: colors.surface },
    cardOn: { backgroundColor: '#FFFFFF', borderColor: '#C4C8D2', shadowColor: '#1F2547', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    cardText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
