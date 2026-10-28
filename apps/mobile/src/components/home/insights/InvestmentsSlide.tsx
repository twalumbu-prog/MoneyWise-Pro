import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight, Minus, X, TrendingUp } from 'lucide-react-native';
import { investmentService, formatKwacha, type PortfolioHolding } from 'core';
import { colors, fonts, radius } from '../../../theme/tokens';

export const INVESTMENTS_KEY = ['home-investments'] as const;

const tone = (pct: number) => (pct > 0.005 ? { color: colors.positiveInk, bg: '#E6F8F0', Icon: ArrowUpRight } : pct < -0.005 ? { color: colors.danger, bg: '#FDECEC', Icon: ArrowDownRight } : { color: colors.textMuted, bg: colors.canvasAlt, Icon: Minus });
const pctText = (pct: number) => `${pct > 0.005 ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 10 ? 1 : 2)}%`;

const Logo: React.FC<{ h: PortfolioHolding }> = ({ h }) => h.logoUrl
    ? <Image source={{ uri: h.logoUrl }} style={styles.logo} resizeMode="cover" />
    : <View style={[styles.logo, styles.logoFallback]}><TrendingUp size={14} color={colors.blue} /></View>;

/**
 * Slide 5 — Investments (only shown when the person has invested): what each investment is worth now and whether it has grown,
 * shrunk or stayed the same. There is no live price feed from the companies, so tapping one lets the person record today's value.
 */
export const InvestmentsSlide: React.FC<{ holdings: PortfolioHolding[]; totals: { currentValue: number; gainPct: number } }> = ({ holdings, totals }) => {
    const [editing, setEditing] = useState<PortfolioHolding | null>(null);
    const total = tone(totals.gainPct);

    return (
        <View style={{ gap: 10 }}>
            <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total value</Text>
                <Text style={styles.totalValue} numberOfLines={1}>{formatKwacha(totals.currentValue)}</Text>
                <View style={[styles.pill, { backgroundColor: total.bg }]}><total.Icon size={12} color={total.color} /><Text style={[styles.pillText, { color: total.color }]}>{pctText(totals.gainPct)}</Text></View>
            </View>
            {holdings.slice(0, 3).map((h) => {
                const t = tone(h.gainPct);
                return (
                    <Pressable key={h.targetId} onPress={() => setEditing(h)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${h.name}, ${formatKwacha(h.currentValue)}, ${pctText(h.gainPct)}. Update value`}>
                        <Logo h={h} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.name} numberOfLines={1}>{h.name}</Text>
                            <Text style={styles.sub} numberOfLines={1}>{h.valued ? (h.gain === 0 ? 'No change' : `${h.gain > 0 ? '+' : '−'}${formatKwacha(Math.abs(h.gain))}`) : 'Tap to add today’s value'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Text style={styles.value} numberOfLines={1}>{formatKwacha(h.currentValue)}</Text>
                            <View style={[styles.pill, { backgroundColor: t.bg }]}><t.Icon size={11} color={t.color} /><Text style={[styles.pillText, { color: t.color }]}>{pctText(h.gainPct)}</Text></View>
                        </View>
                    </Pressable>
                );
            })}
            {holdings.length > 3 && <Text style={styles.more}>+{holdings.length - 3} more</Text>}
            <ValueSheet holding={editing} onClose={() => setEditing(null)} />
        </View>
    );
};

const ValueSheet: React.FC<{ holding: PortfolioHolding | null; onClose: () => void }> = ({ holding, onClose }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => { setValue(''); setError(null); onClose(); };
    const save = async () => {
        const n = Number(value.replace(/,/g, ''));
        if (!holding || !Number.isFinite(n) || n < 0 || value.trim() === '') { setError('Enter what it is worth today, in kwacha.'); return; }
        setBusy(true); setError(null);
        try {
            await investmentService.setHoldingValue(holding.targetId, n);
            await qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
            close();
        } catch (e: any) { setError(e?.message ?? 'Could not save the value.'); } finally { setBusy(false); }
    };

    return (
        <Modal visible={!!holding} transparent animationType="slide" onRequestClose={close}>
            <Pressable style={styles.backdrop} onPress={close} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                    <View style={styles.handle} />
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle} numberOfLines={1}>{holding?.name}</Text>
                        <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                    </View>
                    <View style={{ padding: 24, gap: 10 }}>
                        <Text style={styles.sheetLead}>You’ve put in {formatKwacha(holding?.invested ?? 0)}. What is it worth today? Check your statement from {holding?.name}, then enter the value here.</Text>
                        <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder={holding ? String(holding.currentValue) : '0'} placeholderTextColor={colors.textFaint} style={styles.input} autoFocus onSubmitEditing={save} returnKeyType="done" />
                        {!!error && <Text style={styles.error}>{error}</Text>}
                        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [styles.saveBtn, (pressed || busy) && { opacity: 0.8 }]}>
                            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save value</Text>}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    totalLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    totalValue: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: '#000000' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' },
    logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tabActiveBg },
    name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    sub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    value: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    more: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    kav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    sheetTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    sheetLead: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textMuted, lineHeight: 19 },
    input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, textAlign: 'center' },
    error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, textAlign: 'center' },
    saveBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.blue, marginTop: 4 },
    saveText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: '#FFFFFF' },
});
