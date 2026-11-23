import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, AlertCircle } from 'lucide-react-native';
import { BankAvatar } from '../../BankAvatar';
import { MtnLogo, AirtelLogo, ZamtelLogo } from './ProviderLogos';
import { getLocalLogoKey, getBankColor, getBankInitials } from '../../../data/bankLogos';
import { colors, fonts, radius } from '../../../theme/tokens';

/** Shared bits for the "Your money" steps: money formatting and input, a bottom sheet, provider logos. */

export const fmtK = (n: number) => `K ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "1320.5" ↔ "1,320.50" as typed. Keeps what the person types readable without fighting the cursor. */
export const formatTyped = (s: string) => {
    const clean = s.replace(/[^0-9.]/g, '');
    const [whole, ...rest] = clean.split('.');
    const dec = rest.length ? `.${rest.join('').slice(0, 2)}` : '';
    return (whole ? Number(whole).toLocaleString('en-US') : rest.length ? '0' : '') + dec;
};
export const parseTyped = (s: string) => Number(s.replace(/,/g, '')) || 0;

export function MoneyField({ label, value, onChange, error, autoFocus, hint }: {
    label: string; value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean; hint?: string;
}) {
    return (
        <View>
            <Text style={styles.label}>{label}</Text>
            <View style={[styles.moneyWrap, !!error && { borderColor: colors.danger }]}>
                <Text style={styles.moneyPrefix}>K</Text>
                <TextInput
                    value={value}
                    onChangeText={(t) => onChange(formatTyped(t))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textFaint}
                    autoFocus={autoFocus}
                    accessibilityLabel={label}
                    style={styles.moneyInput}
                />
            </View>
            {!!hint && !error && <Text style={styles.hint}>{hint}</Text>}
            {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

export function Sheet({ visible, title, onClose, children, primary, secondary, busy, error }: {
    visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
    primary?: { label: string; onPress: () => void; disabled?: boolean };
    secondary?: { label: string; onPress: () => void; danger?: boolean };
    busy?: boolean; error?: string | null;
}) {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
                        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><X size={22} color={colors.text} /></Pressable>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
                        {children}
                        {!!error && (
                            <View style={styles.errorBox}><AlertCircle size={18} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text></View>
                        )}
                    </ScrollView>
                    {(primary || secondary) && <View style={styles.sheetFooter}>
                        {secondary && (
                            <Pressable onPress={secondary.onPress} disabled={busy} style={[styles.btn, styles.btnSecondary]} accessibilityRole="button">
                                <Text style={[styles.btnSecondaryText, secondary.danger && { color: colors.danger }]}>{secondary.label}</Text>
                            </Pressable>
                        )}
                        {primary && (
                            <Pressable onPress={primary.onPress} disabled={busy || primary.disabled} style={[styles.btn, styles.btnPrimary, (busy || primary.disabled) && { opacity: 0.3 }]} accessibilityRole="button">
                                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>{primary.label}</Text>}
                            </Pressable>
                        )}
                    </View>}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export function ProviderLogo({ type, code, name, size = 40 }: { type: string; code: string | null; name: string; size?: number }) {
    if (type === 'MOBILE_MONEY' && code === 'MTN') return <MtnLogo size={size} />;
    if (type === 'MOBILE_MONEY' && code === 'AIRTEL') return <AirtelLogo size={size} />;
    if (type === 'MOBILE_MONEY' && code === 'ZAMTEL') return <ZamtelLogo size={size} />;
    if (type === 'BANK') {
        // Bundled logo when we have one; otherwise coloured initials straight away (the remote logo lookups can come
        // back blank, which looks broken in a grid of choices).
        if (getLocalLogoKey(name)) return <BankAvatar name={name} size={size} />;
        return (
            <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: getBankColor(name), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.3, color: '#FFFFFF' }}>{getBankInitials(name)}</Text>
            </View>
        );
    }
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D7F7E8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.45 }}>💵</Text>
        </View>
    );
}

/** Animated count-up for the net worth reveal (plain JS timer; stops at the exact figure). */
export function useCountUp(target: number, ms = 1200, enabled = true) {
    const [v, setV] = useState(enabled ? 0 : target);
    useEffect(() => {
        if (!enabled) { setV(target); return; }
        const start = Date.now();
        let raf: ReturnType<typeof setTimeout>;
        const tick = () => {
            const p = Math.min(1, (Date.now() - start) / ms);
            const eased = 1 - Math.pow(1 - p, 3);
            setV(target * eased);
            if (p < 1) raf = setTimeout(tick, 16);
        };
        tick();
        return () => clearTimeout(raf);
    }, [target, ms, enabled]);
    return v;
}

export const moneyStyles = StyleSheet.create({
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted, marginTop: 24, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
    rowName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    rowAmount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 },
    totalLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textMuted },
    totalValue: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
    segment: { flexDirection: 'row', backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, padding: 4 },
    segBtn: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    segBtnOn: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    segTextOn: { color: colors.text, fontFamily: fonts.bodyBold },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    tile: { width: '31%', minHeight: 96, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8, backgroundColor: colors.surface },
    tileOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    tileText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, textAlign: 'center' },
    badge: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.positive, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#FFFFFF' },
    empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, marginTop: 4 },
});

const styles = StyleSheet.create({
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    moneyWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderBottomWidth: 1, borderColor: '#D9DCE3', gap: 8 },
    moneyPrefix: { fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.textMuted },
    moneyInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text, paddingVertical: 10 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 6 },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 6 },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 22, paddingTop: 20, maxHeight: '88%' },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, flex: 1, paddingRight: 12 },
    sheetFooter: { flexDirection: 'row', gap: 12, paddingTop: 12 },
    btn: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    btnPrimary: { backgroundColor: '#000000' },
    btnPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
    btnSecondary: { backgroundColor: colors.chipActiveBg },
    btnSecondaryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: radius.sm, padding: 12 },
    errorText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: '#B91C1C' },
});
