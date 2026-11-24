import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { splitIsoDate, toIsoDate } from 'core';
import { hapticTick } from '../../../lib/haptics';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { colors, fonts } from '../../../theme/tokens';

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
            <DropdownDate label="Date of birth" value={v.dateOfBirth} onChange={(iso) => ctx.setDraft('dob', { dateOfBirth: iso })} error={ctx.fieldErrors.dateOfBirth} />
        </PersonalStepShell>
    );
}

export const Field = React.forwardRef<TextInput, {
    label: string; value: string; error?: string; onChangeText: (t: string) => void; autoFocus?: boolean;
    textContentType?: any; autoComplete?: any; returnKeyType?: any; onSubmitEditing?: () => void; autoCapitalize?: any;
    keyboardType?: any; placeholder?: string; maxLength?: number; prefix?: React.ReactNode; inputStyle?: any; secureTextEntry?: boolean; suffix?: React.ReactNode;
}>(({ label, value, error, onChangeText, autoFocus, textContentType, autoComplete, returnKeyType, onSubmitEditing, autoCapitalize = 'none', keyboardType, placeholder, maxLength = 50, prefix, inputStyle, secureTextEntry, suffix }, ref) => {
    // Without a placeholder the label is the placeholder: it sits inside the empty field and floats up once you focus or type.
    const floating = placeholder === undefined;
    const [focused, setFocused] = useState(false);
    const up = floating && (focused || value.length > 0);
    const p = useSharedValue(up ? 1 : 0);
    useEffect(() => { p.value = withTiming(up ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) }); }, [up, p]);
    const labelStyle = useAnimatedStyle(() => ({
        fontSize: 17 - 4 * p.value,
        transform: [{ translateY: -22 * p.value }],
    }));
    return (
        <View>
            {!floating && <Text style={fieldStyles.label}>{label}</Text>}
            <View style={[fieldStyles.inputWrap, floating && { marginTop: 18 }, !!error && fieldStyles.inputError]}>
                {floating && (
                    <Animated.Text
                        pointerEvents="none"
                        style={[fieldStyles.floatLabel, { color: up ? colors.textMuted : colors.textFaint }, labelStyle]}
                    >{label}</Animated.Text>
                )}
                {prefix}
                <TextInput
                    ref={ref}
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={floating ? undefined : placeholder}
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
                    secureTextEntry={secureTextEntry}
                    accessibilityLabel={label}
                    style={[fieldStyles.input, inputStyle]}
                />
                {suffix}
            </View>
            {!!error && <Text style={fieldStyles.error}>{error}</Text>}
        </View>
    );
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ITEM_H = 44;
type Part = 'day' | 'month' | 'year';

/** Date of birth as three underlined fields; tapping one opens a scrollable list right under it. Picking moves on to the next. */
function DropdownDate({ label, value, onChange, error }: { label: string; value: string; onChange: (iso: string) => void; error?: string }) {
    const init = splitIsoDate(value);
    const [d, setD] = useState<number>(parseInt(init.day, 10) || 0);
    const [m, setM] = useState<number>(parseInt(init.month, 10) || 0);
    const [y, setY] = useState<number>(parseInt(init.year, 10) || 0);
    const [open, setOpen] = useState<Part | null>(null);
    const [atEnd, setAtEnd] = useState(false);
    useEffect(() => { setAtEnd(false); }, [open]);
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 101 }, (_, i) => thisYear - 10 - i);
    const daysIn = (mm: number, yy: number) => new Date(yy || 2000, mm || 1, 0).getDate();

    const commit = (nd: number, nm: number, ny: number) => {
        if (nd && nm && ny) {
            const dd = Math.min(nd, daysIn(nm, ny));
            if (dd !== nd) setD(dd);
            onChange(toIsoDate(String(dd), String(nm), String(ny)));
        } else onChange('');
    };
    const pick = (part: Part, n: number) => {
        hapticTick();
        let nd = d, nm = m, ny = y;
        if (part === 'day') nd = n; else if (part === 'month') nm = n; else ny = n;
        setD(nd); setM(nm); setY(ny);
        commit(nd, nm, ny);
        setOpen(part === 'day' ? 'month' : part === 'month' ? 'year' : null);
    };

    const items: { n: number; text: string }[] =
        open === 'day' ? Array.from({ length: 31 }, (_, i) => ({ n: i + 1, text: String(i + 1) }))
        : open === 'month' ? MONTHS.map((t, i) => ({ n: i + 1, text: t }))
        : open === 'year' ? years.map((n) => ({ n, text: String(n) })) : [];
    const selected = open === 'day' ? d : open === 'month' ? m : y;

    const cell = (part: Part, text: string, placeholder: string, flex: number) => (
        <Pressable
            onPress={() => setOpen(open === part ? null : part)}
            style={[fieldStyles.inputWrap, { flex, paddingRight: 4 }, open === part && { borderColor: colors.text }, !!error && fieldStyles.inputError]}
            accessibilityRole="button" accessibilityLabel={`${label} ${part}`}
        >
            <Text style={[fieldStyles.input, { paddingVertical: 12, color: text ? colors.text : colors.textFaint }]}>{text || placeholder}</Text>
            <ChevronDown size={16} color={colors.textMuted} style={{ transform: [{ rotate: open === part ? '180deg' : '0deg' }] }} />
        </Pressable>
    );

    return (
        <View>
            <Text style={fieldStyles.label}>{label}</Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
                {cell('day', d ? String(d) : '', 'Day', 0.8)}
                {cell('month', m ? MONTHS[m - 1] : '', 'Month', 1.5)}
                {cell('year', y ? String(y) : '', 'Year', 1)}
            </View>
            {open && (
                <View style={dd.shadow}>
                    <View style={dd.list}>
                        <ScrollView
                            key={open}
                            style={{ maxHeight: ITEM_H * 6 }}
                            nestedScrollEnabled showsVerticalScrollIndicator
                            scrollEventThrottle={32}
                            onScroll={(e) => {
                                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                                const end = contentOffset.y + layoutMeasurement.height >= contentSize.height - 8;
                                if (end !== atEnd) setAtEnd(end);
                            }}
                            contentOffset={{ x: 0, y: Math.max(0, items.findIndex((i) => i.n === selected) - 1) * ITEM_H }}
                        >
                            {items.map((it) => (
                                <Pressable key={it.n} onPress={() => pick(open, it.n)} style={[dd.row, it.n === selected && { backgroundColor: colors.chipActiveBg }]} accessibilityRole="button">
                                    <Text style={[dd.rowText, it.n === selected && { fontFamily: fonts.bodyBold }]}>{it.text}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                        {!atEnd && (
                            <LinearGradient
                                pointerEvents="none"
                                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', '#FFFFFF']}
                                style={dd.fade}
                            >
                                <Text style={dd.hint}>Scroll down for more</Text>
                            </LinearGradient>
                        )}
                    </View>
                </View>
            )}
            {!!error && <Text style={fieldStyles.error}>{error}</Text>}
        </View>
    );
}

const dd = StyleSheet.create({
    // shadow on the outer view, clipping on the inner one (iOS clips a shadow drawn on a clipped view)
    shadow: {
        marginTop: 8, borderRadius: 14, backgroundColor: '#FFFFFF',
        shadowColor: '#1F2547', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8,
    },
    list: { borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEDF1', overflow: 'hidden' },
    fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 6 },
    hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    row: { height: ITEM_H, justifyContent: 'center', paddingHorizontal: 16 },
    rowText: { fontFamily: fonts.body, fontSize: 16, color: colors.text },
});

export const fieldStyles = StyleSheet.create({
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    // The label sits above; the field itself is just text over a subtle underline.
    inputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 46, borderBottomWidth: 1, borderColor: '#D9DCE3', gap: 10 },
    floatLabel: { position: 'absolute', left: 0, top: 12, fontFamily: fonts.body, fontSize: 17 },
    input: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.text, paddingVertical: 10 },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 6 },
});
