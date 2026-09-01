import { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Modal,
    ScrollView, Alert,
} from 'react-native';
import {
    ArrowUp, Square, ChevronDown, Check, Paperclip, Mic, X,
} from 'lucide-react-native';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { AssistantModel } from 'core';
import { VendorLogo } from './VendorLogos';
import { colors, radius, fonts } from '../../theme/tokens';

const TIER_BG: Record<string, string> = { fast: '#ECFDF5', balanced: colors.tabActiveBg, deep: '#FAF5FF' };
const TIER_FG: Record<string, string> = { fast: '#059669', balanced: colors.blue, deep: '#9333EA' };

export interface ComposerAttachment {
    path: string;
    filename: string;
}

/**
 * Matches the web composer's actual shape: one rounded card with the textarea
 * on top and a control row underneath (model picker left, attach/mic/send
 * right) — not a pill input beside a lone circular button.
 */
export const Composer: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop?: () => void;
    busy: boolean;
    models: AssistantModel[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    attachment: ComposerAttachment | null;
    attaching: boolean;
    onAttach: () => void;
    onRemoveAttachment: () => void;
}> = ({
    value, onChange, onSend, onStop, busy,
    models, selectedModel, onSelectModel,
    attachment, attaching, onAttach, onRemoveAttachment,
}) => {
    const canSend = (value.trim().length > 0 || !!attachment) && !busy;
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [listening, setListening] = useState(false);
    const baseTextRef = useRef('');

    const active = models.find((m) => m.id === selectedModel);

    // ── Dictation ────────────────────────────────────────────────────────────
    // expo-speech-recognition, not the Web Speech API web uses — there is no
    // browser here. Same idea: interim results replace what was dictated so
    // far, appended after whatever text existed before recording started.
    useSpeechRecognitionEvent('result', (event) => {
        const transcript = event.results[0]?.transcript ?? '';
        const prefix = baseTextRef.current;
        onChange(prefix ? `${prefix} ${transcript}` : transcript);
    });
    useSpeechRecognitionEvent('error', () => setListening(false));
    useSpeechRecognitionEvent('end', () => setListening(false));

    useEffect(() => () => {
        if (listening) ExpoSpeechRecognitionModule.stop();
    }, [listening]);

    const toggleDictation = async () => {
        if (listening) {
            ExpoSpeechRecognitionModule.stop();
            setListening(false);
            return;
        }
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
            Alert.alert(
                'Microphone access needed',
                'MoneyWise needs microphone and speech recognition access to dictate a question. Enable it in Settings > MoneyWise.',
            );
            return;
        }
        baseTextRef.current = value;
        ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
        });
        setListening(true);
    };

    return (
        <View style={styles.card}>
            {(attachment || attaching) && (
                <View style={styles.attachmentRow}>
                    <View style={styles.attachmentPill}>
                        {attaching
                            ? <ActivityIndicator size="small" color={colors.blue} />
                            : <Paperclip size={12} color={colors.blue} />}
                        <Text style={styles.attachmentText} numberOfLines={1}>
                            {attaching ? 'Uploading…' : attachment?.filename}
                        </Text>
                        {!attaching && (
                            <Pressable onPress={onRemoveAttachment} hitSlop={8}>
                                <X size={11} color={colors.blue} />
                            </Pressable>
                        )}
                    </View>
                </View>
            )}

            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                placeholder="Ask about your finances, or ask me to make a change…"
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={4000}
            />

            <View style={styles.controlRow}>
                <Pressable
                    style={styles.modelBtn}
                    onPress={() => setModelMenuOpen(true)}
                    disabled={models.length === 0}
                >
                    {active && <VendorLogo vendor={active.vendor} size={14} />}
                    <Text style={styles.modelBtnText} numberOfLines={1}>{active?.label ?? 'Model'}</Text>
                    <ChevronDown size={12} color={colors.textFaint} />
                </Pressable>

                <View style={styles.rightActions}>
                    {!busy && !attachment && !attaching && (
                        <Pressable style={styles.iconBtn} onPress={onAttach} accessibilityLabel="Attach a bank statement">
                            <Paperclip size={15} color={colors.textMuted} />
                        </Pressable>
                    )}
                    {!busy && (
                        <Pressable
                            style={[styles.iconBtn, listening && styles.iconBtnListening]}
                            onPress={toggleDictation}
                            accessibilityLabel={listening ? 'Stop dictation' : 'Dictate'}
                        >
                            <Mic size={15} color={listening ? '#FFFFFF' : colors.textMuted} />
                        </Pressable>
                    )}
                    {busy ? (
                        <Pressable style={[styles.send, styles.stop]} onPress={onStop} accessibilityLabel="Stop generating">
                            <Square size={13} color="#FFFFFF" fill="#FFFFFF" />
                        </Pressable>
                    ) : (
                        <Pressable
                            style={[styles.send, !canSend && styles.sendDisabled]}
                            onPress={onSend}
                            disabled={!canSend}
                            accessibilityLabel="Send"
                        >
                            <ArrowUp size={17} color="#FFFFFF" />
                        </Pressable>
                    )}
                </View>
            </View>

            <Modal visible={modelMenuOpen} transparent animationType="fade" onRequestClose={() => setModelMenuOpen(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setModelMenuOpen(false)}>
                    <View style={styles.modelSheet}>
                        <Text style={styles.modelSheetTitle}>Model</Text>
                        <ScrollView style={{ maxHeight: 360 }}>
                            {models.map((m) => (
                                <Pressable
                                    key={m.id}
                                    onPress={() => { onSelectModel(m.id); setModelMenuOpen(false); }}
                                    style={[styles.modelRow, m.id === selectedModel && styles.modelRowActive]}
                                >
                                    <View style={styles.modelRowLogo}><VendorLogo vendor={m.vendor} size={18} /></View>
                                    <View style={styles.modelRowMain}>
                                        <View style={styles.modelRowTop}>
                                            <Text style={styles.modelRowLabel} numberOfLines={1}>{m.label}</Text>
                                            <View style={[styles.tierPill, { backgroundColor: TIER_BG[m.tier] ?? colors.canvasAlt }]}>
                                                <Text style={[styles.tierPillText, { color: TIER_FG[m.tier] ?? colors.textMuted }]}>
                                                    {m.tier}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.modelRowBlurb} numberOfLines={2}>{m.blurb}</Text>
                                    </View>
                                    {m.id === selectedModel && <Check size={15} color={colors.blue} />}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 16, marginTop: 8,
        borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    attachmentRow: { paddingHorizontal: 16, paddingTop: 12 },
    attachmentPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5,
    },
    attachmentText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue, maxWidth: 200 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 21,
        paddingHorizontal: 18, paddingTop: 15, paddingBottom: 6, maxHeight: 140,
    },
    controlRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2, gap: 8,
    },
    modelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, flexShrink: 1 },
    modelBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, flexShrink: 1 },
    rightActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconBtn: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt,
        alignItems: 'center', justifyContent: 'center',
    },
    iconBtnListening: { backgroundColor: '#EF4444' },
    send: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.3 },
    stop: { backgroundColor: colors.navy },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    modelSheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 16, paddingBottom: 32,
    },
    modelSheetTitle: {
        fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
        color: colors.textFaint, marginBottom: 8, paddingHorizontal: 8,
    },
    modelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: radius.md },
    modelRowActive: { backgroundColor: colors.tabActiveBg },
    modelRowLogo: { marginTop: 2 },
    modelRowMain: { flex: 1 },
    modelRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    modelRowLabel: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    tierPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tierPillText: { fontFamily: fonts.bodyBold, fontSize: 9, textTransform: 'uppercase' },
    modelRowBlurb: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
});
