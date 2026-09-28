import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voucherService, formatKwacha, formatShortDate, canManageVouchers } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

export default function VoucherDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { userRole } = useAuth();
    const qc = useQueryClient();

    const { data: voucher, isLoading, isError, error } = useQuery({
        queryKey: ['vouchers', id],
        queryFn: () => voucherService.getById(String(id)),
        enabled: !!id,
    });

    const post = useMutation({
        mutationFn: () => voucherService.post(String(id)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vouchers'] });
            Alert.alert('Voucher posted', 'The journal entries are now in the ledger.');
        },
        onError: (e: Error) => Alert.alert('Could not post', e.message),
    });

    const lines = voucher?.voucher_lines ?? [];
    const balanced = voucher ? Number(voucher.total_debit) === Number(voucher.total_credit) : false;
    const canPost = !!voucher && voucher.status === 'DRAFT' && canManageVouchers(userRole);

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Voucher" />

            {isLoading && <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>}
            {isError && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load this voucher</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                </View>
            )}

            {voucher && (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.ref}>{voucher.reference_number || 'Draft voucher'}</Text>
                        <Text style={styles.desc}>{voucher.requisitions?.description || '—'}</Text>
                        <View style={styles.totals}>
                            <View>
                                <Text style={styles.totalLabel}>Debit</Text>
                                <Text style={styles.totalValue}>{formatKwacha(voucher.total_debit)}</Text>
                            </View>
                            <View>
                                <Text style={styles.totalLabel}>Credit</Text>
                                <Text style={styles.totalValue}>{formatKwacha(voucher.total_credit)}</Text>
                            </View>
                        </View>
                        {/* A voucher that doesn't balance must never be posted; the
                            server rejects it, but saying so here avoids a pointless
                            round-trip and an error the cashier can't act on. */}
                        {!balanced && (
                            <Text style={styles.unbalanced}>
                                Debits and credits don’t match — this voucher can’t be posted.
                            </Text>
                        )}
                        <Text style={styles.meta}>
                            {voucher.status} · raised {formatShortDate(voucher.created_at)}
                            {voucher.posted_at ? ` · posted ${formatShortDate(voucher.posted_at)}` : ''}
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Journal lines ({lines.length})</Text>
                        {lines.map((l) => (
                            <View key={l.id} style={styles.line}>
                                <View style={styles.lineMain}>
                                    <Text style={styles.lineAccount} numberOfLines={1}>
                                        {l.accounts ? `${l.accounts.code} · ${l.accounts.name}` : 'Unmapped account'}
                                    </Text>
                                    <Text style={styles.lineDesc} numberOfLines={1}>{l.description}</Text>
                                </View>
                                <View style={styles.lineAmounts}>
                                    <Text style={styles.lineDebit}>
                                        {Number(l.debit) > 0 ? formatKwacha(l.debit) : ''}
                                    </Text>
                                    <Text style={styles.lineCredit}>
                                        {Number(l.credit) > 0 ? formatKwacha(l.credit) : ''}
                                    </Text>
                                </View>
                            </View>
                        ))}
                        {lines.length === 0 && <Text style={styles.emptyText}>No journal lines on this voucher.</Text>}
                    </View>

                    {canPost && (
                        <Pressable
                            style={({ pressed }) => [
                                styles.btn, !balanced && styles.disabled, pressed && balanced && { opacity: 0.85 },
                            ]}
                            onPress={() => post.mutate()}
                            disabled={!balanced || post.isPending}
                        >
                            {post.isPending
                                ? <ActivityIndicator color="#FFFFFF" />
                                : <Text style={styles.btnText}>Post to ledger</Text>}
                        </Pressable>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    ref: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    desc: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
    totals: { flexDirection: 'row', gap: 32, marginTop: 16 },
    totalLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, letterSpacing: 0.5 },
    totalValue: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy, marginTop: 2 },
    unbalanced: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 12, lineHeight: 17 },
    meta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 12 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 10 },
    line: {
        flexDirection: 'row', gap: 12, paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    lineMain: { flex: 1, gap: 2 },
    lineAccount: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    lineDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    lineAmounts: { alignItems: 'flex-end', minWidth: 96, gap: 2 },
    lineDebit: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    lineCredit: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.positiveInk },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
    btn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    disabled: { opacity: 0.4 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    errorCard: {
        margin: 20, backgroundColor: colors.surface, borderRadius: radius.md,
        padding: 16, borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
});
