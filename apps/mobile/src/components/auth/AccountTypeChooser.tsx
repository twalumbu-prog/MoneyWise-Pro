import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X, Minus } from 'lucide-react-native';
import { AnimatedCheck } from './AnimatedCheck';
import { hapticTick } from '../../lib/haptics';
import { PersonalArt, ProArt } from './AccountIllustrations';
import { colors, fonts, radius } from '../../theme/tokens';
import { SheetModal } from '../SheetModal';

/**
 * "MoneyWise Personal or Pro" (docs/personal-onboarding-plan.md, step 2): two cards with what each is for, and a
 * Compare sheet with the differences side by side. Used before email sign-up and after a first Google/Apple sign-in.
 */
export type AccountType = 'INDIVIDUAL' | 'BUSINESS';

const OPTIONS: { value: AccountType; title: string; description: string; Art: typeof PersonalArt }[] = [
    {
        value: 'INDIVIDUAL', title: 'MoneyWise Personal', Art: PersonalArt,
        description: 'Track your income, expenses, savings and investments automatically, and watch your net worth grow.',
    },
    {
        value: 'BUSINESS', title: 'MoneyWise Pro', Art: ProArt,
        description: 'Run your business easily, with AI to help. Sell, get paid, invoice, run payroll and keep your books.',
    },
];

const COMPARE: { row: string; personal: boolean; pro: boolean }[] = [
    { row: 'Track mobile money, bank and cash', personal: true, pro: true },
    { row: 'Capture from SMS and Gmail', personal: true, pro: true },
    { row: 'Bills and reminders', personal: true, pro: true },
    { row: 'Savings goals and group savings', personal: true, pro: false },
    { row: 'Net worth and Grow plan', personal: true, pro: false },
    { row: 'Sell with payment links and a store', personal: false, pro: true },
    { row: 'Team members, roles and approvals', personal: false, pro: true },
    { row: 'Payroll', personal: false, pro: true },
    { row: 'Chart of accounts, journals, statements', personal: false, pro: true },
];

export function AccountTypeChooser({ value, onChange, owned }: {
    value: AccountType;
    onChange: (v: AccountType) => void;
    /** Kinds the person already has: shown as "You have this" and not selectable. */
    owned?: AccountType[];
}) {
    const insets = useSafeAreaInsets();
    const [compareOpen, setCompareOpen] = useState(false);
    return (
        <View style={{ gap: 12 }}>
            {OPTIONS.map(({ value: v, title, description, Art }) => {
                const on = value === v;
                const have = owned?.includes(v);
                return (
                    <Pressable
                        key={v}
                        disabled={have}
                        // A light selection tap when a different option is chosen; tapping the one already chosen does nothing.
                        onPress={() => { if (!on) { hapticTick(); onChange(v); } }}
                        style={[styles.card, on && styles.cardOn, have && { opacity: 0.55 }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: have }}
                        accessibilityLabel={`${title}. ${description}`}
                    >
                        <View style={styles.cardHead}>
                            <Art size={64} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{title}</Text>
                                {have && <Text style={styles.tagline}>You have this</Text>}
                                <Text style={styles.description}>{description}</Text>
                            </View>
                            <AnimatedCheck checked={on} />
                        </View>
                    </Pressable>
                );
            })}
            <Pressable onPress={() => setCompareOpen(true)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }} accessibilityRole="button">
                <Text style={styles.compare}>Compare Personal and Pro</Text>
            </Pressable>

            <SheetModal visible={compareOpen} onRequestClose={() => setCompareOpen(false)}>
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle}>Personal or Pro?</Text>
                        <Pressable onPress={() => setCompareOpen(false)} hitSlop={12} accessibilityLabel="Close"><X size={22} color={colors.text} /></Pressable>
                    </View>
                    <View style={styles.tableHead}>
                        <Text style={[styles.th, { flex: 1 }]} />
                        <Text style={styles.th}>Personal</Text>
                        <Text style={styles.th}>Pro</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 420 }}>
                        {COMPARE.map((r) => (
                            <View key={r.row} style={styles.tr}>
                                <Text style={styles.td}>{r.row}</Text>
                                <View style={styles.cell}>{r.personal ? <Check size={18} color={colors.positive} /> : <Minus size={16} color={colors.textFaint} />}</View>
                                <View style={styles.cell}>{r.pro ? <Check size={18} color={colors.positive} /> : <Minus size={16} color={colors.textFaint} />}</View>
                            </View>
                        ))}
                    </ScrollView>
                    <Text style={styles.footnote}>You can add the other one later from Menu, with the same login.</Text>
                </View>
            </SheetModal>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#ECEDF1', gap: 6 },
    // Selected: still white, with a grey outline and a soft drop shadow (no colour fill)
    cardOn: { backgroundColor: '#FFFFFF', borderColor: '#C4C8D2', shadowColor: '#1F2547', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    tagline: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 1 },
    description: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: '#6B7280', marginTop: 3 },
    compare: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 22 },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
    tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.border },
    th: { width: 72, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    tr: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderColor: colors.border },
    td: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingRight: 8 },
    cell: { width: 72, alignItems: 'center' },
    footnote: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 14 },
});
