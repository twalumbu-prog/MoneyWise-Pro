import { useState } from 'react';
import {
    View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { FileSpreadsheet, CheckCircle2 } from 'lucide-react-native';
import {
    cashbookService, requireCapability, parseCsv, parseStatementRows,
    StatementFormatError, formatKwacha, formatShortDate,
} from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Stage = 'pick' | 'preview' | 'importing' | 'done';

/**
 * Bank-statement import for an external account.
 *
 * CSV only, deliberately. The web app parses .xlsx with SheetJS, which the
 * native bundle cannot use; rather than ship a half-working XLSX path that
 * fails on some exports, the screen asks for CSV — every Zambian bank portal
 * offers it, and the parsing itself is shared with the web app through core so
 * the two cannot disagree about how a statement maps.
 */
export default function ImportStatementScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { walletId, walletName } = useLocalSearchParams<{ walletId: string; walletName?: string }>();

    const [stage, setStage] = useState<Stage>('pick');
    const [busy, setBusy] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const pickAndPreview = async () => {
        setBusy(true);
        setError(null);
        try {
            const [file] = await requireCapability('files').pick({
                kind: 'document',
                accept: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text'],
            });
            if (!file) return;

            const text = await new File(file.uri).text();
            const rows = parseStatementRows(parseCsv(text));

            const preview = await cashbookService.previewStatementImport(String(walletId), rows);
            setItems(preview.results ?? []);
            setStage('preview');
        } catch (e: any) {
            setError(
                e instanceof StatementFormatError
                    ? e.message
                    : e?.message ?? 'Could not read that file.',
            );
        } finally {
            setBusy(false);
        }
    };

    const confirmImport = async () => {
        setStage('importing');
        try {
            await cashbookService.importStatement(String(walletId), items);
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            setStage('done');
        } catch (e: any) {
            setStage('preview');
            Alert.alert('Import failed', e?.message ?? 'Please try again.');
        }
    };

    const newCount = items.filter((i) => i.status === 'NEW' || i.matchStatus === 'NEW').length;
    const matchedCount = items.length - newCount;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Import Statement" />

            <ScrollView contentContainerStyle={styles.scroll}>
                {stage === 'pick' && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.heading}>{walletName || 'External account'}</Text>
                            <Text style={styles.blurb}>
                                Download your statement as CSV from your bank, then choose the file here.
                                It needs Date, Details, Debit, Credit and Balance columns — the names can
                                vary, we match on keywords.
                            </Text>
                            <Text style={styles.note}>
                                Excel (.xlsx) statements aren’t supported on mobile yet — use the web app for those.
                            </Text>
                        </View>

                        {error && (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorTitle}>Couldn’t read that statement</Text>
                                <Text style={styles.errorBody}>{error}</Text>
                            </View>
                        )}

                        <Pressable
                            style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.85 }]}
                            onPress={pickAndPreview}
                            disabled={busy}
                        >
                            {busy
                                ? <ActivityIndicator color={colors.blue} />
                                : <><FileSpreadsheet size={18} color={colors.blue} /><Text style={styles.pickText}>Choose CSV file</Text></>}
                        </Pressable>
                    </>
                )}

                {(stage === 'preview' || stage === 'importing') && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.heading}>{items.length} rows read</Text>
                            <Text style={styles.blurb}>
                                {matchedCount} already match ledger entries and will be reconciled.
                                {newCount > 0 ? ` ${newCount} are new and will be added.` : ''}
                            </Text>
                        </View>

                        {items.slice(0, 40).map((it, i) => (
                            <View key={i} style={styles.row}>
                                <View style={styles.rowMain}>
                                    <Text style={styles.rowDesc} numberOfLines={1}>
                                        {it.details ?? it.description ?? '—'}
                                    </Text>
                                    <Text style={styles.rowDate}>{formatShortDate(it.date)}</Text>
                                </View>
                                <View style={styles.rowRight}>
                                    <Text style={styles.rowAmount}>
                                        {formatKwacha((it.credit || 0) > 0 ? it.credit : it.debit)}
                                    </Text>
                                    <Text style={styles.rowStatus}>
                                        {(it.status ?? it.matchStatus ?? '').toString().toLowerCase()}
                                    </Text>
                                </View>
                            </View>
                        ))}
                        {items.length > 40 && (
                            <Text style={styles.more}>…and {items.length - 40} more</Text>
                        )}
                    </>
                )}

                {stage === 'done' && (
                    <View style={styles.doneCard}>
                        <CheckCircle2 size={40} color={colors.positive} />
                        <Text style={styles.doneTitle}>Statement imported</Text>
                        <Text style={styles.blurb}>
                            New transactions were added, matches reconciled, and running balances recalculated.
                        </Text>
                    </View>
                )}
            </ScrollView>

            {stage === 'preview' && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <Pressable style={styles.submit} onPress={confirmImport}>
                        <Text style={styles.submitText}>Import {items.length} rows</Text>
                    </Pressable>
                </View>
            )}

            {stage === 'importing' && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <View style={[styles.submit, styles.disabled]}><ActivityIndicator color="#FFFFFF" /></View>
                </View>
            )}

            {stage === 'done' && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <Pressable style={styles.submit} onPress={() => router.back()}>
                        <Text style={styles.submitText}>Done</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 12, paddingBottom: 32 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border, gap: 8,
    },
    heading: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    blurb: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    note: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    pickBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 16, borderRadius: radius.md, minHeight: 52,
        backgroundColor: colors.tabActiveBg, borderWidth: 1, borderColor: 'rgba(0,106,255,0.25)',
    },
    pickText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    rowMain: { flex: 1, gap: 2 },
    rowDesc: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    rowDate: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    rowRight: { alignItems: 'flex-end', gap: 2 },
    rowAmount: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    rowStatus: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    more: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 8 },
    doneCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 28,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 10,
    },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    errorCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    submit: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    disabled: { opacity: 0.6 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
