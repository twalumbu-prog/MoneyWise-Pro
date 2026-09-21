import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { voucherService, formatKwacha, groupByDate } from 'core';
import type { Voucher } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

export default function VouchersScreen() {
    const router = useRouter();
    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['vouchers'],
        queryFn: () => voucherService.getAll(),
    });

    const vouchers: Voucher[] = Array.isArray(data) ? data : [];
    const groups = groupByDate(vouchers, (v) => v.created_at, 'desc');

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Vouchers" />

            <FlatList
                data={groups}
                keyExtractor={(g) => g.dateKey}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.blue} />
                }
                ListHeaderComponent={
                    <>
                        {isLoading && <ActivityIndicator color={colors.blue} style={styles.loading} />}
                        {isError && (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorTitle}>Couldn’t load vouchers</Text>
                                <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                            </View>
                        )}
                    </>
                }
                renderItem={({ item }) => (
                    <View style={styles.dayBlock}>
                        <Text style={styles.dayLabel}>{item.dateLabel}</Text>
                        <View style={styles.dayCard}>
                            {item.items.map((v, i) => (
                                <View key={v.id}>
                                    <Pressable
                                        onPress={() => router.push(`/vouchers/${v.id}`)}
                                        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                                    >
                                        <View style={styles.rowMain}>
                                            <Text style={styles.ref}>{v.reference_number || 'Draft voucher'}</Text>
                                            <Text style={styles.desc} numberOfLines={1}>
                                                {v.requisitions?.description || '—'}
                                            </Text>
                                        </View>
                                        <View style={styles.rowRight}>
                                            <Text style={styles.amount}>{formatKwacha(v.total_debit)}</Text>
                                            <View style={[styles.pill, v.status === 'POSTED' && styles.pillPosted]}>
                                                <Text style={[styles.pillText, v.status === 'POSTED' && styles.pillTextPosted]}>
                                                    {v.status}
                                                </Text>
                                            </View>
                                        </View>
                                    </Pressable>
                                    {i < item.items.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    !isLoading && !isError ? (
                        <View style={styles.empty}><Text style={styles.emptyText}>No vouchers yet.</Text></View>
                    ) : undefined
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    list: { padding: 20, paddingBottom: 60 },
    loading: { marginVertical: 24 },
    dayBlock: { marginBottom: 12 },
    dayLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#000000', paddingHorizontal: 6, marginBottom: 8 },
    dayCard: {
        backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 18,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    rowMain: { flex: 1, gap: 3 },
    ref: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    desc: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    rowRight: { alignItems: 'flex-end', gap: 5 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    pill: {
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
        backgroundColor: colors.canvasAlt,
    },
    pillPosted: { backgroundColor: '#E4FAF1' },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.6, color: colors.textMuted },
    pillTextPosted: { color: colors.positiveInk },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    empty: { paddingVertical: 64, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    errorCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.danger, marginBottom: 12,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
});
