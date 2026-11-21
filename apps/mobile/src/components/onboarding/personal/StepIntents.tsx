import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { PERSONAL_INTENTS } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/** Step "intents": one tap, any number of choices, none required. */
export function StepIntents({ ctx }: { ctx: StepContext }) {
    const picked = ctx.drafts.intents;
    const toggle = (k: string) => ctx.setDraft('intents', picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
    const save = () => void ctx.run('continue', () => ctx.service.saveStep('intents', 'done', { intents: picked }));
    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip} onContinue={save} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Save' : 'Continue'}>
            <View style={styles.wrap}>
                {PERSONAL_INTENTS.map(({ key, label }) => {
                    const on = picked.includes(key);
                    return (
                        <Pressable key={key} onPress={() => toggle(key)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                            {on && <Check size={16} color={colors.blue} />}
                            <Text style={[styles.chipText, on && { color: colors.blue }]}>{label}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    chipOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
