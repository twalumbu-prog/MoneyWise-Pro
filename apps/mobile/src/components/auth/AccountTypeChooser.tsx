import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Building2, Check, X, Minus } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * "MoneyWise Personal or Pro" (docs/personal-onboarding-plan.md, step 2): two cards with what each is for, and a
 * Compare sheet with the differences side by side. Used before email sign-up and after a first Google/Apple sign-in.
 */
export type AccountType = 'INDIVIDUAL' | 'BUSINESS';

const OPTIONS: { value: AccountType; title: string; tagline: string; bullets: string[]; Icon: typeof User }[] = [
    {
        value: 'INDIVIDUAL', title: 'MoneyWise Personal', tagline: 'Your own money', Icon: User,
        bullets: ['Mobile money, bank and cash in one place', 'Transactions captured from SMS and email', 'Bills, savings goals and your net worth'],
    },
    {
        value: 'BUSINESS', title: 'MoneyWise Pro', tagline: 'Run a business', Icon: Building2,
        bullets: ['Sales, payment links and products', 'Payroll, requests and approvals for a team', 'Accounting and reports for your books'],
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
            {OPTIONS.map(({ value: v, title, tagline, bullets, Icon }) => {
                const on = value === v;
                const have = owned?.includes(v);
                return (
                    <Pressable
                        key={v}
                        disabled={have}
                        onPress={() => onChange(v)}
                        style={[styles.card, on && styles.cardOn, have && { opacity: 0.55 }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: have }}
                        accessibilityLabel={`${title}. ${tagline}. ${bullets.join('. ')}`}
                    >
                        <View style={styles.cardHead}>
                            <View style={[styles.iconWrap, on && { backgroundColor: colors.blue }]}>
                                <Icon size={20} color={on ? '#FFFFFF' : colors.blue} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{title}</Text>
                                <Text style={styles.tagline}>{have ? 'You have this' : tagline}</Text>
                            </View>
                            <View style={[styles.radio, on && styles.radioOn]}>{on && <Check size={14} color="#FFFFFF" />}</View>
                        </View>
                        {bullets.map((b) => (
                            <View key={b} style={styles.bulletRow}>
                                <View style={styles.bulletDot} />
                                <Text style={styles.bullet}>{b}</Text>
                            </View>
                        ))}
                    </Pressable>
                );
            })}
            <Pressable onPress={() => setCompareOpen(true)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }} accessibilityRole="button">
                <Text style={styles.compare}>Compare Personal and Pro</Text>
            </Pressable>

            <Modal visible={compareOpen} transparent animationType="slide" onRequestClose={() => setCompareOpen(false)}>
                <Pressable style={styles.scrim} onPress={() => setCompareOpen(false)} accessibilityLabel="Close comparison" />
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
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong, gap: 6 },
    cardOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    iconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    tagline: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 1 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    radioOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 54 },
    bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 7 },
    bullet: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
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
