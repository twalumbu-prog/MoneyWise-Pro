import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { momoCaptureService } from 'core';
import type { MomoEverythingItem } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme/tokens';

const SOURCE: Record<string, string> = { ANDROID_SMS: 'Android SMS', ANDROID_NOTIFICATION: 'Android notification', IOS_SHORTCUT: 'iPhone automation', PASTE: 'Pasted' };

const badge = (m: MomoEverythingItem) =>
    m.kind === 'TRANSACTION' ? `${m.direction === 'IN' ? 'Received' : 'Sent'}${m.amount !== null ? ` K${m.amount.toLocaleString()}` : ''} · ${m.status.toLowerCase()}`
    : m.kind === 'BALANCE' ? `Balance K${m.amount?.toLocaleString() ?? ''}` : 'Not booked';

/**
 * Every message every phone on this account has sent: transactions, balance readings and the ones that were not
 * booked (with why). While capture is being validated this is the one place to confirm nothing went missing.
 */
export default function MomoAllMessagesScreen() {
    const q = useQuery({ queryKey: ['momo-capture', 'everything'], queryFn: () => momoCaptureService.everything(300), refetchInterval: 10_000 });
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="All messages" />
            {q.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} /> : (
                <FlatList
                    data={q.data ?? []}
                    keyExtractor={(m) => `${m.kind}-${m.id}`}
                    contentContainerStyle={{ padding: 16, gap: 10 }}
                    refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
                    ListEmptyComponent={<Text style={styles.empty}>No messages yet. Messages your phones send show up here as they arrive.</Text>}
                    renderItem={({ item: m }) => (
                        <View style={styles.card}>
                            <View style={styles.top}>
                                <Text style={[styles.badge, m.kind === 'NOT_BOOKED' && styles.badgeMuted]}>{badge(m)}</Text>
                                <Text style={styles.when}>{new Date(m.receivedAt).toLocaleString()}</Text>
                            </View>
                            <Text style={styles.meta}>{SOURCE[m.source] ?? m.source}{m.device ? ` · ${m.device}` : ''}{m.elsewhere ? ` · in ${m.workspace ?? 'another workspace'}` : ''}</Text>
                            <Text style={styles.text}>{m.text}</Text>
                            {!!m.note && <Text style={styles.why}>Why: {m.note}</Text>}
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    card: { backgroundColor: colors.surface ?? '#fff', borderRadius: radius.lg ?? 16, padding: 14, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border ?? '#ddd' },
    top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    badge: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    badgeMuted: { color: colors.textMuted },
    when: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    meta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    text: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 18, marginTop: 2 },
    why: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.warn, marginTop: 2 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
