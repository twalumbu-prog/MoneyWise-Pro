import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedCheck } from '../../auth/AnimatedCheck';
import { PersonalStepShell } from './PersonalStepShell';
import { fmtK } from './moneyUi';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Not a saved step: a short "you've made good progress" page between the setup and the Grow plan, so the next part
 * (setting a wealth target) feels like the start of something rather than one more form.
 */
export function StepCheer({ ctx }: { ctx: StepContext }) {
    const accounts = ctx.money?.accounts ?? [];
    const total = accounts.reduce((a, x) => a + x.balance, 0);
    const bills = ctx.drafts.billsMonthly;
    const [ticked, setTicked] = useState(false);
    useEffect(() => { const t = setTimeout(() => setTicked(true), 450); return () => clearTimeout(t); }, []);

    const facts: { label: string; value: string }[] = [];
    if (accounts.length) facts.push({ label: accounts.length === 1 ? 'Account added' : 'Accounts added', value: String(accounts.length) });
    if (accounts.length) facts.push({ label: 'Money you’re tracking', value: fmtK(total) });
    if (bills) facts.push({ label: 'Bills you’ll never miss', value: `${fmtK(bills)} / month` });

    return (
        <PersonalStepShell
            def={{ ...ctx.def, chapter: ctx.def.chapter, title: 'You’re off to a great start', subtitle: 'The hard part is done. Now let’s set you up to start growing your wealth.' }}
            progress={ctx.progress} onBack={ctx.onBack} onContinue={() => ctx.leaveCheer?.()}
            continueLabel="Let’s grow my wealth"
        >
            <View style={styles.badge}><AnimatedCheck checked={ticked} size={64} /></View>
            {facts.length > 0 && (
                <View style={styles.card}>
                    {facts.map((f, i) => (
                        <View key={f.label} style={[styles.row, i > 0 && styles.rowBorder]}>
                            <Text style={styles.label}>{f.label}</Text>
                            <Text style={styles.value}>{f.value}</Text>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.note}>Next: pick a target for your net worth and see how long it takes to get there.</Text>
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    badge: { alignSelf: 'flex-start', marginBottom: 24 },
    card: { borderRadius: radius.lg, borderWidth: 1, borderColor: '#ECEDF1', backgroundColor: '#FFFFFF', paddingHorizontal: 16, shadowColor: '#1F2547', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 54 },
    rowBorder: { borderTopWidth: 1, borderColor: '#F0F1F5' },
    label: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
    value: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 20 },
});
