import { useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown } from 'lucide-react-native';
import { cashbookService, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Mode = 'BETWEEN' | 'INTO';

const CASH_SOURCES = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK', label: 'Bank' },
    { value: 'AIRTEL_MONEY', label: 'Mobile Money' },
] as const;

/**
 * Two genuinely different movements share this screen, as they do on web:
 *   BETWEEN — sub-wallet to sub-wallet, an internal reallocation
 *   INTO    — physical cash/bank/momo into a MoneyWise wallet, which brings new
 *             money onto the ledger
 * They hit different endpoints and have different validity rules, so the mode is
 * explicit rather than inferred from which fields happen to be filled.
 */
export default function TransferScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [mode, setMode] = useState<Mode>('BETWEEN');
    const [sourceId, setSourceId] = useState<string | null>(null);
    const [destId, setDestId] = useState<string | null>(null);
    const [sourceType, setSourceType] = useState<'CASH' | 'BANK' | 'AIRTEL_MONEY'>('CASH');
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['cashbook-entries', 'overview'],
        queryFn: () => cashbookService.getOverview(),
    });
    const wallets: any[] = data?.wallets ?? [];

    const source = wallets.find((w) => String(w.id) === sourceId);
    const numericAmount = Number(amount) || 0;

    const overdrawn =
        mode === 'BETWEEN' && !!source && numericAmount > Number(source.balance ?? 0);

    const valid = useMemo(() => {
        if (numericAmount <= 0) return false;
        if (mode === 'BETWEEN') {
            return !!sourceId && !!destId && sourceId !== destId && !overdrawn;
        }
        return reference.trim().length > 0;
    }, [mode, numericAmount, sourceId, destId, reference, overdrawn]);

    const run = useMutation({
        mutationFn: () =>
            mode === 'BETWEEN'
                ? cashbookService.transfer(sourceId!, destId!, numericAmount, reference.trim() || undefined)
                : cashbookService.transferToWallet(numericAmount, reference.trim(), sourceType),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Transfer failed', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Transfer" />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.segment}>
                    {([['BETWEEN', 'Between wallets'], ['INTO', 'Cash into wallet']] as const).map(([m, label]) => (
                        <Pressable
                            key={m}
                            onPress={() => setMode(m)}
                            style={[styles.segmentBtn, mode === m && styles.segmentBtnActive]}
                        >
                            <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>{label}</Text>
                        </Pressable>
                    ))}
                </View>

                <View style={styles.card}>
                    <Text style={styles.label}>Amount (K)</Text>
                    <TextInput
                        style={[styles.input, styles.amountInput, overdrawn && styles.inputError]}
                        value={amount}
                        onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textFaint}
                    />
                    {overdrawn && (
                        <Text style={styles.error}>
                            {source?.name} only holds {formatKwacha(Number(source?.balance ?? 0))}.
                        </Text>
                    )}
                </View>

                {isLoading && <ActivityIndicator color={colors.blue} style={{ marginTop: 12 }} />}

                {mode === 'BETWEEN' ? (
                    <View style={styles.card}>
                        <Text style={styles.label}>From</Text>
                        <WalletPicker
                            wallets={wallets}
                            selectedId={sourceId}
                            onSelect={setSourceId}
                            excludeId={destId}
                        />

                        <View style={styles.arrowRow}>
                            <ArrowDown size={18} color={colors.textFaint} />
                        </View>

                        <Text style={styles.label}>To</Text>
                        <WalletPicker
                            wallets={wallets}
                            selectedId={destId}
                            onSelect={setDestId}
                            excludeId={sourceId}
                        />

                        {wallets.length < 2 && !isLoading && (
                            <Text style={styles.hint}>
                                You need at least two wallets to move funds between them.
                            </Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.label}>Coming from</Text>
                        <View style={styles.chips}>
                            {CASH_SOURCES.map((s) => (
                                <Pressable
                                    key={s.value}
                                    onPress={() => setSourceType(s.value)}
                                    style={[styles.chip, sourceType === s.value && styles.chipActive]}
                                >
                                    <Text style={[styles.chipText, sourceType === s.value && styles.chipTextActive]}>
                                        {s.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.label}>
                        Reference {mode === 'INTO' ? '' : '(optional)'}
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={reference}
                        onChangeText={setReference}
                        placeholder={mode === 'INTO' ? 'e.g. Deposit slip 4471' : 'What is this for?'}
                        placeholderTextColor={colors.textFaint}
                    />
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <Pressable
                    style={({ pressed }) => [styles.submit, !valid && styles.disabled, pressed && valid && { opacity: 0.85 }]}
                    onPress={() => run.mutate()}
                    disabled={!valid || run.isPending}
                >
                    {run.isPending
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.submitText}>
                            Transfer {numericAmount > 0 ? formatKwacha(numericAmount) : ''}
                        </Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const WalletPicker: React.FC<{
    wallets: any[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    excludeId?: string | null;
}> = ({ wallets, selectedId, onSelect, excludeId }) => (
    <View style={styles.walletList}>
        {wallets
            .filter((w) => String(w.id) !== excludeId)
            .map((w) => {
                const active = String(w.id) === selectedId;
                return (
                    <Pressable
                        key={w.id}
                        onPress={() => onSelect(String(w.id))}
                        style={[styles.walletOption, active && styles.walletOptionActive]}
                    >
                        <Text style={[styles.walletName, active && styles.walletNameActive]} numberOfLines={1}>
                            {w.name}
                        </Text>
                        <Text style={[styles.walletBalance, active && styles.walletNameActive]}>
                            {formatKwacha(Number(w.balance ?? 0))}
                        </Text>
                    </Pressable>
                );
            })}
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 32 },
    segment: {
        flexDirection: 'row', padding: 4, backgroundColor: colors.surface,
        borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: colors.tabActiveBg },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.blue },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 10, lineHeight: 17 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    inputError: { borderColor: colors.danger },
    amountInput: { fontFamily: fonts.bodyBold, fontSize: 24 },
    error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 8 },
    arrowRow: { alignItems: 'center', paddingVertical: 12 },
    walletList: { gap: 8 },
    walletOption: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        paddingHorizontal: 14, paddingVertical: 13, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    walletOptionActive: { borderColor: colors.blue, backgroundColor: colors.tabActiveBg },
    walletName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    walletNameActive: { color: colors.blue },
    walletBalance: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    submit: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    disabled: { opacity: 0.4 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
