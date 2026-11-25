import { useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

export interface DebtTagDef { key: string; label: string; hint: string; flow: 'IN' | 'OUT'; side: 'OWE' | 'OWED'; sign: 1 | -1 }
interface Counterparties { people: { name: string }[]; companies: { id: string; name: string }[]; debts: { id: string; side: 'OWE' | 'OWED'; name: string }[] }

/** The tags that can be put on a transaction (loan received, repayment made, ...). Fetched once; the server owns the list. */
export function useDebtTags(enabled: boolean) {
    return useQuery({ queryKey: ['debts', 'tags'], enabled, staleTime: Infinity, retry: false, queryFn: async () => (await apiJson<{ tags: DebtTagDef[] }>('/debts/tags')).tags });
}

/** The pseudo-accounts the category picker shows for a transaction: one per tag that fits the way the money moved. */
export const debtOptionsFor = (tags: DebtTagDef[] | undefined, isInflow: boolean) =>
    (tags ?? []).filter((t) => t.flow === (isInflow ? 'IN' : 'OUT')).map((t) => ({ id: `debt:${t.key}`, name: t.label, code: 'Debt', accountType: 'Debt' }));

/** Asks who a tagged transaction is with (a person you type, or a company workspace you belong to), then tags it. */
export const DebtTagSheet: React.FC<{
    visible: boolean;
    tag: DebtTagDef | null;
    entry: { id: string; description?: string; amount: number };
    onClose: () => void;
    onDone: (label: string) => void;
}> = ({ visible, tag, entry, onClose, onDone }) => {
    const cps = useQuery({ queryKey: ['debts', 'counterparties'], enabled: visible, retry: false, queryFn: () => apiJson<Counterparties>('/debts/counterparties') });
    const [kind, setKind] = useState<'PERSON' | 'COMPANY'>('PERSON');
    const [name, setName] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    if (!tag) return null;
    const existing = (cps.data?.debts ?? []).filter((d) => d.side === tag.side);
    const ready = kind === 'PERSON' ? name.trim().length > 0 : companyId !== '';
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/debts/tag', { method: 'POST', body: JSON.stringify({ entryId: entry.id, tag: tag.key, ...(kind === 'COMPANY' ? { counterpartyOrgId: companyId } : { counterpartyName: name.trim() }) }) });
            setName(''); setCompanyId('');
            onDone(tag.label);
        } catch (e: any) { setErr(e?.message || 'Could not tag it.'); } finally { setBusy(false); }
    };
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>{tag.label}</Text>
                        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><X size={20} color={colors.textMuted} /></Pressable>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
                        <Text style={styles.entryLine}>{(entry.description || 'Transaction').split(' | Ref:')[0]} · {formatKwacha(entry.amount)}</Text>
                        <Text style={styles.hint}>{tag.hint}</Text>
                        {err ? <Text style={styles.error}>{err}</Text> : null}
                        <Text style={styles.label}>Who is this with?</Text>
                        <View style={styles.row}>
                            {([['PERSON', 'A person'], ['COMPANY', 'A company']] as const).map(([k, l]) => (
                                <Pressable key={k} onPress={() => setKind(k)} style={[styles.pill, kind === k && styles.pillOn]}><Text style={[styles.pillText, kind === k && styles.pillTextOn]}>{l}</Text></Pressable>
                            ))}
                        </View>
                        {kind === 'PERSON' ? (
                            <>
                                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Their name, e.g. Mary" placeholderTextColor={colors.textFaint} autoCapitalize="words" />
                                {existing.length > 0 && (
                                    <View style={styles.row}>
                                        {existing.slice(0, 6).map((d) => (
                                            <Pressable key={d.id} onPress={() => setName(d.name)} style={styles.pill}><Text style={styles.pillText}>{d.name}</Text></Pressable>
                                        ))}
                                    </View>
                                )}
                            </>
                        ) : (
                            <>
                                {cps.isPending ? <ActivityIndicator color={colors.blue} /> : (cps.data?.companies ?? []).length === 0
                                    ? <Text style={styles.hint}>You don’t belong to any company workspace yet.</Text>
                                    : (cps.data?.companies ?? []).map((c) => (
                                        <Pressable key={c.id} onPress={() => setCompanyId(c.id)} style={[styles.company, companyId === c.id && styles.companyOn]}><Text style={[styles.companyText, companyId === c.id && styles.pillTextOn]}>{c.name}</Text></Pressable>
                                    ))}
                                <Text style={styles.hint}>The company will see its side of this debt in its own Debts page.</Text>
                            </>
                        )}
                    </ScrollView>
                    <Pressable onPress={save} disabled={!ready || busy} style={[styles.button, (!ready || busy) && { opacity: 0.5 }]}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Tag it</Text>}
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 28, maxHeight: '85%' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DADCE0', marginTop: 10, marginBottom: 6 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    entryLine: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, marginBottom: 2 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 12 },
    error: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', marginBottom: 10 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    pill: { borderWidth: 1, borderColor: '#C4C7C5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    pillOn: { borderColor: colors.blue, backgroundColor: '#D3E3FD' },
    pillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    pillTextOn: { color: '#041E49' },
    input: { borderWidth: 1, borderColor: '#C4C7C5', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontFamily: fonts.body, fontSize: 14, color: colors.text, marginBottom: 10 },
    company: { borderWidth: 1, borderColor: '#C4C7C5', borderRadius: 12, padding: 12, marginBottom: 8 },
    companyOn: { borderColor: colors.blue, backgroundColor: '#D3E3FD' },
    companyText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    button: { backgroundColor: colors.blue, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 6 },
    buttonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#fff' },
});
