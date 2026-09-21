import { useEffect, useRef, useState } from 'react';
import {
    View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator,
    Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Send, MoreVertical, Trash2 } from 'lucide-react-native';
import {
    requisitionService, canAuthoriseRequisition, isPrivilegedRole,
} from 'core';
import type { RequisitionMessage } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { RequisitionProgress } from '../../src/components/requisitions/RequisitionProgress';
import { RequisitionMessageCard } from '../../src/components/requisitions/RequisitionMessageCard';
import { RequisitionAttachments } from '../../src/components/requisitions/RequisitionAttachments';
import { AuditScoreBreakdown } from '../../src/components/requisitions/AuditScoreBreakdown';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Tab = 'chat' | 'attachments' | 'audit';
const DELETABLE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CHANGE_SUBMITTED'];

/**
 * Requisition detail as a chat thread, matching
 * apps/web/src/components/requisitions/RequisitionModal.tsx: top bar with the
 * PR number, a three-dot menu (Delete, when the status allows it), the
 * RequisitionProgress capsule bar, the Chat/Attachments/Audit Score tab
 * switcher, then whichever tab is active.
 */
export default function RequisitionDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { user, userRole } = useAuth();
    const scrollRef = useRef<ScrollView>(null);
    const [draft, setDraft] = useState('');
    const [actingOn, setActingOn] = useState<'APPROVE' | 'REJECT' | null>(null);
    const [tab, setTab] = useState<Tab>('chat');
    const [menuOpen, setMenuOpen] = useState(false);

    const { data: req, isLoading, isError, error } = useQuery({
        queryKey: ['requisitions', id],
        queryFn: () => requisitionService.getById(String(id)),
        enabled: !!id,
    });

    const { data: messagesData } = useQuery({
        queryKey: ['requisitions', id, 'messages'],
        queryFn: () => requisitionService.getMessages(String(id)),
        enabled: !!id && tab === 'chat',
        refetchInterval: 4000,
    });
    const messages: RequisitionMessage[] = messagesData ?? [];

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
        }
    }, [messages.length]);

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['requisitions', id] });
        qc.invalidateQueries({ queryKey: ['requisitions', id, 'messages'] });
        qc.invalidateQueries({ queryKey: ['requisitions'] });
    };

    const send = useMutation({
        mutationFn: (content: string) => requisitionService.sendMessage(String(id), content),
        onSuccess: () => { setDraft(''); refresh(); },
        onError: (e: Error) => Alert.alert('Message not sent', e.message),
    });

    const runAction = async (action: 'APPROVE' | 'REJECT') => {
        setActingOn(action);
        try {
            await requisitionService.sendMessage(String(id), action === 'APPROVE' ? 'Approved' : 'Rejected', 'CHAT', { isApprovalAction: true });
            await requisitionService.updateStatus(String(id), action === 'APPROVE' ? 'AUTHORISED' : 'REJECTED');
            refresh();
        } catch (e: any) {
            Alert.alert(`Could not ${action === 'APPROVE' ? 'approve' : 'reject'}`, e?.message ?? 'Please try again.');
        } finally {
            setActingOn(null);
        }
    };

    const deleteRequisition = () => {
        setMenuOpen(false);
        Alert.alert('Delete this request?', req?.description ?? '', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    try {
                        await requisitionService.delete(String(id));
                        qc.invalidateQueries({ queryKey: ['requisitions'] });
                        router.back();
                    } catch (e: any) {
                        Alert.alert('Could not delete', e?.message ?? 'Please try again.');
                    }
                },
            },
        ]);
    };

    const canAction = !!req && req.status === 'PENDING_APPROVAL'
        ? canAuthoriseRequisition(userRole)
        : isPrivilegedRole(userRole);
    const canDelete = !!req && DELETABLE_STATUSES.includes(req.status);

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back">
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerMain}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{req?.description || 'Loading…'}</Text>
                    {req && (
                        <View style={styles.headerMetaRow}>
                            <Text style={styles.headerMeta}>PR No. REQ-{req.id.slice(0, 8).toUpperCase()}</Text>
                            <View style={styles.headerDot} />
                            <Text style={styles.headerMeta} numberOfLines={1}>{req.requestor_name || 'System User'}</Text>
                        </View>
                    )}
                </View>
                <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} accessibilityLabel="More options">
                    <MoreVertical size={22} color={colors.text} />
                </Pressable>
            </View>

            {req && <RequisitionProgress currentStatus={req.status} isPrivileged={isPrivilegedRole(userRole)} />}

            {req && (
                <View style={styles.tabRow}>
                    {(['chat', 'attachments', 'audit'] as Tab[]).map((t) => (
                        <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                                {t === 'chat' ? 'Chat History' : t === 'attachments' ? 'Attachments' : 'Audit Score'}
                            </Text>
                            {t === 'audit' && req.audit_score != null && (
                                <View style={styles.auditScoreTag}>
                                    <Text style={styles.auditScoreTagText}>{Math.round(req.audit_score)}%</Text>
                                </View>
                            )}
                        </Pressable>
                    ))}
                </View>
            )}

            {isLoading && <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>}

            {isError && !isLoading && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn't load this request</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                </View>
            )}

            {req && tab === 'chat' && (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
                    <ScrollView ref={scrollRef} style={styles.thread} contentContainerStyle={styles.threadContent}>
                        {messages.length === 0 && (
                            <View style={styles.emptyThread}>
                                <Text style={styles.emptyThreadText}>ACTIVITY HISTORY</Text>
                            </View>
                        )}
                        {messages.map((m, i) => (
                            <RequisitionMessageCard
                                key={m.id}
                                message={m}
                                isOwn={m.user_id === user?.id}
                                isInitial={i === 0}
                                canAction={canAction}
                                requisitionData={req}
                                onApprove={() => runAction('APPROVE')}
                                onReject={() => runAction('REJECT')}
                                actingOn={actingOn}
                                onDisbursed={() => { refresh(); }}
                                onReceiptUploaded={() => { refresh(); }}
                            />
                        ))}
                    </ScrollView>

                    <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
                        <TextInput
                            style={styles.input}
                            value={draft}
                            onChangeText={setDraft}
                            placeholder="Message"
                            placeholderTextColor={colors.textFaint}
                            multiline
                        />
                        <Pressable
                            style={[styles.sendBtn, (!draft.trim() || send.isPending) && styles.sendBtnDisabled]}
                            onPress={() => send.mutate(draft.trim())}
                            disabled={!draft.trim() || send.isPending}
                            accessibilityLabel="Send message"
                        >
                            {send.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send size={16} color="#FFFFFF" />}
                        </Pressable>
                    </View>
                </KeyboardAvoidingView>
            )}

            {req && tab === 'attachments' && <RequisitionAttachments requisition={req} />}

            {req && tab === 'audit' && (
                <ScrollView style={styles.auditScroll} contentContainerStyle={styles.auditScrollContent}>
                    <AuditScoreBreakdown
                        score={req.audit_score ?? undefined}
                        breakdown={req.audit_score_breakdown ?? undefined}
                        accountedAt={req.accounted_at}
                        createdAt={req.created_at}
                        status={req.status}
                    />
                </ScrollView>
            )}

            <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
                <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
                    <View style={[styles.menuCard, { marginTop: insets.top + 56 }]}>
                        {canDelete ? (
                            <Pressable style={styles.menuItem} onPress={deleteRequisition}>
                                <Trash2 size={15} color={colors.danger} />
                                <Text style={styles.menuItemDangerText}>Delete Requisition</Text>
                            </Pressable>
                        ) : (
                            <Text style={styles.menuEmptyText}>No actions available</Text>
                        )}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface,
    },
    headerMain: { flex: 1, minWidth: 0 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    headerMeta: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    headerDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.borderStrong },
    tabRow: {
        flexDirection: 'row', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 4,
        borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4,
    },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.pill },
    tabBtnActive: { backgroundColor: colors.canvasAlt },
    tabBtnText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    tabBtnTextActive: { fontFamily: fonts.bodyBold, color: colors.text },
    auditScoreTag: { backgroundColor: colors.tabActiveBg, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
    auditScoreTagText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.blue },
    centre: { paddingVertical: 64, alignItems: 'center' },
    errorCard: {
        marginHorizontal: 20, marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.md,
        padding: 16, borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    thread: { flex: 1, backgroundColor: '#E6F2FE' },
    threadContent: { padding: 16, paddingBottom: 24 },
    emptyThread: { alignItems: 'center', paddingVertical: 60, opacity: 0.35 },
    emptyThreadText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue, letterSpacing: 2 },
    composer: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10,
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    },
    input: {
        flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, maxHeight: 110,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.canvasAlt,
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: colors.borderStrong },
    auditScroll: { flex: 1, backgroundColor: colors.canvasAlt },
    auditScrollContent: { padding: 20, paddingBottom: 40 },
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'flex-end' },
    menuCard: {
        marginRight: 16, minWidth: 200, backgroundColor: colors.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, paddingVertical: 6,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
    menuItemDangerText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.danger },
    menuEmptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, paddingHorizontal: 16, paddingVertical: 12 },
});
