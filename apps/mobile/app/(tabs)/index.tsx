import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { requisitionService } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Inbox — the first screen fed by real data through `packages/core`. Proves the
 * whole loop end to end: native adapter -> core service -> production API ->
 * the same rows the web app renders.
 *
 * The full Inbox (filters, detail overlay, the requisition wizard) lands in P1;
 * this is the list itself.
 */
export default function InboxScreen() {
    const insets = useSafeAreaInsets();
    const { organizationName } = useAuth();

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['requisitions'],
        queryFn: () => requisitionService.getAll(),
    });

    const items: any[] = Array.isArray(data) ? data : [];

    return (
        <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.title}>Inbox</Text>
            {!!organizationName && <Text style={styles.org}>{organizationName}</Text>}

            {isLoading && (
                <View style={styles.centre}>
                    <ActivityIndicator color={colors.blue} />
                </View>
            )}

            {isError && !isLoading && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load requests</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                    <Text style={styles.errorHint}>Pull down to try again.</Text>
                </View>
            )}

            <FlatList
                data={items}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={() => { void refetch(); }}
                        tintColor={colors.blue}
                    />
                }
                ListEmptyComponent={
                    !isLoading && !isError ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No requests yet.</Text>
                        </View>
                    ) : undefined
                }
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                            {item.description || 'Untitled request'}
                        </Text>
                        <View style={styles.cardMeta}>
                            <Text style={styles.amount}>
                                K{Number(item.actual_total ?? item.estimated_total ?? 0).toLocaleString()}
                            </Text>
                            <Text style={styles.status}>{item.status}</Text>
                        </View>
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 20 },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.navy },
    org: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
    centre: { paddingVertical: 48, alignItems: 'center' },
    list: { paddingBottom: 24, gap: 10 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border,
    },
    cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text, lineHeight: 21 },
    cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    status: {
        fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8,
        color: colors.textMuted, backgroundColor: colors.canvasAlt,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden',
    },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    errorCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.danger, marginBottom: 12,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    errorHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 8 },
});
