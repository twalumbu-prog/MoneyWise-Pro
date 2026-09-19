import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cashbookService, providersFor } from 'core';
import type { ExternalProviderType } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Kind = 'MONEYWISE' | 'EXTERNAL';

/**
 * Creates either a MoneyWise sub-wallet or a linked external account.
 *
 * They are separate concepts: a MoneyWise wallet holds money the platform
 * controls, an external account is a mirror of a bank or mobile-money balance
 * that exists to be reconciled against statements. Different endpoints, so the
 * choice is explicit.
 */
export default function NewWalletScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const params = useLocalSearchParams<{ kind?: string }>();

    const [kind, setKind] = useState<Kind>(params.kind === 'EXTERNAL' ? 'EXTERNAL' : 'MONEYWISE');
    const [name, setName] = useState('');
    const [providerType, setProviderType] = useState<ExternalProviderType>('BANK');
    const [providerCode, setProviderCode] = useState<string | null>(null);

    const providers = providersFor(providerType);
    const providerName = providers.find((p) => p.code === providerCode)?.name;

    const valid =
        name.trim().length > 0 &&
        (kind === 'MONEYWISE' || providerType === 'CUSTOM' || !!providerCode);

    const create = useMutation({
        mutationFn: () =>
            kind === 'MONEYWISE'
                ? cashbookService.createWallet(name.trim())
                : cashbookService.createExternalWallet({
                      name: name.trim(),
                      providerType,
                      providerName: providerName ?? undefined,
                  }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Could not create it', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Add Wallet" />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.segment}>
                    {([['MONEYWISE', 'MoneyWise wallet'], ['EXTERNAL', 'External account']] as const).map(([k, label]) => (
                        <Pressable
                            key={k}
                            onPress={() => setKind(k)}
                            style={[styles.segmentBtn, kind === k && styles.segmentBtnActive]}
                        >
                            <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>{label}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={styles.blurb}>
                    {kind === 'MONEYWISE'
                        ? 'A sub-wallet lets you ring-fence funds inside MoneyWise — per branch, project or budget line.'
                        : 'An external account mirrors a bank or mobile-money balance so you can reconcile it against imported statements.'}
                </Text>

                <View style={styles.card}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder={kind === 'MONEYWISE' ? 'e.g. Kitwe Branch' : 'e.g. Zanaco Operations'}
                        placeholderTextColor={colors.textFaint}
                    />
                </View>

                {kind === 'EXTERNAL' && (
                    <View style={styles.card}>
                        <Text style={styles.label}>Account type</Text>
                        <View style={styles.chips}>
                            {(['BANK', 'MOBILE_MONEY', 'CUSTOM'] as ExternalProviderType[]).map((t) => (
                                <Pressable
                                    key={t}
                                    onPress={() => { setProviderType(t); setProviderCode(null); }}
                                    style={[styles.chip, providerType === t && styles.chipActive]}
                                >
                                    <Text style={[styles.chipText, providerType === t && styles.chipTextActive]}>
                                        {t === 'MOBILE_MONEY' ? 'Mobile Money' : t === 'BANK' ? 'Bank' : 'Other'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {providers.length > 0 && (
                            <>
                                <Text style={[styles.label, styles.spaced]}>Provider</Text>
                                <View style={styles.chips}>
                                    {providers.map((p) => (
                                        <Pressable
                                            key={p.code}
                                            onPress={() => setProviderCode(p.code)}
                                            style={[styles.chip, providerCode === p.code && styles.chipActive]}
                                        >
                                            <Text style={[styles.chipText, providerCode === p.code && styles.chipTextActive]}>
                                                {p.name}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </>
                        )}
                    </View>
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <Pressable
                    style={({ pressed }) => [styles.submit, !valid && styles.disabled, pressed && valid && { opacity: 0.85 }]}
                    onPress={() => create.mutate()}
                    disabled={!valid || create.isPending}
                >
                    {create.isPending
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.submitText}>
                            {kind === 'MONEYWISE' ? 'Create wallet' : 'Link account'}
                        </Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

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
    blurb: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, paddingHorizontal: 4 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    spaced: { marginTop: 18 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
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
