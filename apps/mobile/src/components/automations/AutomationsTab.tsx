/**
 * AutomationsTab — mirrors apps/web/src/components/automations/AutomationsTab.tsx.
 *
 * Same list-then-detail shape as Schedules: rows with an icon tile, name, meta
 * line and status pill; tapping opens a sheet with a Run Now card and the run
 * history. Creating an automation is a conversation with the Assistant, so the
 * "New automation" button hands off to the chat rather than opening a form.
 */

import { useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
    Zap, Plus, Play, X, Wallet, Send, Mail, MoreVertical, Check, Clock, ChevronDown, ChevronUp, RotateCcw, Sparkles,
} from 'lucide-react-native';
import { automationService, formatKwacha } from 'core';
import type { Automation, AutomationRun, AutomationRunStatus } from 'core';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../theme/tokens';

const RUN_STATUS: Record<AutomationRunStatus, { label: string; bg: string; text: string }> = {
    RUNNING:               { label: 'Running',       bg: '#FEF9C3', text: '#A16207' },
    AWAITING_CONFIRMATION: { label: 'Awaiting bank', bg: '#DBEAFE', text: '#1D4ED8' },
    COMPLETED:             { label: 'Completed',     bg: '#D1FAE5', text: '#047857' },
    FAILED:                { label: 'Failed',        bg: '#FEE2E2', text: '#B91C1C' },
    SKIPPED:               { label: 'Nothing to do', bg: '#F3F4F6', text: '#4B5563' },
};

const when = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

const forwardOf = (a: Automation) => a.actions.find((x) => x.type === 'FORWARD_PAYMENT');
const popOf = (a: Automation) => a.actions.find((x) => x.type === 'SEND_POP_EMAIL')?.to;

const Pill: React.FC<{ label: string; bg: string; text: string }> = ({ label, bg, text }) => (
    <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={[styles.pillText, { color: text }]}>{label}</Text>
    </View>
);

// ── Run history row ───────────────────────────────────────────────────────────

const RunRow: React.FC<{
    run: AutomationRun; canRetry: boolean; retrying: boolean; onRetry: () => void; onOpenPayout: (id: string) => void;
}> = ({ run, canRetry, retrying, onRetry, onOpenPayout }) => {
    const [open, setOpen] = useState(false);
    const cfg = RUN_STATUS[run.status] ?? { label: run.status, bg: '#F3F4F6', text: '#4B5563' };
    const who = run.trigger_summary?.split(' — ').slice(1).join(' — ');

    return (
        <View style={styles.runCard}>
            <Pressable style={styles.runHead} onPress={() => setOpen((v) => !v)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.runTitle} numberOfLines={1}>
                        {run.amount ? formatKwacha(run.amount) : 'Manual check'}
                        {run.amount && who ? <Text style={styles.runWho}> · {who}</Text> : null}
                    </Text>
                    <Text style={styles.runMeta}>
                        {when(run.started_at)}{run.source === 'MANUAL' ? ' · run manually' : ''}{run.attempts > 1 ? ` · attempt ${run.attempts}` : ''}
                    </Text>
                </View>
                <Pill label={cfg.label} bg={cfg.bg} text={cfg.text} />
                {open ? <ChevronUp size={14} color={colors.textFaint} /> : <ChevronDown size={14} color={colors.textFaint} />}
            </Pressable>

            {open && (
                <View style={styles.runBody}>
                    {run.steps.map((s, i) => (
                        <View key={i} style={styles.stepRow}>
                            <View style={[styles.stepDot, {
                                backgroundColor: s.status === 'ok' ? '#D1FAE5' : s.status === 'failed' ? '#FEE2E2' : '#F3F4F6',
                            }]}>
                                {s.status === 'ok' ? <Check size={9} color="#047857" />
                                    : s.status === 'failed' ? <X size={9} color="#B91C1C" />
                                    : <Clock size={9} color="#6B7280" />}
                            </View>
                            <Text style={styles.stepText}>
                                {s.detail}
                                <Text style={styles.stepTime}> · {when(s.at)}</Text>
                            </Text>
                        </View>
                    ))}
                    <View style={styles.runActions}>
                        {run.requisition_id ? (
                            <Pressable onPress={() => onOpenPayout(run.requisition_id!)}>
                                <Text style={styles.link}>View payout →</Text>
                            </Pressable>
                        ) : <View />}
                        {run.status === 'FAILED' && canRetry && (
                            <Pressable style={styles.retryBtn} onPress={onRetry} disabled={retrying}>
                                {retrying ? <ActivityIndicator size="small" color="#fff" /> : <RotateCcw size={11} color="#fff" />}
                                <Text style={styles.retryText}>Retry</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
};

// ── Detail sheet ──────────────────────────────────────────────────────────────

const DetailSheet: React.FC<{
    automation: Automation; isAdmin: boolean; running: boolean; onRun: () => void; onClose: () => void;
}> = ({ automation, isAdmin, running, onRun, onClose }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const [retryingId, setRetryingId] = useState<string | null>(null);

    const { data: runs = [], isLoading } = useQuery<AutomationRun[]>({
        queryKey: ['automation-runs', automation.id],
        queryFn: () => automationService.getRuns(automation.id),
        // Payouts confirm in the background — keep history live while the sheet is open.
        refetchInterval: 10_000,
    });

    const fwd = forwardOf(automation);
    const email = popOf(automation);

    const retry = async (runId: string) => {
        setRetryingId(runId);
        try {
            await automationService.retryRun(automation.id, runId);
        } catch (e: any) {
            Alert.alert('Retry failed', e?.message ?? 'Please try again.');
        } finally {
            setRetryingId(null);
            qc.invalidateQueries({ queryKey: ['automation-runs', automation.id] });
            qc.invalidateQueries({ queryKey: ['automations'] });
        }
    };

    return (
        <View style={styles.sheet}>
            <View style={styles.sheetHead}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Pill
                        label={automation.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        bg={automation.status === 'ACTIVE' ? '#D1FAE5' : '#F3F4F6'}
                        text={automation.status === 'ACTIVE' ? '#047857' : '#4B5563'}
                    />
                    <Text style={styles.sheetTitle}>{automation.name}</Text>
                    {automation.description ? <Text style={styles.sheetDesc}>{automation.description}</Text> : null}
                </View>
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                    <X size={20} color={colors.textMuted} />
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
                <View style={{ gap: 6 }}>
                    <View style={styles.chip}>
                        <Wallet size={12} color={colors.textMuted} />
                        <Text style={styles.chipText} numberOfLines={2}>
                            <Text style={styles.chipBold}>When money is deposited into </Text>{automation.wallet_name ?? 'the wallet'}
                        </Text>
                    </View>
                    {fwd && (
                        <View style={styles.chip}>
                            <Send size={12} color={colors.textMuted} />
                            <Text style={styles.chipText} numberOfLines={2}>
                                <Text style={styles.chipBold}>Forward to </Text>
                                {fwd.recipient_name} · {fwd.recipient_bank_name ?? fwd.recipient_bank_code} {fwd.recipient_account}
                            </Text>
                        </View>
                    )}
                    {email && (
                        <View style={[styles.chip, { backgroundColor: '#EFF6FF' }]}>
                            <Mail size={12} color={colors.blue} />
                            <Text style={[styles.chipText, { color: colors.blue }]} numberOfLines={2}>
                                <Text style={styles.chipBold}>Proof of Payment → </Text>{email}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.runNowCard}>
                    <View style={styles.runNowTop}>
                        <Text style={styles.runNowLabel}>RUNS AUTOMATICALLY</Text>
                        <Pill label="Every minute" bg="#F3F4F6" text="#4B5563" />
                    </View>
                    <Text style={styles.runNowText}>
                        {automation.last_run_at ? `Last activity ${when(automation.last_run_at)}. ` : 'No activity yet. '}
                        Run now checks for new deposits straight away.
                    </Text>
                    {isAdmin && (
                        <Pressable style={[styles.primaryBtn, running && { opacity: 0.6 }]} onPress={onRun} disabled={running}>
                            {running ? <ActivityIndicator size="small" color="#fff" /> : <Play size={13} color="#fff" fill="#fff" />}
                            <Text style={styles.primaryBtnText}>Run Now</Text>
                        </Pressable>
                    )}
                </View>

                <Text style={styles.sectionLabel}>RUN HISTORY</Text>
                {isLoading ? (
                    <ActivityIndicator style={{ marginTop: 16 }} color={colors.textFaint} />
                ) : runs.length === 0 ? (
                    <Text style={styles.emptyRuns}>No runs yet. The first deposit will show up here.</Text>
                ) : (
                    <View style={{ gap: 8 }}>
                        {runs.map((run) => (
                            <RunRow
                                key={run.id} run={run} canRetry={isAdmin} retrying={retryingId === run.id}
                                onRetry={() => retry(run.id)}
                                onOpenPayout={(id) => { onClose(); router.push(`/requisition/${id}` as any); }}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

// ── Tab ───────────────────────────────────────────────────────────────────────

export const AutomationsTab: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const [detailId, setDetailId] = useState<string | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);

    const { data: automations = [], isLoading, refetch, isRefetching } = useQuery<Automation[]>({
        queryKey: ['automations'],
        queryFn: () => automationService.getAll(),
        refetchInterval: 20_000,
    });

    const detail = automations.find((a) => a.id === detailId) ?? null;
    const refresh = () => qc.invalidateQueries({ queryKey: ['automations'] });

    const run = async (a: Automation) => {
        setRunningId(a.id);
        try {
            const r = await automationService.runNow(a.id);
            if (r.errors.length) Alert.alert('Run finished with an error', r.errors[0]);
            else if (r.started) Alert.alert('Done', `Processed ${r.started} new deposit${r.started === 1 ? '' : 's'}.`);
            else if (r.retried || r.settled) Alert.alert('Done', 'Updated in-flight payouts.');
            else Alert.alert('Checked', 'No new deposits.');
        } catch (e: any) {
            Alert.alert('Run failed', e?.message ?? 'Please try again.');
        } finally {
            setRunningId(null);
            refresh();
            qc.invalidateQueries({ queryKey: ['automation-runs', a.id] });
        }
    };

    const openMenu = (a: Automation) => {
        Alert.alert(a.name, undefined, [
            {
                text: a.status === 'ACTIVE' ? 'Pause' : 'Resume',
                onPress: async () => {
                    try {
                        await automationService.setStatus(a.id, a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
                        refresh();
                    } catch (e: any) { Alert.alert('Could not update', e?.message ?? 'Please try again.'); }
                },
            },
            {
                text: 'Stop & remove', style: 'destructive',
                onPress: () => Alert.alert(
                    `Stop and remove "${a.name}"?`, 'Its run history is kept for your records.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Remove', style: 'destructive',
                            onPress: async () => {
                                try {
                                    await automationService.remove(a.id);
                                    if (detailId === a.id) setDetailId(null);
                                    refresh();
                                } catch (e: any) { Alert.alert('Could not remove', e?.message ?? 'Please try again.'); }
                            },
                        },
                    ],
                ),
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <View style={{ flex: 1 }}>
            {isLoading ? (
                <ActivityIndicator style={{ marginTop: 60 }} color={colors.textFaint} />
            ) : automations.length === 0 ? (
                <View style={styles.empty}>
                    <View style={styles.emptyIcon}><Zap size={26} color="#A855F7" /></View>
                    <Text style={styles.emptyTitle}>No automations yet</Text>
                    <Text style={styles.emptyText}>
                        Tell the Assistant what should happen and when — for example, forward every deposit into a wallet to a bank account and email the proof of payment.
                    </Text>
                    {isAdmin && (
                        <Pressable style={styles.primaryBtnInline} onPress={onCreate}>
                            <Sparkles size={13} color="#fff" />
                            <Text style={styles.primaryBtnText}>Create with Assistant</Text>
                        </Pressable>
                    )}
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 90 }}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.blue} />}
                >
                    {automations.map((a, idx) => {
                        const fwd = forwardOf(a);
                        const last = a.last_run ? RUN_STATUS[a.last_run.status] : null;
                        return (
                            <Pressable
                                key={a.id}
                                style={[styles.row, idx < automations.length - 1 && styles.rowBorder]}
                                onPress={() => setDetailId(a.id)}
                            >
                                <View style={styles.iconTile}><Zap size={15} color="#7E22CE" /></View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                                    <Text style={styles.rowMeta} numberOfLines={1}>
                                        On deposit{a.wallet_name ? ` · ${a.wallet_name}` : ''}{fwd ? ` → ${fwd.recipient_name}` : ''}
                                    </Text>
                                    <View style={styles.rowPills}>
                                        <Pill
                                            label={a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                                            bg={a.status === 'ACTIVE' ? '#D1FAE5' : '#F3F4F6'}
                                            text={a.status === 'ACTIVE' ? '#047857' : '#4B5563'}
                                        />
                                        {last && <Pill label={`Last: ${last.label}`} bg={last.bg} text={last.text} />}
                                    </View>
                                </View>
                                {isAdmin && (
                                    <Pressable onPress={() => openMenu(a)} hitSlop={10} accessibilityLabel="More actions">
                                        <MoreVertical size={17} color={colors.textFaint} />
                                    </Pressable>
                                )}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            )}

            {isAdmin && automations.length > 0 && (
                <Pressable style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={onCreate} accessibilityLabel="New automation">
                    <Plus size={26} color="#fff" />
                </Pressable>
            )}

            <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailId(null)}>
                {detail && (
                    <DetailSheet
                        automation={detail} isAdmin={isAdmin} running={runningId === detail.id}
                        onRun={() => run(detail)} onClose={() => setDetailId(null)}
                    />
                )}
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 10 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    iconTile: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    rowMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    rowPills: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },

    fab: {
        position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 8 },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#FAF5FF', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

    primaryBtn: {
        marginTop: 12, height: 38, borderRadius: 10, backgroundColor: colors.blue, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    primaryBtnInline: {
        marginTop: 14, height: 38, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.blue,
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    primaryBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#fff' },

    sheet: { flex: 1, backgroundColor: colors.canvas },
    sheetHead: {
        flexDirection: 'row', alignItems: 'flex-start', padding: 20, backgroundColor: colors.surface,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, marginTop: 8 },
    sheetDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },

    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
    chipText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    chipBold: { fontFamily: fonts.bodyBold, color: colors.text },

    runNowCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
    runNowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    runNowLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, letterSpacing: 0.6 },
    runNowText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8, marginTop: 4 },
    emptyRuns: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },

    runCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    runHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    runTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    runWho: { fontFamily: fonts.body, color: colors.textMuted },
    runMeta: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 2 },
    runBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, paddingTop: 10 },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    stepDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    stepText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
    stepTime: { color: '#D1D5DB' },
    runActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    link: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.blue, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#fff' },
});
