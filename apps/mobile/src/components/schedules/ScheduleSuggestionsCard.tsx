import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Sparkles } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

interface Suggestion { key: string; title: string; amount: number; cadence: string; nextDue: string; seen: number; currency: 'ZMW' | 'USD'; foreignAmount: number | null }
const CADENCE: Record<string, string> = { WEEKLY: 'every week', BIWEEKLY: 'every 2 weeks', MONTHLY: 'every month', QUARTERLY: 'every 3 months', YEARLY: 'every year' };
const when = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * On the phone's Schedules screen: payees you pay on a regular rhythm that are not scheduled yet (one tap adds them), and a button that reads the emails
 * already in your mailbox for repeating bills. Bills in new emails are added by themselves and marked "From email" in the list.
 */
export const ScheduleSuggestionsCard: React.FC = () => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['schedule-suggestions'], retry: false, staleTime: 120_000, queryFn: async () => (await apiJson<{ suggestions: Suggestion[] }>('/schedules/suggestions')).suggestions });
    const [busy, setBusy] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['schedules'] }), qc.invalidateQueries({ queryKey: ['schedule-counts'] }), qc.invalidateQueries({ queryKey: ['schedule-suggestions'] })]);

    const act = async (s: Suggestion, kind: 'accept' | 'dismiss') => {
        setBusy(s.key); setNote(null);
        try { await apiJson(`/schedules/suggestions/${kind}`, { method: 'POST', body: JSON.stringify({ key: s.key }) }); await refresh(); }
        catch (e: any) { setNote(e?.message || 'Could not do that.'); } finally { setBusy(null); }
    };
    const scan = async () => {
        setScanning(true); setNote(null);
        let scanned = 0, added = 0, stored = 0;
        try {
            for (let round = 0; round < 40; round++) {
                const r = await apiJson<{ stored: number; unread: number; done: boolean; connections: number }>('/schedules/backfill-emails', { method: 'POST' });
                stored += r.stored;
                setNote(`Looking back through your mailbox… ${stored} more emails found${r.unread ? ` · ${r.unread} to read` : ''}`);
                if (r.done || r.connections === 0) break;
            }
            for (let round = 0; round < 40; round++) {
                const r = await apiJson<{ scanned: number; added: number; remaining: number }>('/schedules/scan-emails', { method: 'POST' });
                scanned += r.scanned; added += r.added;
                setNote(`Reading your bills… ${scanned} read, ${added} added${r.remaining ? `, ${r.remaining} to go` : ''}`);
                if (r.remaining === 0 || r.scanned === 0) break;
            }
            await refresh();
            setNote(`Looked back through your mailbox and read ${scanned} bills. Added ${added} repeating bill${added === 1 ? '' : 's'}.`);
        } catch (e: any) { setNote(e?.message || 'Could not read your emails.'); } finally { setScanning(false); }
    };

    const list = q.data ?? [];
    return (
        <View style={styles.wrap}>
            {list.length > 0 && (
                <View style={styles.card}>
                    <View style={styles.titleRow}><Sparkles size={14} color={colors.blue} /><Text style={styles.title}>We noticed you pay these regularly</Text></View>
                    {list.map((s) => (
                        <View key={s.key} style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.name} numberOfLines={1}>{s.title}</Text>
                                <Text style={styles.sub}>{s.currency === 'USD' && s.foreignAmount ? `$${s.foreignAmount} (about ${formatKwacha(s.amount)})` : formatKwacha(s.amount)} {CADENCE[s.cadence] ?? s.cadence.toLowerCase()} · next about {when(s.nextDue)}</Text>
                            </View>
                            <Pressable disabled={busy === s.key} onPress={() => act(s, 'dismiss')} hitSlop={6}><Text style={styles.later}>Not now</Text></Pressable>
                            <Pressable disabled={busy === s.key} onPress={() => act(s, 'accept')} style={[styles.add, busy === s.key && { opacity: 0.5 }]}><Text style={styles.addText}>Add</Text></Pressable>
                        </View>
                    ))}
                </View>
            )}
            <Pressable onPress={scan} disabled={scanning} style={styles.scan}>
                {scanning ? <ActivityIndicator size="small" color={colors.blue} /> : <Mail size={13} color={colors.blue} />}
                <Text style={styles.scanText}>Find bills in my emails</Text>
            </Pressable>
            {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingTop: 8 },
    card: { backgroundColor: '#F0F6FF', borderColor: '#D3E3FD', borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    title: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#041E49' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#D3E3FD' },
    name: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    later: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    add: { backgroundColor: colors.blue, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
    addText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#fff' },
    scan: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: 1, borderColor: '#C4C7C5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    scanText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.blue },
    note: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 6 },
});
