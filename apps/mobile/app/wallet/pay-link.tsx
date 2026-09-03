import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Image, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Store, Zap, Copy, Check, ExternalLink } from 'lucide-react-native';
import { organizationService } from 'core';
import { WEB_ORIGIN } from '../../src/platform';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Tab = 'store' | 'quickpay';

/**
 * Native port of apps/web/src/components/ShareWalletLinkModal.tsx: Store vs
 * Quick Pay tabs, logo + QR, copyable link, open-portal action. Web's
 * canvas-drawn "Scan to Pay" download card and the OTP-Link CTA (which opens
 * a full invoice-builder screen this app doesn't have yet) are left out —
 * Copy + Open portal cover the same job on a phone, where "download a QR
 * image" isn't a natural action to begin with.
 */
export default function PayLinkScreen() {
    const { walletId, walletName } = useLocalSearchParams<{ walletId: string; walletName?: string }>();
    const [tab, setTab] = useState<Tab>('store');
    const [copied, setCopied] = useState(false);

    const { data: org } = useQuery({ queryKey: ['organization'], queryFn: () => organizationService.getOrganization() });
    const {
        data: quickLinkUsername, isLoading: quickLinkLoading, isError: quickLinkErrored, refetch: retryQuickLink,
    } = useQuery({
        queryKey: ['quick-link-username'],
        queryFn: () => organizationService.getOrCreateQuickLinkUsername(),
    });

    const storeUrl = walletId ? `${WEB_ORIGIN}/pay/${walletId}` : '';
    const quickPayUrl = quickLinkUsername ? `${WEB_ORIGIN}/pay/${quickLinkUsername}` : '';
    const displayUrl = tab === 'store' ? storeUrl : quickPayUrl;

    useEffect(() => { setCopied(false); }, [tab]);

    const handleCopy = async () => {
        if (!displayUrl) return;
        await Clipboard.setStringAsync(displayUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const orgInitial = (org?.name || walletName || 'B').charAt(0).toUpperCase();

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Share Pay Links" />

            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.walletName}>{walletName}</Text>

                <View style={styles.tabRow}>
                    <Pressable style={[styles.tabBtn, tab === 'store' && styles.tabBtnActive]} onPress={() => setTab('store')}>
                        <Store size={15} color={tab === 'store' ? colors.text : colors.textFaint} />
                        <Text style={[styles.tabText, tab === 'store' && styles.tabTextActive]}>Store</Text>
                    </Pressable>
                    <Pressable style={[styles.tabBtn, tab === 'quickpay' && styles.tabBtnActive]} onPress={() => setTab('quickpay')}>
                        <Zap size={15} color={tab === 'quickpay' ? colors.text : colors.textFaint} />
                        <Text style={[styles.tabText, tab === 'quickpay' && styles.tabTextActive]}>Quick Pay</Text>
                    </Pressable>
                </View>

                {tab === 'quickpay' && quickLinkLoading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator color={colors.blue} />
                        <Text style={styles.mutedText}>Generating your Quick Pay link…</Text>
                    </View>
                ) : tab === 'quickpay' && (quickLinkErrored || !quickPayUrl) ? (
                    <View style={styles.centerBox}>
                        <Text style={styles.errorText}>Couldn't generate your Quick Link.</Text>
                        <Pressable style={styles.retryBtn} onPress={() => retryQuickLink()}>
                            <Text style={styles.retryBtnText}>Try again</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View style={styles.qrCard}>
                            {org?.logo_url ? (
                                <Image source={{ uri: org.logo_url }} style={styles.logo} />
                            ) : (
                                <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{orgInitial}</Text></View>
                            )}
                            {displayUrl ? (
                                <QRCode value={displayUrl} size={180} color="#020617" backgroundColor="#FFFFFF" />
                            ) : (
                                <View style={{ width: 180, height: 180 }} />
                            )}
                        </View>

                        <View style={styles.linkRow}>
                            <TextInput style={styles.linkInput} value={displayUrl} editable={false} numberOfLines={1} />
                            <Pressable style={[styles.copyBtn, copied && styles.copyBtnDone]} onPress={handleCopy}>
                                {copied ? <Check size={13} color="#FFFFFF" /> : <Copy size={13} color="#FFFFFF" />}
                                <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
                            </Pressable>
                        </View>

                        <Pressable
                            style={styles.openBtn}
                            onPress={() => displayUrl && Linking.openURL(displayUrl)}
                            disabled={!displayUrl}
                        >
                            <Text style={styles.openBtnText}>{tab === 'store' ? 'Open payment portal' : 'Open Quick Pay link'}</Text>
                            <ExternalLink size={14} color={colors.text} />
                        </Pressable>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 16, alignItems: 'stretch' },
    walletName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: -4 },
    tabRow: {
        flexDirection: 'row', gap: 4, backgroundColor: colors.canvasAlt, borderRadius: radius.pill, padding: 4,
    },
    tabBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: radius.pill,
    },
    tabBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    tabText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textFaint },
    tabTextActive: { color: colors.text },
    centerBox: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 60 },
    mutedText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger },
    retryBtn: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
    retryBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    qrCard: {
        alignItems: 'center', gap: 14, alignSelf: 'center', padding: 20,
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    },
    logo: { width: 40, height: 40, borderRadius: 10 },
    logoFallback: {
        width: 40, height: 40, borderRadius: 10, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    logoFallbackText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    linkRow: { position: 'relative', justifyContent: 'center' },
    linkInput: {
        fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted,
        backgroundColor: colors.canvasAlt, borderRadius: radius.lg,
        paddingLeft: 16, paddingRight: 92, paddingVertical: 14, borderWidth: 1, borderColor: colors.border,
    },
    copyBtn: {
        position: 'absolute', right: 6, flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: colors.navy, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9,
    },
    copyBtnDone: { backgroundColor: '#10B981' },
    copyBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    openBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 14,
    },
    openBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
});
