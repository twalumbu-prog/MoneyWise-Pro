import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { requisitionService, getStatusConfig, groupByDate } from 'core';
import { RequisitionRow, type RequisitionRowData } from './requisitions/RequisitionRow';
import { colors, fonts, radius } from '../theme/tokens';

/**
 * Shared work-queue list. Approvals and Disbursements are the same list with a
 * different status filter and a different empty message, so they share one
 * implementation rather than two near-identical screens.
 */
export const RequisitionQueue: React.FC<{
    statuses: string[];
    emptyText: string;
}> = ({ statuses, emptyText }) => {
    const router = useRouter();

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['requisitions'],
        queryFn: () => requisitionService.getAll(),
    });

    const rows: RequisitionRowData[] = (Array.isArray(data) ? data : []).filter(
        (r: RequisitionRowData) => statuses.includes(r.status),
    );
    const groups = groupByDate(rows, (r) => r.created_at, 'desc');

    return (
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
                            <Text style={styles.errorTitle}>Couldn’t load the queue</Text>
                            <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                        </View>
                    )}
                </>
            }
            renderItem={({ item }) => (
                <View style={styles.dayBlock}>
                    <Text style={styles.dayLabel}>{item.dateLabel}</Text>
                    <View style={styles.dayCard}>
                        {item.items.map((r, i) => (
                            <View key={r.id}>
                                <RequisitionRow req={r} onPress={() => router.push(`/requisition/${r.id}`)} />
                                {i < item.items.length - 1 && <View style={styles.gap} />}
                            </View>
                        ))}
                    </View>
                </View>
            )}
            ListEmptyComponent={
                !isLoading && !isError ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>{emptyText}</Text></View>
                ) : undefined
            }
        />
    );
};

/** Count for a set of statuses, used for the Menu badges. */
export function countByStatus(rows: { status: string }[] | undefined, statuses: string[]): number {
    if (!rows) return 0;
    return rows.filter((r) => statuses.includes(r.status)).length;
}

/** The statuses each queue watches, derived from core's status config. */
export const AWAITING_APPROVAL = ['PENDING_APPROVAL'];
export const AWAITING_DISBURSEMENT = ['AUTHORISED'];
export const statusLabel = (s: string) => getStatusConfig(s).label;

const styles = StyleSheet.create({
    list: { padding: 20, paddingBottom: 60 },
    loading: { marginVertical: 24 },
    dayBlock: { marginBottom: 12 },
    dayLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#000000', paddingHorizontal: 6, marginBottom: 8 },
    dayCard: {
        backgroundColor: colors.surface, borderRadius: 20, padding: 20,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    gap: { height: 28 },
    empty: { paddingVertical: 64, alignItems: 'center', paddingHorizontal: 32 },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 20 },
    errorCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.danger, marginBottom: 12,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
});
