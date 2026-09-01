import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { requisitionService, formatRelative } from 'core';
import type { RequisitionMessage } from 'core';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * The requisition conversation. SYSTEM entries are the audit trail the approval
 * chain writes (status changes, OCR results); CHAT entries are people talking.
 * They are rendered differently on purpose — the web thread does the same, and
 * conflating them would make an automated note look like a colleague's comment.
 */
export const RequisitionThread: React.FC<{ requisitionId: string }> = ({ requisitionId }) => {
    const qc = useQueryClient();
    const { user } = useAuth();
    const [draft, setDraft] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['requisitions', requisitionId, 'messages'],
        queryFn: () => requisitionService.getMessages(requisitionId),
    });

    const send = useMutation({
        mutationFn: (content: string) => requisitionService.sendMessage(requisitionId, content),
        onSuccess: () => {
            setDraft('');
            qc.invalidateQueries({ queryKey: ['requisitions', requisitionId, 'messages'] });
        },
        onError: (e: Error) => Alert.alert('Message not sent', e.message),
    });

    const messages: RequisitionMessage[] = data ?? [];

    return (
        <View style={styles.root}>
            <Text style={styles.sectionTitle}>Activity</Text>

            {isLoading && <ActivityIndicator color={colors.blue} style={styles.loading} />}

            {!isLoading && messages.length === 0 && (
                <Text style={styles.empty}>No activity yet.</Text>
            )}

            {messages.map((m) => {
                const isSystem = m.message_type === 'SYSTEM';
                const isMine = !isSystem && m.user_id === user?.id;
                return (
                    <View key={m.id} style={[styles.msg, isSystem && styles.msgSystem]}>
                        {!isSystem && (
                            <Text style={styles.author}>
                                {isMine ? 'You' : m.user_name || 'Someone'}
                                <Text style={styles.time}>  {formatRelative(m.created_at)}</Text>
                            </Text>
                        )}
                        <Text style={[styles.body, isSystem && styles.bodySystem]}>{m.content}</Text>
                        {isSystem && <Text style={styles.timeSystem}>{formatRelative(m.created_at)}</Text>}
                    </View>
                );
            })}

            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Add a comment"
                    placeholderTextColor={colors.textFaint}
                    multiline
                />
                <Pressable
                    style={[styles.send, (!draft.trim() || send.isPending) && styles.sendDisabled]}
                    onPress={() => send.mutate(draft.trim())}
                    disabled={!draft.trim() || send.isPending}
                    accessibilityLabel="Send comment"
                >
                    {send.isPending
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Send size={17} color="#FFFFFF" />}
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 10 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    loading: { marginVertical: 12 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, paddingVertical: 8 },
    msg: { paddingVertical: 8, gap: 3 },
    msgSystem: {
        backgroundColor: colors.canvasAlt, borderRadius: radius.sm,
        paddingHorizontal: 12, paddingVertical: 9,
    },
    author: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    time: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    timeSystem: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    body: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
    bodySystem: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
    input: {
        flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, maxHeight: 110,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    send: {
        width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
});
