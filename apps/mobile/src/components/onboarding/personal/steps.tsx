import React, { useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { DateField } from '../../invest/application/formFields';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/** "About you" text steps: name and date of birth. Shared input styling lives here too. */

export const nameValid = (d: { firstName: string; lastName: string }) => d.firstName.trim().length > 0 && d.lastName.trim().length > 0;
export const dobValid = (d: { dateOfBirth: string }) => /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth);

export function StepName({ ctx }: { ctx: StepContext }) {
    const v = ctx.drafts.name;
    const lastRef = useRef<TextInput>(null);
    const submit = () => {
        if (!nameValid(v)) return;
        void ctx.run('continue', async () => {
            const res = await ctx.service.saveStep('name', 'done', { firstName: v.firstName, lastName: v.lastName });
            const saved = res.data as { firstName: string; lastName: string } | null;
            if (saved) { ctx.setDraft('name', saved); ctx.patchProfile(saved); }
            return res;
        });
    };
    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onContinue={submit} continueDisabled={!nameValid(v)} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Save' : 'Continue'}>
            <View style={{ gap: 20 }}>
                <Field
                    label="First name" value={v.firstName} error={ctx.fieldErrors.firstName} autoFocus={!v.firstName}
                    onChangeText={(t) => ctx.setDraft('name', { ...v, firstName: t })}
                    textContentType="givenName" autoComplete="name-given" returnKeyType="next" autoCapitalize="words"
                    onSubmitEditing={() => lastRef.current?.focus()}
                />
                <Field
                    ref={lastRef}
                    label="Last name" value={v.lastName} error={ctx.fieldErrors.lastName}
                    onChangeText={(t) => ctx.setDraft('name', { ...v, lastName: t })}
                    textContentType="familyName" autoComplete="name-family" returnKeyType="done" autoCapitalize="words"
                    onSubmitEditing={submit}
                />
            </View>
        </PersonalStepShell>
    );
}

export function StepDob({ ctx }: { ctx: StepContext }) {
    const v = ctx.drafts.dob;
    const submit = () => void ctx.run('continue', async () => {
        const res = await ctx.service.saveStep('dob', 'done', { dateOfBirth: v.dateOfBirth });
        ctx.patchProfile({ dateOfBirth: v.dateOfBirth });
        return res;
    });
    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onContinue={submit} continueDisabled={!dobValid(v)} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Save' : 'Continue'}>
            <DateField label="Date of birth" value={v.dateOfBirth} onChange={(iso) => ctx.setDraft('dob', { dateOfBirth: iso })} error={ctx.fieldErrors.dateOfBirth} />
        </PersonalStepShell>
    );
}

export const Field = React.forwardRef<TextInput, {
    label: string; value: string; error?: string; onChangeText: (t: string) => void; autoFocus?: boolean;
    textContentType?: any; autoComplete?: any; returnKeyType?: any; onSubmitEditing?: () => void; autoCapitalize?: any;
    keyboardType?: any; placeholder?: string; maxLength?: number; prefix?: React.ReactNode; inputStyle?: any;
}>(({ label, value, error, onChangeText, autoFocus, textContentType, autoComplete, returnKeyType, onSubmitEditing, autoCapitalize = 'none', keyboardType, placeholder, maxLength = 50, prefix, inputStyle }, ref) => (
    <View>
        <Text style={fieldStyles.label}>{label}</Text>
        <View style={[fieldStyles.inputWrap, !!error && fieldStyles.inputError]}>
            {prefix}
            <TextInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder ?? label}
                placeholderTextColor={colors.textFaint}
                autoCapitalize={autoCapitalize}
                autoCorrect={false}
                autoFocus={autoFocus}
                textContentType={textContentType}
                autoComplete={autoComplete}
                returnKeyType={returnKeyType}
                onSubmitEditing={onSubmitEditing}
                keyboardType={keyboardType}
                maxLength={maxLength}
                accessibilityLabel={label}
                style={[fieldStyles.input, inputStyle]}
            />
        </View>
        {!!error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
));

export const fieldStyles = StyleSheet.create({
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
        paddingHorizontal: 16, backgroundColor: colors.surface, gap: 10,
    },
    input: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.text, paddingVertical: 14 },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 6 },
});
