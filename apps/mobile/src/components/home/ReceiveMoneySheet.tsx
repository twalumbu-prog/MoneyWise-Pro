import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { router } from 'expo-router';
import { X, Copy, Check, Share2, ArrowDownToLine } from 'lucide-react-native';
import { organizationService } from 'core';
import { WEB_ORIGIN } from '../../platform';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../theme/tokens';

/** Receive money: the person's own pay link as a QR code and a copyable / shareable link — anyone can pay it with mobile money. */
export const ReceiveMoneySheet: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const { organizationId } = useAuth();
    const [copied, setCopied] = useState(false);

    const { data: username, isLoading, isError, refetch } = useQuery({
        queryKey: ['quick-link-username', organizationId],
        queryFn: () => organizationService.getOrCreateQuickLinkUsername(),
        enabled: visible && !!organizationId,
    });
    const url = username ? `${WEB_ORIGIN}/pay/${username}` : '';

    useEffect(() => { if (!visible) setCopied(false); }, [visible]);

    const copy = async () => {
        if (!url) return;
        await Clipboard.setStringAsync(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                <View style={styles.handle} />
                <View style={styles.header}>
                    <Text style={styles.title}>Receive money</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                </View>

                <View style={styles.body}>
                    {isLoading ? (
                        <View style={styles.centre}><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>Getting your pay link…</Text></View>
                    ) : isError || !url ? (
                        <View style={styles.centre}>
                            <Text style={styles.muted}>We couldn’t get your pay link.</Text>
                            <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.lead}>Share this link or let someone scan it to pay you.</Text>
                            <View style={styles.qrWrap}>
                                <QRCode value={url} size={176} color="#020617" backgroundColor="#FFFFFF" />
                            </View>
                            <View style={styles.linkBox}>
                                <Text style={styles.link} numberOfLines={1} selectable>{url.replace(/^https?:\/\//, '')}</Text>
                            </View>
                            <View style={styles.actions}>
                                <Pressable onPress={copy} style={({ pressed }) => [styles.btn, styles.btnLight, pressed && { opacity: 0.8 }]}>
                                    {copied ? <Check size={16} color={colors.positiveInk} /> : <Copy size={16} color={colors.navy} />}
                                    <Text style={styles.btnLightText}>{copied ? 'Copied' : 'Copy link'}</Text>
                                </Pressable>
                                <Pressable onPress={() => { void Share.share({ message: `Pay me on MoneyWise: ${url}`, url }); }} style={({ pressed }) => [styles.btn, styles.btnDark, pressed && { opacity: 0.85 }]}>
                                    <Share2 size={16} color="#FFFFFF" />
                                    <Text style={styles.btnDarkText}>Share</Text>
                                </Pressable>
                            </View>
                            {/* Putting money in yourself: the same deposit flow as the Wallet page. */}
                            <Pressable
                                onPress={() => { onClose(); router.push('/wallet/deposit'); }}
                                style={({ pressed }) => [styles.btn, styles.btnDeposit, pressed && { opacity: 0.8 }]}
                                accessibilityRole="button"
                            >
                                <ArrowDownToLine size={16} color="#FFFFFF" />
                                <Text style={styles.btnDepositText}>Deposit money</Text>
                            </Pressable>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    title: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: 24, paddingTop: 20, alignItems: 'center' },
    centre: { alignItems: 'center', gap: 12, paddingVertical: 36 },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    lead: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textMuted, textAlign: 'center', marginBottom: 18 },
    qrWrap: { padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#FFFFFF' },
    linkBox: { alignSelf: 'stretch', marginTop: 18, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border },
    link: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 16 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill },
    btnLight: { backgroundColor: colors.chipActiveBg },
    btnLightText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    btnDark: { backgroundColor: colors.blue },
    btnDarkText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    btnDeposit: { alignSelf: 'stretch', flex: 0, marginTop: 12, backgroundColor: '#000000' },
    btnDepositText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
});
