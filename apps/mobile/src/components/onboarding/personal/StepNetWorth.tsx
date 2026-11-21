import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { PersonalStepShell } from './PersonalStepShell';
import { fmtK, useCountUp } from './moneyUi';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "net_worth": the reward at the end of "Your money". Today's net worth (what was added in this chapter:
 * accounts + holdings − debts), counted up, with a ring showing where it sits. No input.
 */
const SEGMENTS = [
    { key: 'mobileMoney', label: 'Mobile money', color: '#FFCB05' },
    { key: 'bank', label: 'Bank', color: colors.navy },
    { key: 'cash', label: 'Cash & other', color: colors.green },
    { key: 'savingsAndInvestments', label: 'Savings & investments', color: colors.blue },
    { key: 'otherAssets', label: 'Property & other', color: '#8B5CF6' },
] as const;

export function StepNetWorth({ ctx }: { ctx: StepContext }) {
    const reduced = useReducedMotion();
    useEffect(() => { void ctx.refreshMoney(); /* fresh figures after the steps before */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const money = ctx.money;
    const total = money?.total ?? 0;
    const shown = useCountUp(total, 1400, !!money && !reduced);

    const parts = money ? SEGMENTS.map((s) => ({ ...s, value: money.breakdown[s.key] })).filter((p) => p.value > 0) : [];
    const owned = parts.reduce((a, p) => a + p.value, 0);
    const debts = money?.breakdown.debts ?? 0;

    const size = 200, stroke = 22, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    let offset = 0;

    const subtitle = !money ? ctx.def.subtitle
        : total > 0 ? 'This is your starting point. Next, let’s plan where it goes.'
        : owned === 0 ? 'You haven’t added anything yet. That’s fine: your net worth fills in as your money comes in.'
        : 'What you owe is more than what you own right now. A plan is how that changes, and it starts here.';

    return (
        <PersonalStepShell def={{ ...ctx.def, subtitle }} progress={ctx.progress} onBack={ctx.onBack} onContinue={() => ctx.done({ total })} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Done' : 'Continue'}>
            {!money ? <ActivityIndicator color={colors.blue} /> : (
                <View style={{ alignItems: 'center' }}>
                    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
                            {owned > 0 && parts.map((p) => {
                                const len = (p.value / owned) * c;
                                const el = (
                                    <Circle key={p.key} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={stroke} fill="none"
                                        strokeDasharray={`${Math.max(0, parts.length > 1 ? len - 2 : len)} ${c}`} strokeDashoffset={-offset} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
                                );
                                offset += len;
                                return el;
                            })}
                        </Svg>
                        <Text style={styles.caption}>Net worth</Text>
                        <Text style={[styles.total, total < 0 && { color: colors.danger }]} accessibilityLabel={`Net worth ${fmtK(total)}`} adjustsFontSizeToFit numberOfLines={1}>
                            {total < 0 ? '− ' : ''}{fmtK(Math.abs(shown))}
                        </Text>
                    </View>

                    <View style={styles.legend}>
                        {parts.map((p) => (
                            <View key={p.key} style={styles.legendRow}>
                                <View style={[styles.dot, { backgroundColor: p.color }]} />
                                <Text style={styles.legendLabel}>{p.label}</Text>
                                <Text style={styles.legendValue}>{fmtK(p.value)}</Text>
                            </View>
                        ))}
                        {debts > 0 && (
                            <View style={styles.legendRow}>
                                <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                                <Text style={styles.legendLabel}>What you owe</Text>
                                <Text style={[styles.legendValue, { color: colors.danger }]}>− {fmtK(debts)}</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    caption: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    total: { fontFamily: fonts.display, fontSize: 28, color: colors.text, maxWidth: 150, textAlign: 'center' },
    legend: { alignSelf: 'stretch', marginTop: 28, padding: 16, borderRadius: radius.md, backgroundColor: colors.canvas, gap: 10 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    legendValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
});
