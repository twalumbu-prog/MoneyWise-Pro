import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { X, Mic, Square, FileText } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { accountService, formatKwacha } from 'core';
import type { MomoCapture } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';
import { useDictation } from '../../hooks/useDictation';

const PROVIDER_LABEL: Record<MomoCapture['provider'], string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile money' };

/**
 * What was this for? Shown when a captured transaction is reviewed — from the review list, or from tapping the
 * "Record or dismiss" notification. Picking one of the account's own income/expense categories (or typing or
 * speaking a note instead) goes straight into the same booking the "Book it" button always made; this just asks for
 * it up front instead of leaving everything uncategorised.
 */
export function MomoReviewModal({ capture, busy, onClose, onConfirm }: {
    capture: MomoCapture | null;
    busy: boolean;
    onClose: () => void;
    onConfirm: (choice: { accountId: string | null; description: string | null }) => void;
}) {
    const isIn = capture?.direction === 'IN';
    const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => accountService.getAll(), enabled: !!capture });
    const options = useMemo(
        () => (accounts.data ?? []).filter((a) => a.is_active && a.type === (isIn ? 'INCOME' : 'EXPENSE')),
        [accounts.data, isIn],
    );
    const [accountId, setAccountId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const dictation = useDictation(note, setNote);

    // A fresh capture each time the modal opens; nothing carries over from the last one reviewed.
    useEffect(() => { setAccountId(null); setNote(''); }, [capture?.id]);
    useEffect(() => { if (!capture) dictation.stop(); }, [capture]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!capture) return null;
    const close = () => { dictation.stop(); onClose(); };
    const confirm = () => { dictation.stop(); onConfirm({ accountId, description: note.trim() || null }); };
    const accountNumber = capture.sender || (capture.counterparty || '').match(/\b(\+?\d[\d ]{6,})\b/)?.[1] || null;
    const accountName = (capture.counterparty || '').replace(/\b\+?\d[\d ]{6,}\b/g, '').trim() || capture.counterparty;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.title}>You got a new transaction!</Text>
                        <Pressable onPress={close} hitSlop={8} style={styles.closeBtn}><X size={14} color="#505050" /></Pressable>
                    </View>

                    <View style={styles.detailsOuter}>
                        <Text style={styles.detailsLabel}>
                            {isIn ? 'Money received in your' : 'Money spent from your'} {PROVIDER_LABEL[capture.provider]} account
                        </Text>
                        <View style={styles.detailsInner}>
                            <View style={styles.detailsHeadRow}>
                                <FileText size={12} color="#585858" />
                                <Text style={styles.detailsHead}>Txn details</Text>
                            </View>
                            <Row label="Payment method" value="Mobile money" />
                            {!!accountNumber && <Row label="Account number" value={accountNumber} />}
                            {!!accountName && <Row label="Account name" value={accountName} />}
                            <Row label="Amount" value={formatKwacha(Number(capture.amount))} />
                        </View>
                    </View>

                    <Text style={styles.sectionLabel}>Please choose how this should be treated</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                        {accounts.isLoading && <ActivityIndicator color={colors.blue} />}
                        {options.map((a) => (
                            <Pressable key={a.id} onPress={() => setAccountId((v) => (v === a.id ? null : a.id))}
                                style={[styles.chip, accountId === a.id && styles.chipOn]}>
                                <Text style={[styles.chipText, accountId === a.id && styles.chipTextOn]} numberOfLines={1}>{a.name}</Text>
                            </Pressable>
                        ))}
                        {!accounts.isLoading && options.length === 0 && <Text style={styles.chipEmpty}>No categories set up yet — add a note instead.</Text>}
                    </ScrollView>

                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input} value={note} onChangeText={setNote}
                            placeholder={dictation.listening ? 'Listening…' : 'What was this for? (optional)'}
                            placeholderTextColor={colors.textFaint}
                        />
                        <Pressable onPress={dictation.toggle} style={[styles.micBtn, dictation.listening && styles.micBtnOn]} hitSlop={6}>
                            {dictation.listening ? <Square size={14} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={16} color={colors.blue} />}
                        </Pressable>
                    </View>

                    <Pressable onPress={confirm} disabled={busy} style={({ pressed }) => [styles.done, pressed && { opacity: 0.85 }, busy && { opacity: 0.7 }]}>
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneText}>Done</Text>}
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: { width: '100%', maxWidth: 394, backgroundColor: colors.surface, borderRadius: radius.lg, paddingTop: 24, paddingBottom: 20, paddingHorizontal: 16, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: '#000000' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEDED', alignItems: 'center', justifyContent: 'center' },
    detailsOuter: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EEF0F2', borderRadius: radius.md, padding: 12, gap: 8 },
    detailsLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#000000' },
    detailsInner: { backgroundColor: '#F9FBFB', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
    detailsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    detailsHead: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#585858' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
    rowLabel: { fontFamily: fonts.body, fontSize: 10, color: '#585858', flexShrink: 0 },
    rowValue: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#585858', flex: 1, textAlign: 'right' },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#000000' },
    chips: { gap: 8, paddingVertical: 2 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F6F8F8' },
    chipOn: { backgroundColor: '#F6FAFF', borderWidth: 1, borderColor: colors.blue },
    chipText: { fontFamily: fonts.body, fontSize: 12, color: '#585858' },
    chipTextOn: { fontFamily: fonts.bodyBold, color: '#00409A' },
    chipEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: {
        flex: 1, height: 40, borderRadius: 32, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
        paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 13, color: colors.text,
    },
    micBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6FAFF' },
    micBtnOn: { backgroundColor: colors.blue },
    done: { height: 51, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    doneText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
