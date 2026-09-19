import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable } from 'react-native';
import { cashbookService, formatKwacha, formatShortDate } from 'core';
import type { CashbookEntry } from 'core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../src/theme/tokens';

/**
 * A single ledger entry. Reads from the cached overview rather than refetching:
 * the list the user just tapped already holds the full row, and on a slow
 * connection an extra round-trip only delays a screen we can paint immediately.
 */
export default function EntryDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const { data, isLoading } = useQuery({
        queryKey: ['cashbook-entries', 'overview'],
        queryFn: () => cashbookService.getOverview(),
    });

    const entry: CashbookEntry | undefined = (data?.entries ?? []).find(
        (e: CashbookEntry) => String(e.id) === String(id),
    );

    const isInflow = (entry?.debit ?? 0) > 0;
    const amount = isInflow ? entry?.debit : entry?.credit;
    const req = entry?.requisitions;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Transaction" />

            {isLoading && !entry && (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            )}

            {!isLoading && !entry && (
                <View style={styles.centre}>
                    <Text style={styles.missing}>This transaction is no longer in the ledger.</Text>
                </View>
            )}

            {entry && (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.label}>{isInflow ? 'Received' : 'Paid out'}</Text>
                        <Text style={[styles.amount, isInflow && styles.amountIn]}>
                            {formatKwacha(amount ?? 0)}
                        </Text>
                        <Text style={styles.description}>{entry.description}</Text>
                        {entry.balance_after != null && (
                            <Text style={styles.balanceAfter}>
                                Balance after · {formatKwacha(entry.balance_after)}
                            </Text>
                        )}
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Entry</Text>
                        <Field label="Date" value={formatShortDate(entry.date)} />
                        <Field label="Type" value={entry.entry_type.replace(/_/g, ' ')} />
                        <Field label="Account" value={entry.account_type.replace(/_/g, ' ')} />
                        {!!entry.reference_number && <Field label="Reference" value={entry.reference_number} />}
                        {!!entry.status && <Field label="Status" value={entry.status} />}
                        {!!entry.accounts?.name && (
                            <Field label="Ledger account" value={`${entry.accounts.code} · ${entry.accounts.name}`} />
                        )}
                        {!!entry.users?.name && <Field label="Recorded by" value={entry.users.name} />}
                        {!!entry.sender_name && <Field label="From" value={entry.sender_name} />}
                        {!!entry.sender_phone && <Field label="Phone" value={entry.sender_phone} />}
                    </View>

                    {req && (
                        <Pressable
                            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
                            onPress={() => router.push(`/requisition/${req.id}`)}
                        >
                            <Text style={styles.sectionTitle}>Linked request</Text>
                            <Text style={styles.linkedDesc} numberOfLines={2}>{req.description}</Text>
                            <Text style={styles.linkedMeta}>
                                {req.reference_number} · {req.status}
                                {req.requestor?.name ? ` · ${req.requestor.name}` : ''}
                            </Text>
                            <Text style={styles.linkedCta}>View request →</Text>
                        </Pressable>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue} numberOfLines={2}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    centre: { paddingVertical: 64, alignItems: 'center', paddingHorizontal: 32 },
    missing: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
    amount: { fontFamily: fonts.display, fontSize: 32, color: colors.navy, marginTop: 6 },
    amountIn: { color: colors.positiveInk },
    description: { fontFamily: fonts.body, fontSize: 15, color: colors.text, marginTop: 10, lineHeight: 21 },
    balanceAfter: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 10 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 8 },
    field: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 7,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    fieldLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    fieldValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, textAlign: 'right' },
    linkedDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
    linkedMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4 },
    linkedCta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue, marginTop: 12 },
});
