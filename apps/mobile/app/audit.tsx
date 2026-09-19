import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { requisitionService, formatKwacha, formatShortDate } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme/tokens';

const RATING_STYLE: Record<string, { bg: string; fg: string }> = {
    Brilliant: { bg: '#E4FAF1', fg: colors.positiveInk },
    Average: { bg: '#FDF2DF', fg: colors.warn },
    Bad: { bg: '#FFEBF1', fg: colors.danger },
};

export default function AuditScreen() {
    const router = useRouter();
    const [search, setSearch] = useState('');

    const { data: report, isLoading } = useQuery({
        queryKey: ['audit-report'],
        queryFn: () => requisitionService.getAuditReport(),
    });

    const transactions = useMemo(() => {
        const rows: any[] = report?.transactions ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((t) =>
            t.description?.toLowerCase().includes(q) || t.reference_number?.toLowerCase().includes(q));
    }, [report, search]);

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Audit" />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.hero}>
                        <Text style={styles.heroLabel}>Overall Accuracy</Text>
                        <Text style={styles.heroValue}>{report?.summary?.average_score ?? 0}%</Text>
                        <Text style={styles.heroSub}>
                            Average score across {report?.summary?.total_audited ?? 0} transactions
                        </Text>
                    </View>

                    <View style={styles.searchWrap}>
                        <Search size={16} color={colors.textFaint} />
                        <TextInput
                            style={styles.searchInput}
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Search audited transactions"
                            placeholderTextColor={colors.textFaint}
                        />
                    </View>

                    {transactions.map((t: any) => {
                        const style = RATING_STYLE[t.rating] ?? { bg: colors.canvasAlt, fg: colors.textMuted };
                        return (
                            <Pressable
                                key={t.id}
                                style={styles.row}
                                onPress={() => router.push(`/requisition/${t.id}`)}
                            >
                                <View style={styles.rowMain}>
                                    <Text style={styles.rowDesc} numberOfLines={1}>{t.description}</Text>
                                    <Text style={styles.rowMeta}>
                                        {t.reference_number} · {formatShortDate(t.created_at)} · {formatKwacha(t.actual_total)}
                                    </Text>
                                </View>
                                <View style={styles.rowRight}>
                                    <Text style={styles.score}>{Math.round(t.audit_score)}%</Text>
                                    <View style={[styles.ratingPill, { backgroundColor: style.bg }]}>
                                        <Text style={[styles.ratingText, { color: style.fg }]}>{t.rating}</Text>
                                    </View>
                                </View>
                            </Pressable>
                        );
                    })}

                    {transactions.length === 0 && (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>
                                {search ? 'Nothing matches that search.' : 'No audited transactions yet.'}
                            </Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    scroll: { padding: 20, gap: 12, paddingBottom: 48 },
    hero: {
        backgroundColor: colors.navy, borderRadius: 20, padding: 22,
    },
    heroLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
    heroValue: { fontFamily: fonts.display, fontSize: 42, color: '#FFFFFF', marginTop: 6 },
    heroSub: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11,
        backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    rowMain: { flex: 1, gap: 3 },
    rowDesc: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    rowMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    rowRight: { alignItems: 'flex-end', gap: 5 },
    score: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    ratingPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
    ratingText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
});
